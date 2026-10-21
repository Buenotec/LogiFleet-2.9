import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Check, ChevronDown, Search, X } from 'lucide-react';
import { cn } from "@/src/lib/utils";

export interface MultiSelectOption {
  value: string;
  label: string;
  count?: number;
  icon?: React.ReactNode;
  colorDot?: string; // Tailwind class e.g. "bg-rose-500"
  badgeBg?: string;  // Tailwind class e.g. "bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-400 border-rose-200 dark:border-rose-800"
}

interface MultiSelectFilterProps {
  id: string;
  label: string;
  placeholder?: string;
  icon?: React.ReactNode;
  options: MultiSelectOption[];
  selectedValues: string[];
  onChange: (values: string[]) => void;
  searchPlaceholder?: string;
  showSearchThreshold?: number;
  className?: string;
  dropdownWidth?: string;
  maxDisplayTags?: number;
  alignRight?: boolean;
}

export const MultiSelectFilter: React.FC<MultiSelectFilterProps> = ({
  id,
  label,
  placeholder = "Todos",
  icon,
  options,
  selectedValues,
  onChange,
  searchPlaceholder = "Buscar...",
  showSearchThreshold = 5,
  className,
  dropdownWidth = "w-72 sm:w-80",
  maxDisplayTags = 2,
  alignRight
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [isNearRightEdge, setIsNearRightEdge] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Check positioning relative to screen edge when opened
  useEffect(() => {
    if (isOpen && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      if (rect.left + 320 > window.innerWidth) {
        setIsNearRightEdge(true);
      } else {
        setIsNearRightEdge(false);
      }
    }
  }, [isOpen]);

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

  // Focus search input on open
  useEffect(() => {
    if (isOpen && searchInputRef.current) {
      setTimeout(() => searchInputRef.current?.focus(), 50);
    } else {
      setSearchTerm("");
    }
  }, [isOpen]);

  // Filter options by search
  const filteredOptions = useMemo(() => {
    if (!searchTerm.trim()) return options;
    const lower = searchTerm.toLowerCase();
    return options.filter(opt => 
      opt.label.toLowerCase().includes(lower) || 
      opt.value.toLowerCase().includes(lower)
    );
  }, [options, searchTerm]);

  // Handle single toggle
  const toggleOption = (val: string) => {
    if (selectedValues.includes(val)) {
      onChange(selectedValues.filter(v => v !== val));
    } else {
      onChange([...selectedValues, val]);
    }
  };

  // Select all visible options
  const handleSelectAll = () => {
    const allFilteredVals = filteredOptions.map(o => o.value);
    const combined = Array.from(new Set([...selectedValues, ...allFilteredVals]));
    onChange(combined);
  };

  // Clear selections
  const handleClearAll = () => {
    if (searchTerm.trim()) {
      // If searching, only uncheck the visible filtered options
      const visibleSet = new Set(filteredOptions.map(o => o.value));
      onChange(selectedValues.filter(v => !visibleSet.has(v)));
    } else {
      onChange([]);
    }
  };

  const hasSelections = selectedValues.length > 0;
  const isAllSelected = options.length > 0 && selectedValues.length === options.length;

  // Render label for button trigger
  const renderTriggerContent = () => {
    if (!hasSelections) {
      return (
        <span className="text-slate-600 dark:text-slate-300 font-medium truncate">
          {placeholder}
        </span>
      );
    }

    if (selectedValues.length === 1) {
      const match = options.find(o => o.value === selectedValues[0]);
      return (
        <span className="text-slate-900 dark:text-white font-bold truncate flex items-center gap-1.5">
          {match?.colorDot && (
            <span className={cn("w-2 h-2 rounded-full shrink-0", match.colorDot)} />
          )}
          <span className="truncate">{match ? match.label : selectedValues[0]}</span>
        </span>
      );
    }

    return (
      <span className="text-slate-900 dark:text-white font-bold truncate flex items-center gap-1.5">
        <span>{label}:</span>
        <span className="px-1.5 py-0.5 rounded-md bg-blue-100 dark:bg-blue-900/60 text-blue-700 dark:text-blue-300 text-[11px] font-bold">
          {selectedValues.length}
        </span>
      </span>
    );
  };

  return (
    <div ref={containerRef} className={cn("relative inline-block text-left", isOpen ? "z-[60]" : "z-10", className)}>
      {/* Trigger Button */}
      <div className="flex items-center">
        <button
          id={id}
          type="button"
          onClick={() => setIsOpen(prev => !prev)}
          className={cn(
            "flex items-center gap-2 px-3 py-2 rounded-xl text-xs sm:text-sm transition-all border outline-none cursor-pointer select-none",
            hasSelections
              ? "bg-blue-50/80 dark:bg-blue-950/40 border-blue-300 dark:border-blue-700/80 text-blue-900 dark:text-blue-200 shadow-sm"
              : "bg-slate-100/70 dark:bg-slate-900/70 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-200/60 dark:hover:bg-slate-800"
          )}
          aria-haspopup="listbox"
          aria-expanded={isOpen}
        >
          {icon && (
            <span className={cn("shrink-0", hasSelections ? "text-blue-600 dark:text-blue-400" : "text-slate-400")}>
              {icon}
            </span>
          )}

          <div className="max-w-[140px] sm:max-w-[170px] truncate text-left">
            {renderTriggerContent()}
          </div>

          <ChevronDown 
            size={14} 
            className={cn(
              "text-slate-400 transition-transform duration-200 shrink-0",
              isOpen ? "rotate-180 text-blue-500" : ""
            )} 
          />
        </button>

        {/* Quick clear 'x' when there are active selections */}
        {hasSelections && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onChange([]);
            }}
            className="ml-1 p-1 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 rounded-lg hover:bg-slate-200/60 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            title={`Limpar filtro de ${label}`}
          >
            <X size={13} />
          </button>
        )}
      </div>

      {/* Dropdown Popover */}
      {isOpen && (
        <div 
          className={cn(
            "absolute z-[100] mt-1.5 bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 p-2.5 flex flex-col gap-2 animate-in fade-in zoom-in-95 duration-150",
            dropdownWidth,
            (alignRight || isNearRightEdge) ? "right-0" : "left-0"
          )}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-1 pb-1 border-b border-slate-100 dark:border-slate-800">
            <div className="flex items-center gap-1.5">
              {icon && <span className="text-slate-400">{icon}</span>}
              <span className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider">
                {label}
              </span>
            </div>
            <span className="text-[11px] font-semibold text-slate-400">
              {selectedValues.length} de {options.length}
            </span>
          </div>

          {/* Search Input (if options > threshold) */}
          {(options.length >= showSearchThreshold) && (
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
              <input
                ref={searchInputRef}
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder={searchPlaceholder}
                className="w-full pl-8 pr-7 py-1.5 bg-slate-100/70 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700/80 rounded-xl text-xs font-medium text-slate-900 dark:text-slate-100 placeholder:text-slate-400 outline-none focus:ring-1 focus:ring-blue-500"
              />
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => setSearchTerm("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5 rounded cursor-pointer"
                >
                  <X size={12} />
                </button>
              )}
            </div>
          )}

          {/* Quick Select Buttons */}
          <div className="flex items-center justify-between gap-1.5 px-0.5 pt-0.5 text-[11px]">
            <button
              type="button"
              onClick={handleSelectAll}
              className="px-2 py-1 font-bold text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/40 rounded-lg transition-colors cursor-pointer"
            >
              Marcar Todos
            </button>
            <button
              type="button"
              onClick={handleClearAll}
              className="px-2 py-1 font-bold text-slate-500 dark:text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
            >
              Desmarcar Todos
            </button>
          </div>

          {/* Options List */}
          <div className="max-h-56 overflow-y-auto pr-1 space-y-0.5 custom-scrollbar">
            {filteredOptions.length === 0 ? (
              <div className="py-6 text-center text-xs text-slate-400">
                Nenhum resultado encontrado.
              </div>
            ) : (
              filteredOptions.map((opt) => {
                const isChecked = selectedValues.includes(opt.value);
                return (
                  <label
                    key={opt.value}
                    onClick={() => toggleOption(opt.value)}
                    className={cn(
                      "flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-xl text-xs font-medium cursor-pointer transition-colors select-none",
                      isChecked
                        ? "bg-blue-50 dark:bg-blue-950/40 text-blue-900 dark:text-blue-200"
                        : "text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/60"
                    )}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      {/* Checkbox box (flegue) */}
                      <div
                        className={cn(
                          "w-4 h-4 rounded-md border flex items-center justify-center transition-all shrink-0",
                          isChecked
                            ? "bg-blue-600 border-blue-600 text-white shadow-xs"
                            : "border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800"
                        )}
                      >
                        {isChecked && <Check size={11} strokeWidth={3} />}
                      </div>

                      {/* Dot or Icon */}
                      {opt.colorDot && (
                        <span className={cn("w-2 h-2 rounded-full shrink-0", opt.colorDot)} />
                      )}
                      {opt.icon && (
                        <span className="shrink-0">{opt.icon}</span>
                      )}

                      <span className="truncate font-medium">{opt.label}</span>
                    </div>

                    {/* Count badge */}
                    {opt.count !== undefined && (
                      <span className={cn(
                        "text-[10px] font-bold px-1.5 py-0.5 rounded-full shrink-0",
                        isChecked 
                          ? "bg-blue-200/70 dark:bg-blue-900 text-blue-800 dark:text-blue-200"
                          : "bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400"
                      )}>
                        {opt.count}
                      </span>
                    )}
                  </label>
                );
              })
            )}
          </div>

          {/* Footer */}
          <div className="pt-1.5 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between px-1">
            <span className="text-[11px] text-slate-500 dark:text-slate-400">
              {hasSelections ? `${selectedValues.length} selecionado(s)` : 'Nenhum filtro'}
            </span>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="px-3 py-1 bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 hover:bg-blue-600 dark:hover:bg-blue-500 dark:hover:text-white rounded-xl text-xs font-bold transition-colors cursor-pointer"
            >
              Concluído
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
