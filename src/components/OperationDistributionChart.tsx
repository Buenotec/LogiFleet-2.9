import React, { useState, useMemo } from "react";
import { 
  ResponsiveContainer, 
  ComposedChart, 
  Bar, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  LabelList, 
  Cell 
} from "recharts";
import { 
  ArrowUp, 
  ArrowDown, 
  ChevronsDown, 
  GitFork, 
  RotateCcw,
  Layers,
  ChevronRight,
  Info
} from "lucide-react";
import { Vehicle } from "../types";
import { ChartContainer3D, ChartTooltip3D, AnimatedChartCursor } from "./ChartComponents3D";
import { cn } from "../lib/utils";

/**
 * Níveis de Hierarquia clássicos do Power BI:
 * 
 * Nível 1: Operação (Padrão/Default idêntico ao original)
 *   -> Distribuição por Operação (Veículos por base)
 * 
 * Ações Power BI disponíveis no cabeçalho:
 * 1. [Drill Up - Seta para Cima]: Volta um nível na hierarquia
 * 2. [Drill Mode - Seta para Baixo Ativável]: Quando ativo, clicar em uma barra específica (ex: "CURITIBA")
 *    faz drill-down filtrado para as licenças DAQUELA barra: "Operação > Tipo de Licença" (ex: Curitiba / CRLV, AET, etc.)
 * 3. [Next Level - Seta Dupla para Baixo "Go to next level"]: Desce todos para o próximo nível hierárquico
 *    (ex: visualiza a distribuição por "Tipo de Licença" diretamente)
 * 4. [Expand All Down - Bifurcação / "Expand all down one level"]: Concatena a hierarquia mantendo o contexto
 *    (ex: "CURITIBA - CRLV", "CURITIBA - AET", etc.)
 * 5. [Reset / Voltar ao Padrão]
 */

export type PowerBIHierarchyLevel = 
  | "operation"            // Nível 1 (Default): Operação (veículos por base)
  | "license_type"          // Nível 2 (Next level): Tipo de Licença
  | "operation_single_drill"// Drill-down em uma operação específica
  | "operation_expanded";   // Expandir todos os níveis (Operação + Tipo de Licença concatenados)

interface OperationDistributionChartProps {
  vehicles: Vehicle[];
  operations: string[];
  className?: string;
}

