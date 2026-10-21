import React, { useState, useMemo } from "react";
import { createPortal } from "react-dom";
import { motion } from "motion/react";
import { 
  Truck, 
  Layers, 
  MapPin, 
  User, 
  Search, 
  X, 
  Pin, 
  Maximize2, 
  AlertTriangle, 
  Clock, 
  FileText,
  Filter,
  CheckCircle2,
  AlertCircle,
  ShieldCheck,
  ChevronRight,
  Zap
} from "lucide-react";
import type { Vehicle, Document } from "../types";
import { cn } from "@/src/lib/utils";

interface NeonClusterTooltipProps {
  vehicles: Vehicle[];
  totalCount: number;
  screenPos: { x: number; y: number };
  containerDimensions: { width: number; height: number };
  isPinned: boolean;
  onTogglePin: () => void;
  onClose: () => void;
  onExpandCluster: () => void;
  onSelectVehicle: (vehicle: Vehicle) => void;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
  operationColors: Record<string, string>;
}

export const NeonClusterTooltip: React.FC<NeonClusterTooltipProps> = ({
  vehicles,
  totalCount,
  screenPos,
  containerDimensions,
  isPinned,
  onTogglePin,
  onClose,
  onExpandCluster,
  onSelectVehicle,
  onMouseEnter,
  onMouseLeave,
  operationColors
}) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedOpFilter, setSelectedOpFilter] = useState<string | null>(null);
  const [selectedStatusFilter, setSelectedStatusFilter] = useState<string | null>(null);
  const [displayLimit, setDisplayLimit] = useState<number | "all">(16);

  // Stats Breakdown
  const stats = useMemo(() => {
    let ok = 0;
    let alerta = 0;
    let vencido = 0;
    const opsMap: Record<string, number> = {};
    const citiesMap: Record<string, number> = {};

    vehicles.forEach(v => {
      if (v.overallStatus === "ok") ok++;
      else if (v.overallStatus === "alerta" || v.overallStatus === "atencao" || v.overallStatus === "critico") alerta++;
      else if (v.overallStatus === "vencido") vencido++;

      const op = v.operation || "Geral";
      opsMap[op] = (opsMap[op] || 0) + 1;

      if (v.cityBase) {
        citiesMap[v.cityBase] = (citiesMap[v.cityBase] || 0) + 1;
      }
    });

    const topCity = Object.entries(citiesMap).sort((a, b) => b[1] - a[1])[0]?.[0] || null;

    return { ok, alerta, vencido, opsMap, topCity };
  }, [vehicles]);

  // Priority sorting: Vencidos first, then Alerta, then Ok
  const sortedVehicles = useMemo(() => {
    const priority: Record<string, number> = {
      vencido: 1,
      critico: 2,
      atencao: 3,
      alerta: 4,
      ok: 5,
      pagos: 6
    };

    return [...vehicles].sort((a, b) => {
      const pA = priority[a.overallStatus] || 99;
      const pB = priority[b.overallStatus] || 99;
      if (pA !== pB) return pA - pB;
      return (a.plate || "").localeCompare(b.plate || "");
    });
  }, [vehicles]);

  // Filtered vehicles
  const filteredVehicles = useMemo(() => {
    return sortedVehicles.filter(v => {
      if (selectedOpFilter && v.operation !== selectedOpFilter) return false;
      if (selectedStatusFilter) {
        if (selectedStatusFilter === "alerta") {
          if (v.overallStatus !== "alerta" && v.overallStatus !== "atencao" && v.overallStatus !== "critico") return false;
        } else if (v.overallStatus !== selectedStatusFilter) {
          return false;
        }
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchPlate = v.plate?.toLowerCase().includes(q);
        const matchFleet = v.fleet?.toLowerCase().includes(q);
        const matchDriver = v.driver?.toLowerCase().includes(q);
        const matchCity = v.cityBase?.toLowerCase().includes(q);
        const matchDoc = v.documents?.some(d => d.type?.toLowerCase().includes(q) || d.expiryDate?.includes(q));
        if (!matchPlate && !matchFleet && !matchDriver && !matchCity && !matchDoc) return false;
      }
      return true;
    });
  }, [sortedVehicles, selectedOpFilter, selectedStatusFilter, searchQuery]);

  // Slice by display limit
  const visibleVehicles = useMemo(() => {
    if (displayLimit === "all") return filteredVehicles;
    return filteredVehicles.slice(0, displayLimit);
  }, [filteredVehicles, displayLimit]);

  const hasRemaining = displayLimit !== "all" && filteredVehicles.length > displayLimit;
  const remainingCount = filteredVehicles.length - (displayLimit === "all" ? 0 : displayLimit);

  // Viewport Dimensions & Positioning
  const W = typeof window !== "undefined" ? window.innerWidth : 1200;
  const H = typeof window !== "undefined" ? window.innerHeight : 800;
  
  // Single vehicle tooltip is more compact; multi-vehicle is wider
  const isSingle = totalCount === 1;
  const tooltipWidth = isSingle 
    ? Math.min(410, W - 32)
    : Math.min(480, W - 32);
  const halfWidth = tooltipWidth / 2;

  // Smart vertical flipping based on node position in viewport
  const isAbove = screenPos.y > (H / 2 + 40);
  
  // Clamping left so it NEVER goes off screen
  const clampLeft = Math.max(halfWidth + 16, Math.min(W - halfWidth - 16, screenPos.x));
  
  // Pointer arrow offset
  const rawArrowOffset = screenPos.x - clampLeft;
  const arrowOffset = Math.max(-halfWidth + 36, Math.min(halfWidth - 36, rawArrowOffset));

  const content = (
    <div 
      className="fixed z-[99999] pointer-events-none transition-all duration-75 ease-out select-none"
      style={{
        left: `${clampLeft}px`,
        top: isAbove ? "auto" : `${Math.max(16, screenPos.y + 18)}px`,
        bottom: isAbove ? `${Math.max(16, H - screenPos.y + 18)}px` : "auto",
        transform: "translateX(-50%)",
        perspective: "1400px"
      }}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.92, y: isAbove ? 14 : -14 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.92, y: isAbove ? 10 : -10 }}
        transition={{ type: "spring", stiffness: 420, damping: 28 }}
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
        style={{ width: `${tooltipWidth}px` }}
        className="pointer-events-auto relative flex flex-col rounded-3xl bg-[#090e1a]/98 backdrop-blur-2xl border-2 border-cyan-400/80 shadow-[0_25px_70px_rgba(0,0,0,0.95),0_0_40px_rgba(6,182,212,0.35)] text-white overflow-hidden max-h-[82vh]"
      >
        {/* Animated Laser Border Beam */}
        <div className="absolute top-0 left-0 right-0 h-[3px] bg-gradient-to-r from-transparent via-cyan-400 to-transparent animate-pulse" />

        {/* Pointer Arrow */}
        <div 
          className={cn(
            "absolute w-4 h-4 bg-[#090e1a] border-cyan-400/80 transform rotate-45 pointer-events-none z-20",
            isAbove 
              ? "-bottom-2 border-b-2 border-r-2" 
              : "-top-2 border-t-2 border-l-2"
          )}
          style={{
            left: `calc(50% + ${arrowOffset}px)`,
            transform: "translateX(-50%) rotate(45deg)"
          }}
        />

        {/* Top Header */}
        <div className="p-3.5 sm:p-4 border-b border-slate-700/80 bg-slate-900/90 relative z-10 flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            {/* Hologram Icon */}
            <div className={cn(
              "w-11 h-11 rounded-2xl flex items-center justify-center border shadow-lg shrink-0",
              isSingle
                ? "bg-gradient-to-br from-blue-600/30 to-cyan-500/40 border-cyan-400 text-cyan-300 shadow-[0_0_15px_rgba(6,182,212,0.4)]"
                : "bg-gradient-to-br from-cyan-600/30 to-blue-700/40 border-cyan-400 text-cyan-300 shadow-[0_0_18px_rgba(6,182,212,0.5)]"
            )}>
              {isSingle ? <Truck className="w-5 h-5" /> : <Layers className="w-5 h-5 animate-pulse" />}
            </div>

            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-mono font-black text-sm sm:text-base tracking-wider text-white">
                  {isSingle ? (vehicles[0]?.plate || "DETALHES DO VEÍCULO") : `${totalCount} PLACAS NO LOCAL`}
                </span>
                <span className="px-2 py-0.5 rounded-md text-[9px] font-mono font-bold bg-cyan-500/25 text-cyan-300 border border-cyan-400/50 uppercase tracking-widest shrink-0">
                  {isSingle ? "Veículo" : "Agrupadas"}
                </span>
              </div>
              <p className="text-[11px] font-bold text-slate-300 flex items-center gap-1.5 truncate mt-0.5">
                <MapPin size={12} className="text-cyan-400 shrink-0" />
                <span className="truncate">
                  {isSingle 
                    ? (vehicles[0]?.cityBase ? `Base: ${vehicles[0].cityBase}` : "Localização no Mapa") 
                    : (stats.topCity ? `Região: ${stats.topCity}` : "Localização Consolidada")}
                </span>
              </p>
            </div>
          </div>

          {/* Action HUD Controls */}
          <div className="flex items-center gap-1.5 shrink-0">
            {/* Explodir Button (Only in multi-cluster) */}
            {!isSingle && (
              <button
                onClick={onExpandCluster}
                title="Explodir e desmembrar agrupamento no mapa"
                className="px-3 py-1.5 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 text-white font-black text-xs uppercase tracking-wider flex items-center gap-1.5 shadow-[0_0_15px_rgba(6,182,212,0.45)] hover:shadow-[0_0_22px_rgba(6,182,212,0.7)] transition-all cursor-pointer"
              >
                <Maximize2 size={13} />
                <span>Explodir</span>
              </button>
            )}

            {/* Flegar / Fixar Button */}
            <button
              onClick={onTogglePin}
              title={isPinned ? "Desaflegar (Tooltip fechará ao tirar o cursor)" : "Flegar / Fixar (Manter tooltip aberto na tela)"}
              className={cn(
                "px-2.5 py-1.5 rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-1.5 transition-all cursor-pointer border",
                isPinned 
                  ? "bg-cyan-500 text-slate-950 border-cyan-300 shadow-[0_0_16px_rgba(6,182,212,0.8)] scale-105" 
                  : "bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700 border-slate-700"
              )}
            >
              <Pin size={13} className={cn("transition-transform", isPinned && "rotate-45 text-slate-950")} />
              <span>{isPinned ? "Fixado" : "Fixar"}</span>
            </button>

            {/* Close Button */}
            <button
              onClick={onClose}
              title="Fechar Tooltip"
              className="p-1.5 rounded-xl bg-slate-800 text-slate-400 hover:text-white hover:bg-red-600/80 border border-slate-700 transition-all cursor-pointer"
            >
              <X size={15} />
            </button>
          </div>
        </div>

        {/* Multi-vehicle summary metrics & filter bar */}
        {!isSingle && (
          <>
            {/* Status Breakdown Chips */}
            <div className="px-3.5 py-2 bg-slate-900/60 border-b border-slate-800 flex items-center justify-between gap-2 flex-wrap text-xs shrink-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-slate-400 font-bold uppercase tracking-wider text-[10px]">Status:</span>
                
                <button 
                  onClick={() => setSelectedStatusFilter(selectedStatusFilter === "ok" ? null : "ok")}
                  className={cn(
                    "px-2.5 py-1 rounded-lg border font-bold flex items-center gap-1.5 transition-all cursor-pointer text-xs",
                    selectedStatusFilter === "ok"
                      ? "bg-emerald-500 text-white border-emerald-400 shadow-[0_0_12px_rgba(16,185,129,0.5)]"
                      : "bg-emerald-500/15 border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/25"
                  )}
                >
                  <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_6px_#10b981]" />
                  <span>{stats.ok} Regular</span>
                </button>

                {stats.alerta > 0 && (
                  <button 
                    onClick={() => setSelectedStatusFilter(selectedStatusFilter === "alerta" ? null : "alerta")}
                    className={cn(
                      "px-2.5 py-1 rounded-lg border font-bold flex items-center gap-1.5 transition-all cursor-pointer text-xs",
                      selectedStatusFilter === "alerta"
                        ? "bg-amber-500 text-slate-950 border-amber-300 shadow-[0_0_12px_rgba(245,158,11,0.6)]"
                        : "bg-amber-500/15 border-amber-500/40 text-amber-300 hover:bg-amber-500/25"
                    )}
                  >
                    <span className="w-2 h-2 rounded-full bg-amber-400 shadow-[0_0_6px_#f59e0b]" />
                    <span>{stats.alerta} Alerta</span>
                  </button>
                )}

                {stats.vencido > 0 && (
                  <button 
                    onClick={() => setSelectedStatusFilter(selectedStatusFilter === "vencido" ? null : "vencido")}
                    className={cn(
                      "px-2.5 py-1 rounded-lg border font-bold flex items-center gap-1.5 transition-all cursor-pointer text-xs",
                      selectedStatusFilter === "vencido"
                        ? "bg-red-600 text-white border-red-400 shadow-[0_0_15px_rgba(239,68,68,0.8)]"
                        : "bg-red-500/20 border-red-500/50 text-red-200 hover:bg-red-500/30 animate-pulse"
                    )}
                  >
                    <span className="w-2 h-2 rounded-full bg-red-400 shadow-[0_0_6px_#ef4444]" />
                    <span>{stats.vencido} Vencido</span>
                  </button>
                )}
              </div>

              {/* Reset filter button */}
              {(selectedOpFilter || selectedStatusFilter || searchQuery) && (
                <button
                  onClick={() => {
                    setSelectedOpFilter(null);
                    setSelectedStatusFilter(null);
                    setSearchQuery("");
                  }}
                  className="text-[10px] font-black text-cyan-300 hover:text-white uppercase tracking-wider underline cursor-pointer"
                >
                  Limpar
                </button>
              )}
            </div>

            {/* Operations Pills Bar */}
            {Object.keys(stats.opsMap).length > 1 && (
              <div className="px-3.5 py-1.5 bg-slate-950/70 border-b border-slate-800/80 flex items-center gap-1.5 overflow-x-auto scrollbar-none shrink-0">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1 shrink-0">
                  <Filter size={11} className="text-cyan-400" />
                  Operações:
                </span>
                {Object.entries(stats.opsMap).map(([opName, count]) => {
                  const color = operationColors[opName] || "#00f0ff";
                  const isSelected = selectedOpFilter === opName;
                  return (
                    <button
                      key={opName}
                      onClick={() => setSelectedOpFilter(isSelected ? null : opName)}
                      style={{
                        borderColor: isSelected ? color : `${color}55`,
                        boxShadow: isSelected ? `0 0 10px ${color}88` : "none"
                      }}
                      className={cn(
                        "px-2.5 py-0.5 rounded-lg border text-[10px] font-black uppercase tracking-wider flex items-center gap-1.5 shrink-0 transition-all cursor-pointer",
                        isSelected ? "bg-slate-800 text-white" : "bg-slate-900/90 text-slate-300 hover:bg-slate-800"
                      )}
                    >
                      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
                      <span>{opName}</span>
                      <span className="text-cyan-300 font-mono font-bold">({count})</span>
                    </button>
                  );
                })}
              </div>
            )}

            {/* Search Input Filter */}
            {totalCount > 3 && (
              <div className="px-3.5 py-2 bg-slate-950/80 border-b border-slate-800 flex items-center justify-between gap-2 shrink-0">
                <div className="relative flex-1 flex items-center">
                  <Search className="w-4 h-4 absolute left-3 text-cyan-400 pointer-events-none" />
                  <input 
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Filtrar placa, motorista, frota, cidade..."
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl pl-9 pr-8 py-1.5 text-xs text-white placeholder-slate-400 focus:outline-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400 transition-all font-mono"
                  />
                  {searchQuery && (
                    <button 
                      onClick={() => setSearchQuery("")}
                      className="absolute right-2.5 text-slate-400 hover:text-white p-0.5 cursor-pointer"
                    >
                      <X size={13} />
                    </button>
                  )}
                </div>

                {filteredVehicles.length > 8 && (
                  <div className="flex items-center gap-1 shrink-0">
                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Exibir:</span>
                    {([8, 16, "all"] as const).map((lim) => (
                      <button
                        key={String(lim)}
                        onClick={() => setDisplayLimit(lim)}
                        className={cn(
                          "px-2 py-0.5 rounded text-[9px] font-mono font-bold transition-all cursor-pointer",
                          displayLimit === lim 
                            ? "bg-cyan-500 text-slate-950 font-black shadow-[0_0_8px_#06b6d4]" 
                            : "bg-slate-800 text-slate-400 hover:text-slate-200"
                        )}
                      >
                        {lim === "all" ? "Tudo" : lim}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {/* Vehicles Scrollable List */}
        <div className="p-3 sm:p-3.5 overflow-y-auto space-y-2.5 custom-neon-scrollbar flex-1 bg-slate-950/40">
          {visibleVehicles.length === 0 ? (
            <div className="py-10 text-center text-slate-400 text-xs font-mono flex flex-col items-center gap-2">
              <FileText size={24} className="text-slate-500" />
              <span>Nenhum veículo encontrado com os filtros selecionados.</span>
            </div>
          ) : (
            visibleVehicles.map((vehicle) => {
              const opColor = operationColors[vehicle.operation] || "#00f0ff";
              const isStatusOk = vehicle.overallStatus === "ok";
              const isStatusVencido = vehicle.overallStatus === "vencido";
              const isStatusAlerta = vehicle.overallStatus === "alerta" || vehicle.overallStatus === "atencao" || vehicle.overallStatus === "critico";

              // Sort documents: vencidos first
              const sortedDocs = vehicle.documents && vehicle.documents.length > 0 
                ? [...vehicle.documents].sort((a, b) => {
                    if (a.status === "vencido" && b.status !== "vencido") return -1;
                    if (b.status === "vencido" && a.status !== "vencido") return 1;
                    return (a.daysRemaining ?? 999) - (b.daysRemaining ?? 999);
                  })
                : [];

              const primaryDoc = sortedDocs[0];

              return (
                <div
                  key={vehicle.id}
                  onClick={() => onSelectVehicle(vehicle)}
                  className="group relative p-3 rounded-2xl bg-slate-900/95 hover:bg-slate-800 border border-slate-750 hover:border-cyan-400 transition-all duration-200 cursor-pointer shadow-md hover:shadow-[0_0_20px_rgba(6,182,212,0.3)] flex flex-col gap-2.5"
                >
                  {/* Row 1: Authentic Mercosul Plate + Fleet + High Contrast Status */}
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2.5">
                      {/* Mercosul Plate Graphic with Ultra Clear Contrast */}
                      <div className="relative rounded border border-slate-300 bg-white px-2.5 py-0.5 shadow-md flex flex-col items-center shrink-0">
                        <div className="w-full h-2 bg-blue-700 rounded-t-[1px] mb-0.5 flex items-center justify-between px-1">
                          <span className="text-[6px] font-black text-white leading-none tracking-widest">BRASIL</span>
                          <span className="w-1 h-1 rounded-full bg-yellow-400" />
                        </div>
                        <span className="font-mono font-black text-xs sm:text-sm tracking-wider leading-none text-slate-950">
                          {vehicle.plate || "S/ PLACA"}
                        </span>
                      </div>

                      {/* Fleet ID */}
                      <div className="flex items-center gap-1.5 font-mono">
                        <Truck size={14} className="text-cyan-400 shrink-0" />
                        <span className="text-xs sm:text-sm font-black text-white">
                          Frota {vehicle.fleet || "---"}
                        </span>
                      </div>
                    </div>

                    {/* Status Pill */}
                    <div className={cn(
                      "px-2.5 py-1 rounded-lg text-xs font-black uppercase tracking-wider border shadow-sm flex items-center gap-1.5 shrink-0",
                      isStatusOk ? "bg-emerald-600/30 text-emerald-300 border-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.4)]" :
                      isStatusVencido ? "bg-red-600 text-white border-red-400 shadow-[0_0_14px_rgba(239,68,68,0.7)] animate-pulse" :
                      "bg-amber-500 text-slate-950 border-amber-300 shadow-[0_0_10px_rgba(245,158,11,0.5)]"
                    )}>
                      <span className={cn(
                        "w-2 h-2 rounded-full shrink-0",
                        isStatusOk ? "bg-emerald-400 shadow-[0_0_5px_#10b981]" :
                        isStatusVencido ? "bg-white shadow-[0_0_5px_#fff]" :
                        "bg-slate-950 shadow-[0_0_5px_#000]"
                      )} />
                      <span>{isStatusVencido ? "Vencido" : isStatusAlerta ? "Alerta" : "Regular"}</span>
                    </div>
                  </div>

                  {/* Row 2: Operation, Driver, Base City */}
                  <div className="flex items-center justify-between text-xs text-slate-200 gap-2 flex-wrap">
                    <div className="flex items-center gap-2 truncate">
                      {/* Operation Tag */}
                      <span 
                        className="px-2 py-0.5 rounded-md border text-[10px] font-black uppercase tracking-wider shrink-0"
                        style={{
                          borderColor: `${opColor}88`,
                          backgroundColor: `${opColor}22`,
                          color: opColor
                        }}
                      >
                        {vehicle.operation}
                      </span>

                      {/* Driver */}
                      <span className="truncate text-slate-200 font-medium flex items-center gap-1 text-[11px]">
                        <User size={12} className="text-slate-400 shrink-0" />
                        <span className="truncate">{vehicle.driver || "Não atribuído"}</span>
                      </span>
                    </div>

                    {/* City Base */}
                    <div className="flex items-center gap-1 text-[11px] font-bold text-cyan-300 shrink-0">
                      <MapPin size={11} className="text-cyan-400 shrink-0" />
                      <span>{vehicle.cityBase || "---"}</span>
                    </div>
                  </div>

                  {/* Row 3: Pertinent License & Expiration Information */}
                  {primaryDoc ? (
                    <div className="pt-2 border-t border-slate-800 flex items-center justify-between text-xs gap-2">
                      <div className="flex items-center gap-1.5 text-slate-200 truncate">
                        <FileText size={12} className="text-cyan-400 shrink-0" />
                        <span className="font-black text-white uppercase text-[11px] truncate">{primaryDoc.type}</span>
                        <span className="text-slate-500 font-mono">•</span>
                        <span className="text-slate-300 font-mono text-[11px]">{primaryDoc.expiryDate}</span>
                      </div>

                      {/* Expiry Badge */}
                      <span className={cn(
                        "font-mono font-black px-2 py-0.5 rounded-md text-[10px] uppercase tracking-wider shrink-0 border",
                        primaryDoc.status === "vencido" ? "bg-red-500/30 text-red-200 border-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]" :
                        primaryDoc.status === "critico" || primaryDoc.status === "atencao" ? "bg-amber-500/30 text-amber-200 border-amber-500" :
                        "bg-emerald-500/25 text-emerald-200 border-emerald-500/60"
                      )}>
                        {primaryDoc.status === "vencido" ? (
                          `Vencido há ${Math.abs(primaryDoc.daysRemaining || 0)}d`
                        ) : primaryDoc.daysRemaining !== undefined ? (
                          `Vence em ${primaryDoc.daysRemaining}d`
                        ) : (
                          "Em dia"
                        )}
                      </span>
                    </div>
                  ) : (
                    <div className="pt-2 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400">
                      <span className="flex items-center gap-1.5 text-[11px] text-emerald-400 font-bold">
                        <ShieldCheck size={13} />
                        <span>Documentação conforme</span>
                      </span>
                      {vehicle.lastUpdate && (
                        <span className="font-mono text-[10px] text-slate-400">
                          Atualizado: {vehicle.lastUpdate}
                        </span>
                      )}
                    </div>
                  )}

                  {/* Multi-document Pills if vehicle has multiple licenses */}
                  {sortedDocs.length > 1 && (
                    <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none pt-1 border-t border-slate-800/60">
                      <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider shrink-0">Outras:</span>
                      {sortedDocs.slice(1).map((d, i) => (
                        <span 
                          key={i} 
                          className={cn(
                            "px-1.5 py-0.5 rounded text-[9px] font-mono font-bold uppercase tracking-wider shrink-0 border flex items-center gap-1",
                            d.status === "vencido" ? "border-red-500 text-red-200 bg-red-500/20" :
                            d.status === "critico" || d.status === "atencao" ? "border-amber-500 text-amber-200 bg-amber-500/20" :
                            "border-slate-700 text-slate-300 bg-slate-800/80"
                          )}
                        >
                          <span>{d.type}:</span>
                          <span>{d.expiryDate}</span>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Bottom Action Footer */}
        {!isSingle && (
          <div className="p-3 bg-slate-900/90 border-t border-slate-800 flex items-center justify-between gap-3 shrink-0">
            <button
              onClick={onExpandCluster}
              className="flex-1 py-2 px-3 rounded-xl bg-gradient-to-r from-blue-600 via-cyan-600 to-blue-600 hover:from-blue-500 hover:to-cyan-500 text-white font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 shadow-[0_0_15px_rgba(6,182,212,0.4)] transition-all cursor-pointer"
            >
              <Maximize2 size={13} />
              <span>Explodir no Mapa ({totalCount} veículos)</span>
            </button>
          </div>
        )}
      </motion.div>
    </div>
  );

  // Render via React Portal to document.body to ensure it ALWAYS floats above everything in the DOM
  if (typeof document !== "undefined") {
    return createPortal(content, document.body);
  }

  return content;
};
