import React, { useState, useRef, useEffect } from 'react';
import { 
  AlertOctagon, 
  AlertTriangle, 
  Clock, 
  CheckCircle2, 
  ChevronDown, 
  Check, 
  RotateCcw,
  SlidersHorizontal
} from 'lucide-react';
import { cn } from "@/src/lib/utils";

export interface PendingStatusOption {
  value: string;
  label: string;
  sublabel: string;
  count?: number;
  colorDot: string;
  badgeClass: string;
  icon: React.ReactNode;
}

interface PendingStatusSelectorProps {
  id?: string;
  selectedStatuses: string[];
  onChange: (statuses: string[]) => void;
  statusCounts?: {
    vencido?: number;
    critico?: number;
    atencao?: number;
    regular?: number;
  };
  defaultStatuses?: string[];
  className?: string;
}

export const PendingStatusSelector: React.FC<PendingStatusSelectorProps> = ({
  id = "pending-status-selector",
  selectedStatuses,
  onChange,
  statusCounts,
  defaultStatuses = ['VENCIDO', 'CRITICO'],
  className
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const options: PendingStatusOption[] = [
    {
      value: 'VENCIDO',
      label: 'Vencido',
      sublabel: 'Prazo já expirado',
      count: statusCounts?.vencido,
      colorDot: 'bg-rose-500',
      badgeClass: 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800',
      icon: <AlertOctagon size={14} className="text-rose-600 dark:text-rose-400" />
    },
    {
      value: 'CRITICO',
      label: 'Crítico (≤ 15d)',
      sublabel: 'Vencimento iminente',
      count: statusCounts?.critico,
      colorDot: 'bg-amber-500',
      badgeClass: 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800',
      icon: <AlertTriangle size={14} className="text-amber-600 dark:text-amber-400" />
    },
    {
      value: 'ATENCAO',
      label: 'Em Atenção (≤ 30d)',
      sublabel: 'Prazo de acompanhamento',
      count: statusCounts?.atencao,
      colorDot: 'bg-blue-500',
      badgeClass: 'bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800',
      icon: <Clock size={14} className="text-blue-600 dark:text-blue-400" />
    },
    {
      value: 'REGULAR',
      label: 'Regular / Em Dia',
      sublabel: 'Sem urgência imediata',
      count: statusCounts?.regular,
      colorDot: 'bg-emerald-500',
      badgeClass: 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800',
      icon: <CheckCircle2 size={14} className="text-emerald-600 dark:text-emerald-400" />
    }
  ];

  const handleToggle = (val: string) => {
    let next: string[];
    if (selectedStatuses.includes(val)) {
      // Don't allow empty selection - must have at least one
      if (selectedStatuses.length <= 1) return;
      next = selectedStatuses.filter(s => s !== val);
    } else {
      next = [...selectedStatuses, val];
    }
    onChange(next);
  };

  const applyPreset = (presetStatuses: string[]) => {
    onChange(presetStatuses);
  };

  // Helper text describing current selection
  const getSummaryLabel = () => {
    const hasVencido = selectedStatuses.includes('VENCIDO');
    const hasCritico = selectedStatuses.includes('CRITICO');
    const hasAtencao = selectedStatuses.includes('ATENCAO');
    const hasRegular = selectedStatuses.includes('REGULAR');

    if (hasVencido && !hasCritico && !hasAtencao && !hasRegular) {
      return "Apenas Vencidos";
    }
    if (hasVencido && hasCritico && !hasAtencao && !hasRegular) {
      return "Vencidos + Críticos";
    }
    if (hasVencido && hasCritico && hasAtencao && !hasRegular) {
      return "Venc. + Crít. + Atenção";
    }
    if (hasVencido && hasCritico && hasAtencao && hasRegular) {
      return "Todos os Status";
    }
    if (!hasVencido && hasCritico && !hasAtencao && !hasRegular) {
      return "Apenas Críticos";
    }
    return `${selectedStatuses.length} Status Selecionados`;
  };

  return (
    <div className={cn("relative inline-block text-left", className)} ref={containerRef}>
      {/* Botão de Disparo */}
      <button
        id={id}
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "flex items-center gap-2 px-3 py-2 text-xs font-bold rounded-2xl border transition-all cursor-pointer select-none",
          isOpen 
            ? "bg-rose-50 dark:bg-rose-950/40 border-rose-400 dark:border-rose-600 text-rose-800 dark:text-rose-200 shadow-sm"
            : "bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700/80 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 shadow-xs"
        )}
        title="Configurar quais status de documento são associados a 'Pendentes de Justificativa'"
      >
        <div className="flex items-center gap-1.5">
          <div className="w-5 h-5 rounded-lg bg-rose-100 dark:bg-rose-900/50 flex items-center justify-center text-rose-600 dark:text-rose-400">
            <SlidersHorizontal size={12} />
          </div>
          <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400">Pendentes:</span>
        </div>

        <span className="px-2 py-0.5 rounded-lg text-[10px] font-black uppercase tracking-wider bg-rose-100/80 dark:bg-rose-950/80 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800/80">
          {getSummaryLabel()}
        </span>

        <ChevronDown 
          size={13} 
          className={cn(
            "text-slate-400 dark:text-slate-500 transition-transform duration-200",
            isOpen && "rotate-180 text-rose-500"
          )} 
        />
      </button>

      {/* Popover / Menu Suspenso */}
      {isOpen && (
        <div className="absolute right-0 sm:left-0 sm:right-auto mt-2 w-80 sm:w-88 bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-700 z-50 overflow-hidden animate-fadeIn">
          {/* Cabeçalho */}
          <div className="p-3.5 bg-slate-50 dark:bg-slate-800/70 border-b border-slate-200 dark:border-slate-700">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-lg bg-rose-100 dark:bg-rose-950/80 flex items-center justify-center text-rose-600 dark:text-rose-400">
                <AlertOctagon size={13} />
              </div>
              <h4 className="text-xs font-black text-slate-800 dark:text-slate-100 uppercase tracking-wide">
                Regra de Pendência
              </h4>
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
              Defina quais alertas sem justificativa são considerados <strong>Pendentes</strong> nos cards e filtros da frota.
            </p>
          </div>

          {/* Atalhos Rápidos (Presets) */}
          <div className="p-2.5 bg-slate-100/60 dark:bg-slate-800/40 border-b border-slate-200 dark:border-slate-700">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 block mb-1.5 px-1">
              Atalhos Rápidos
            </span>
            <div className="grid grid-cols-2 gap-1.5">
              <button
                type="button"
                onClick={() => applyPreset(['VENCIDO'])}
                className={cn(
                  "px-2 py-1.5 text-[11px] font-bold rounded-xl border text-left transition-all cursor-pointer flex items-center justify-between",
                  selectedStatuses.length === 1 && selectedStatuses.includes('VENCIDO')
                    ? "bg-rose-600 text-white border-rose-600 shadow-xs"
                    : "bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700"
                )}
              >
                <span>Apenas Vencidos</span>
                {selectedStatuses.length === 1 && selectedStatuses.includes('VENCIDO') && <Check size={11} />}
              </button>

              <button
                type="button"
                onClick={() => applyPreset(['VENCIDO', 'CRITICO'])}
                className={cn(
                  "px-2 py-1.5 text-[11px] font-bold rounded-xl border text-left transition-all cursor-pointer flex items-center justify-between",
                  selectedStatuses.length === 2 && selectedStatuses.includes('VENCIDO') && selectedStatuses.includes('CRITICO')
                    ? "bg-rose-600 text-white border-rose-600 shadow-xs"
                    : "bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700"
                )}
              >
                <span>Vencidos + Críticos</span>
                {selectedStatuses.length === 2 && selectedStatuses.includes('VENCIDO') && selectedStatuses.includes('CRITICO') && <Check size={11} />}
              </button>

              <button
                type="button"
                onClick={() => applyPreset(['VENCIDO', 'CRITICO', 'ATENCAO'])}
                className={cn(
                  "px-2 py-1.5 text-[11px] font-bold rounded-xl border text-left transition-all cursor-pointer flex items-center justify-between col-span-2",
                  selectedStatuses.length === 3 && selectedStatuses.includes('VENCIDO') && selectedStatuses.includes('CRITICO') && selectedStatuses.includes('ATENCAO')
                    ? "bg-rose-600 text-white border-rose-600 shadow-xs"
                    : "bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700"
                )}
              >
                <span>Vencidos + Críticos + Em Atenção (≤ 30d)</span>
                {selectedStatuses.length === 3 && selectedStatuses.includes('VENCIDO') && selectedStatuses.includes('CRITICO') && selectedStatuses.includes('ATENCAO') && <Check size={11} />}
              </button>
            </div>
          </div>

          {/* Lista de Checkboxes Personalizada */}
          <div className="p-2 space-y-1 max-h-56 overflow-y-auto">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 block mb-1 px-1">
              Seleção Personalizada
            </span>
            {options.map((opt) => {
              const isChecked = selectedStatuses.includes(opt.value);
              const isOnlyOneChecked = isChecked && selectedStatuses.length === 1;

              return (
                <label
                  key={opt.value}
                  className={cn(
                    "flex items-center justify-between p-2 rounded-xl transition-all select-none",
                    isOnlyOneChecked ? "cursor-not-allowed opacity-90" : "cursor-pointer",
                    isChecked
                      ? "bg-slate-50 dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700/80"
                      : "hover:bg-slate-50/60 dark:hover:bg-slate-800/40 border border-transparent"
                  )}
                  title={isOnlyOneChecked ? "Mantenha ao menos um status selecionado" : undefined}
                >
                  <div className="flex items-center gap-2.5">
                    <input
                      type="checkbox"
                      checked={isChecked}
                      disabled={isOnlyOneChecked}
                      onChange={() => handleToggle(opt.value)}
                      className="w-4 h-4 rounded border-slate-300 dark:border-slate-600 text-rose-600 focus:ring-rose-500 cursor-pointer accent-rose-600"
                    />
                    <div className="flex items-center gap-1.5">
                      {opt.icon}
                      <div>
                        <span className="text-xs font-bold text-slate-800 dark:text-slate-200 block leading-tight">
                          {opt.label}
                        </span>
                        <span className="text-[10px] text-slate-400 dark:text-slate-500 block leading-tight">
                          {opt.sublabel}
                        </span>
                      </div>
                    </div>
                  </div>

                  {opt.count !== undefined && (
                    <span className={cn("text-[10px] font-mono font-bold px-2 py-0.5 rounded-full border", opt.badgeClass)}>
                      {opt.count}
                    </span>
                  )}
                </label>
              );
            })}
          </div>

          {/* Rodapé */}
          <div className="p-2.5 bg-slate-50 dark:bg-slate-800/70 border-t border-slate-200 dark:border-slate-700 flex items-center justify-between">
            <button
              type="button"
              onClick={() => applyPreset(defaultStatuses)}
              className="flex items-center gap-1 text-[11px] font-bold text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 transition-colors cursor-pointer"
              title={`Restaurar padrão inicial (${defaultStatuses.includes('VENCIDO') && defaultStatuses.length === 1 ? 'Apenas Vencidos' : 'Vencidos e Críticos'})`}
            >
              <RotateCcw size={11} />
              <span>Restaurar Padrão</span>
            </button>

            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="px-3 py-1 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold shadow-xs transition-all cursor-pointer"
            >
              Pronto
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