export const OperationDistributionChart: React.FC<OperationDistributionChartProps> = ({
  vehicles,
  operations,
  className = "lg:col-span-5"
}) => {
  // Nível da hierarquia (default: "operation" - exatamente o que já tinha antes)
  const [level, setLevel] = useState<PowerBIHierarchyLevel>("operation");

  // Modo de Drill-down ativado (como no Power BI: ícone de seta para baixo com círculo ativo)
  const [isDrillModeActive, setIsDrillModeActive] = useState<boolean>(false);

  // Operação selecionada quando o usuário clica em uma barra com drill down ativado
  const [drillOperation, setDrillOperation] = useState<string>("");

  // Operações ativas com dados
  const activeOperations = useMemo(() => {
    let ops = operations.filter(op => vehicles.some(v => v.operation === op));
    if (ops.length === 0 && vehicles.length > 0) {
      ops = Array.from(new Set(vehicles.map(v => v.operation))).filter(Boolean) as string[];
    }
    return ops;
  }, [operations, vehicles]);

  // 1. Dados Nível 1: Por Operação (Exatamente a lógica e visual original)
  const defaultOperationData = useMemo(() => {
    return activeOperations.map(op => ({
      name: op,
      rawName: op,
      count: vehicles.filter(v => v.operation === op).length,
      total: vehicles.length
    })).filter(d => d.count > 0);
  }, [activeOperations, vehicles]);

  // 2. Dados Nível 2 (Next Level): Por Tipo de Licença (Consolidado de todas as licenças)
  const licenseTypeData = useMemo(() => {
    const docCounts: Record<string, number> = {};
    let totalDocs = 0;

    vehicles.forEach(v => {
      v.documents?.forEach(d => {
        if (!d.type) return;
        const type = d.type.trim();
        docCounts[type] = (docCounts[type] || 0) + 1;
        totalDocs++;
      });
    });

    return Object.entries(docCounts)
      .map(([type, count]) => ({
        name: type,
        rawName: type,
        count,
        total: totalDocs
      }))
      .sort((a, b) => b.count - a.count);
  }, [vehicles]);

  // 3. Dados Drilldown de Operação Única (ex: ao clicar na base Curitiba com drill-down)
  const singleOperationDrillData = useMemo(() => {
    if (!drillOperation) return [];
    const opVehicles = vehicles.filter(v => v.operation === drillOperation);
    const docCounts: Record<string, number> = {};
    let totalDocs = 0;

    opVehicles.forEach(v => {
      v.documents?.forEach(d => {
        if (!d.type) return;
        const type = d.type.trim();
        docCounts[type] = (docCounts[type] || 0) + 1;
        totalDocs++;
      });
    });

    const displayOp = drillOperation === "DOC_SISTEMA" ? "GLOBUS" : drillOperation;

    return Object.entries(docCounts)
      .map(([type, count]) => ({
        name: type,
        rawName: type,
        opName: displayOp,
        count,
        total: totalDocs
      }))
      .sort((a, b) => b.count - a.count);
  }, [drillOperation, vehicles]);

  // 4. Dados Expandir Todos os Níveis (Operação + Tipo de Licença)
  const expandedAllData = useMemo(() => {
    const map: Record<string, { op: string; type: string; count: number }> = {};
    let total = 0;

    vehicles.forEach(v => {
      const opName = v.operation === "DOC_SISTEMA" ? "GLOBUS" : (v.operation || "-");
      v.documents?.forEach(d => {
        if (!d.type) return;
        const type = d.type.trim();
        const key = `${opName} • ${type}`;
        if (!map[key]) {
          map[key] = { op: opName, type, count: 0 };
        }
        map[key].count++;
        total++;
      });
    });

    return Object.entries(map)
      .map(([key, info]) => ({
        name: key,
        rawName: key,
        count: info.count,
        total
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 20); // Top 20 combinações mais representativas para legibilidade do gráfico
  }, [vehicles]);

  // Determinar o dataset atual baseado no nível
  const chartData = useMemo(() => {
    switch (level) {
      case "license_type":
        return licenseTypeData;
      case "operation_single_drill":
        return singleOperationDrillData;
      case "operation_expanded":
        return expandedAllData;
      case "operation":
      default:
        return defaultOperationData;
    }
  }, [level, defaultOperationData, licenseTypeData, singleOperationDrillData, expandedAllData]);

  // Metadados visuais (título, legenda, unidade, cores)
  const meta = useMemo(() => {
    switch (level) {
      case "license_type":
        return {
          title: "Distribuição por Tipo de Licença",
          subtitle: "Hierarquia Nível 2: Consolidado de Licenças",
          legendBadge: "LICENÇAS",
          badgeColor: "#a855f7",
          unit: "licenças",
          lineColor: "#c084fc",
          barColor: "#a855f7",
          barGradientId: "neonBarGradientPurple"
        };
      case "operation_single_drill": {
        const opLabel = drillOperation === "DOC_SISTEMA" ? "GLOBUS" : drillOperation;
        return {
          title: `Licenças: ${opLabel}`,
          subtitle: `Drill-down: Operação ➔ Tipos de Licença`,
          legendBadge: "LICENÇAS",
          badgeColor: "#ec4899",
          unit: "licenças",
          lineColor: "#f472b6",
          barColor: "#ec4899",
          barGradientId: "neonBarGradientPink"
        };
      }
      case "operation_expanded":
        return {
          title: "Distribuição: Operação e Tipo de Licença",
          subtitle: "Hierarquia Expandida: Base • Licença (Top 20)",
          legendBadge: "CONJUNTO",
          badgeColor: "#38bdf8",
          unit: "licenças",
          lineColor: "#818cf8",
          barColor: "#38bdf8",
          barGradientId: "neonBarGradientLic"
        };
      case "operation":
      default:
        return {
          title: "Distribuição por Operação",
          subtitle: "Veículos por Base Operacional",
          legendBadge: "VEÍCULOS",
          badgeColor: "#38bdf8",
          unit: "veículos",
          lineColor: "#818cf8",
          barColor: "#38bdf8",
          barGradientId: "neonBarGradientLic"
        };
    }
  }, [level, drillOperation]);

  // Ações da Barra de Ferramentas de Hierarquia (estilo Power BI)
  const handleDrillUp = () => {
    // Volta para o nível superior (default: "operation")
    setLevel("operation");
    setDrillOperation("");
  };

  const handleNextLevel = () => {
    // Seta dupla para baixo: "Ir para o próximo nível na hierarquia"
    if (level === "operation") {
      setLevel("license_type");
    } else if (level === "license_type") {
      setLevel("operation");
    } else {
      setLevel("license_type");
    }
  };

  const handleExpandAllDown = () => {
    // Bifurcação: "Expandir todos os campos um nível para baixo na hierarquia"
    if (level === "operation_expanded") {
      setLevel("operation");
    } else {
      setLevel("operation_expanded");
    }
  };

  const handleToggleDrillMode = () => {
    setIsDrillModeActive(prev => !prev);
  };

  // Clique em uma barra do gráfico
  const handleBarClick = (data: any) => {
    if (!data) return;
    const targetOp = data.rawName || data.name || data.payload?.rawName || data.payload?.name || (typeof data === 'string' ? data : null);
    if (targetOp && level === "operation") {
      setDrillOperation(targetOp);
      setLevel("operation_single_drill");
    }
  };

  const canDrillUp = level !== "operation";

  return (
    <ChartContainer3D
      title={meta.title}
      subtitle={meta.subtitle}
      legendBadge={meta.legendBadge}
      badgeColor={meta.badgeColor}
      className={className}
      headerRight={
        /* Barra de Controle de Hierarquia no Estilo Power BI */
        <div className="flex items-center gap-1 bg-slate-900/90 border border-slate-700/80 p-1 rounded-xl shadow-lg backdrop-blur-md">
          {/* 1. Drill Up (Seta para cima) */}
          <button
            type="button"
            disabled={!canDrillUp}
            onClick={handleDrillUp}
            className={cn(
              "p-1.5 rounded-lg text-xs font-bold transition-all flex items-center justify-center",
              canDrillUp
                ? "bg-slate-800 text-cyan-400 hover:bg-cyan-500/20 hover:text-cyan-300 cursor-pointer shadow-sm"
                : "text-slate-600 cursor-not-allowed opacity-40"
            )}
            title={canDrillUp ? "Fazer drill up (Voltar ao nível anterior)" : "Você já está no nível mais alto"}
          >
            <ArrowUp size={14} strokeWidth={2.5} />
          </button>

          {/* 2. Drill Mode Toggle (Seta para baixo com indicador de clique para drilldown) */}
          <button
            type="button"
            onClick={handleToggleDrillMode}
            className={cn(
              "p-1.5 rounded-lg text-xs font-bold transition-all flex items-center justify-center cursor-pointer",
              isDrillModeActive
                ? "bg-cyan-500/30 text-cyan-300 border border-cyan-400 shadow-[0_0_10px_rgba(6,182,212,0.4)]"
                : "bg-slate-800/80 text-slate-300 hover:bg-slate-700 hover:text-white"
            )}
            title={
              isDrillModeActive
                ? "Modo Drill-down ativado: clique numa barra para expandir"
                : "Ativar modo Drill-down (clique em uma barra para detalhar)"
            }
          >
            <ArrowDown size={14} strokeWidth={2.5} />
          </button>

          {/* 3. Go to next level (Duas setas para baixo / Próximo nível: Tipo de Licença) */}
          <button
            type="button"
            onClick={handleNextLevel}
            className={cn(
              "p-1.5 rounded-lg text-xs font-bold transition-all flex items-center justify-center cursor-pointer",
              level === "license_type"
                ? "bg-purple-500/30 text-purple-300 border border-purple-400 shadow-[0_0_10px_rgba(168,85,247,0.4)]"
                : "bg-slate-800/80 text-slate-300 hover:bg-slate-700 hover:text-white"
            )}
            title="Ir para o próximo nível na hierarquia (Tipo de Licença)"
          >
            <ChevronsDown size={14} strokeWidth={2.5} />
          </button>

          {/* 4. Expand all down one level (Bifurcação / Expandir todos os níveis) */}
          <button
            type="button"
            onClick={handleExpandAllDown}
            className={cn(
              "p-1.5 rounded-lg text-xs font-bold transition-all flex items-center justify-center cursor-pointer",
              level === "operation_expanded"
                ? "bg-emerald-500/30 text-emerald-300 border border-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.4)]"
                : "bg-slate-800/80 text-slate-300 hover:bg-slate-700 hover:text-white"
            )}
            title="Expandir todos os campos um nível para baixo na hierarquia (Operação + Licença)"
          >
            <GitFork size={14} strokeWidth={2.5} />
          </button>

          {/* 5. Reset to default (se estiver fora do default) */}
          {level !== "operation" && (
            <button
              type="button"
              onClick={handleDrillUp}
              className="p-1.5 rounded-lg text-xs font-bold text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition-all cursor-pointer ml-0.5"
              title="Restaurar visualização padrão (Distribuição por Operação)"
            >
              <RotateCcw size={13} />
            </button>
          )}
        </div>
      }
    >
      <div className="w-full h-full flex flex-col justify-between" style={{ minHeight: '380px' }}>
        {/* Sub-barra com breadcrumbs e indicação contextual do Power BI */}
        <div className="mb-2 shrink-0 flex items-center justify-between px-1 text-[11px] text-slate-400">
          <div className="flex items-center gap-1.5">
            <span className="font-semibold text-slate-300">Hierarquia:</span>
            {level === "operation" ? (
              <span className="text-cyan-400 font-bold flex items-center gap-1">
                <span>Operação</span>
                <span className="text-slate-500 text-[10px]">(Padrão)</span>
              </span>
            ) : level === "license_type" ? (
              <div className="flex items-center gap-1">
                <span className="text-slate-400">Operação</span>
                <ChevronRight size={12} className="text-slate-600" />
                <span className="text-purple-400 font-bold">Tipo de Licença</span>
              </div>
            ) : level === "operation_single_drill" ? (
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={handleDrillUp}
                  className="text-slate-400 hover:text-cyan-400 underline cursor-pointer"
                >
                  Todas as Operações
                </button>
                <ChevronRight size={12} className="text-slate-600" />
                <span className="text-pink-400 font-bold">
                  {drillOperation === "DOC_SISTEMA" ? "GLOBUS" : drillOperation}
                </span>
              </div>
            ) : (
              <div className="flex items-center gap-1">
                <span className="text-emerald-400 font-bold">Operação • Tipo de Licença (Expandido)</span>
              </div>
            )}
          </div>

          {/* Dica interativa estilo Power BI */}
          {level === "operation" && (
            <div className="hidden sm:flex items-center gap-1 text-[10px] text-slate-400">
              <Info size={11} className="text-cyan-400" />
              <span>Clique numa barra para detalhar ou use os botões acima</span>
            </div>
          )}
        </div>

        {/* Gráfico Composed Chart com estética 3D idêntica ao original */}
        <div className="w-full flex-1 relative" style={{ height: '350px', minHeight: '320px' }}>
          {chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%" minHeight={320}>
              <ComposedChart
                data={chartData}
                margin={{ top: 22, right: 14, left: -22, bottom: level === "operation_expanded" ? 64 : 44 }}
              >
                <defs>
                  {/* Gradiente Ciano/Azul (Original) */}
                  <linearGradient id="neonBarGradientLic" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#38bdf8" stopOpacity={0.95} />
                    <stop offset="50%" stopColor="#2563eb" stopOpacity={0.65} />
                    <stop offset="100%" stopColor="#1e3a8a" stopOpacity={0.15} />
                  </linearGradient>

                  {/* Gradiente Roxo (Próximo nível: Tipos de Licença) */}
                  <linearGradient id="neonBarGradientPurple" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#c084fc" stopOpacity={0.95} />
                    <stop offset="50%" stopColor="#9333ea" stopOpacity={0.65} />
                    <stop offset="100%" stopColor="#581c87" stopOpacity={0.15} />
                  </linearGradient>

                  {/* Gradiente Rosa (Drill down específico) */}
                  <linearGradient id="neonBarGradientPink" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#f472b6" stopOpacity={0.95} />
                    <stop offset="50%" stopColor="#db2777" stopOpacity={0.65} />
                    <stop offset="100%" stopColor="#831843" stopOpacity={0.15} />
                  </linearGradient>
                </defs>

                <CartesianGrid
                  strokeDasharray="4 4"
                  vertical={false}
                  stroke="rgba(255, 255, 255, 0.08)"
                />

                <XAxis
                  dataKey="name"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 9, fill: "#94a3b8", fontWeight: 700 }}
                  interval={0}
                  angle={-35}
                  textAnchor="end"
                  height={level === "operation_expanded" ? 70 : 50}
                />

                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 10, fill: "#64748b", fontWeight: 600 }}
                />

                <Tooltip
                  content={<ChartTooltip3D unit={meta.unit} />}
                  cursor={<AnimatedChartCursor />}
                />

                <Bar
                  dataKey="count"
                  radius={[8, 8, 0, 0]}
                  barSize={28}
                  fill={`url(#${meta.barGradientId})`}
                  stroke={meta.barColor}
                  strokeWidth={1}
                  className={level === "operation" ? "cursor-pointer hover:opacity-90" : ""}
                  onClick={handleBarClick}
                >
                  <LabelList
                    dataKey="count"
                    position="top"
                    style={{ fontSize: "10px", fontWeight: "900", fill: meta.lineColor }}
                  />
                  {chartData.map((entry, index) => (
                    <Cell
                      key={`cell-${index}`}
                      className={level === "operation" ? "cursor-pointer hover:brightness-125 transition-all" : ""}
                      onClick={() => handleBarClick(entry)}
                    />
                  ))}
                </Bar>

                <Line
                  type="monotone"
                  dataKey="count"
                  stroke={meta.lineColor}
                  strokeWidth={3}
                  dot={{ r: 4.5, fill: "#ffffff", strokeWidth: 2.5, stroke: meta.barColor }}
                  activeDot={{ r: 7, fill: meta.barColor, stroke: "#ffffff", strokeWidth: 2 }}
                />
              </ComposedChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-full min-h-[300px] flex items-center justify-center text-slate-400 text-sm">
              Nenhum dado disponível
            </div>
          )}
        </div>
      </div>
    </ChartContainer3D>
  );
};
