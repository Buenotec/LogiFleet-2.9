import React, { useState, useMemo } from 'react';
import { 
  Clock, X, Search, Filter, Download, FileSpreadsheet, Printer, 
  Calendar, UserCheck, ShieldCheck, FileText, CheckCircle2, 
  AlertTriangle, Truck, Building2, ChevronRight, Layers,
  Plus, MessageSquare, ArrowUpDown, History, Eye, Tag, AlertCircle, FileSignature
} from 'lucide-react';
import { Vehicle, JustificationHistoryItem, LicenseJustification } from '../types';
import { getJustificationCategoryInfo } from './DocJustificationsTab';
import { cn } from "@/src/lib/utils";
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { format } from 'date-fns';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  selectedPlate?: string | null;
  historyItems: JustificationHistoryItem[];
  activeJustifications?: LicenseJustification[];
  baseFleet?: Vehicle[];
  onAddHistoryItem?: (item: JustificationHistoryItem) => Promise<void>;
  renderModernPDFHeader?: (doc: any, options: any) => void;
  loadPDFLogo?: () => Promise<HTMLImageElement | null>;
  theme?: 'light' | 'dark';
  title?: string;
  sourceType?: 'LICENCAS' | 'DOCUMENTACAO';
}

export const VehicleJustificationHistoryModal: React.FC<Props> = ({
  isOpen,
  onClose,
  selectedPlate: initialPlate,
  historyItems = [],
  activeJustifications = [],
  baseFleet = [],
  onAddHistoryItem,
  renderModernPDFHeader,
  loadPDFLogo,
  theme = 'dark',
  title = "Histórico de Justificativas por Veículo",
  sourceType = "LICENCAS"
}) => {
  // Current active plate filter (can be 'ALL' or a specific plate)
  const [activePlate, setActivePlate] = useState<string>(() => initialPlate || 'ALL');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedDocFilter, setSelectedDocFilter] = useState<string>('ALL');
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<string>('ALL');
  const [viewFormat, setViewFormat] = useState<'timeline' | 'table'>('timeline');
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc');

  // Quick action note registration modal
  const [isAddingAction, setIsAddingAction] = useState(false);
  const [newActionDoc, setNewActionDoc] = useState('');
  const [newActionReason, setNewActionReason] = useState('');
  const [newActionAuthorizer, setNewActionAuthorizer] = useState('Diretoria Executiva');
  const [newActionForecast, setNewActionForecast] = useState('');
  const [newActionNotes, setNewActionNotes] = useState('');
  const [isSubmittingAction, setIsSubmittingAction] = useState(false);

  // Sync plate whenever modal opens or initialPlate prop changes
  React.useEffect(() => {
    if (isOpen) {
      if (initialPlate) {
        setActivePlate(initialPlate.toUpperCase().trim());
      } else {
        setActivePlate('ALL');
      }
    }
  }, [initialPlate, isOpen]);

  // Merge explicitly registered history items with all current active justifications
  // This guarantees that any existing justification in the system immediately shows in the history!
  const combinedHistory = useMemo(() => {
    const list: JustificationHistoryItem[] = [...(historyItems || [])];
    const existingIds = new Set(list.map(i => i.justificationId).filter(Boolean));
    const existingPlateDoc = new Set(
      list.map(i => `${(i.plate || '').toUpperCase().trim()}#${(i.documentType || '').toUpperCase().trim()}`)
    );

    (activeJustifications || []).forEach(j => {
      const plate = (j.plate || '').toUpperCase().trim();
      const doc = (j.documentType || '').toUpperCase().trim();
      const key = `${plate}#${doc}`;

      if (!existingIds.has(j.id) && !existingPlateDoc.has(key)) {
        list.push({
          id: `hist-active-${j.id}`,
          justificationId: j.id,
          plate: j.plate,
          fleet: j.fleet,
          operation: j.operation,
          documentType: j.documentType,
          status: j.status,
          reason: j.reason,
          authorizedBy: j.authorizedBy,
          actionForecast: j.actionForecast,
          observations: j.observations,
          updatedAt: j.updatedAt || 'Registro Vigente',
          updatedBy: j.updatedBy || 'Gestão da Frota',
          actionType: 'JUSTIFICATIVA ATIVA'
        });
      }
    });

    return list;
  }, [historyItems, activeJustifications]);

  // Extract all distinct plates from combined history + base fleet
  const availableVehicles = useMemo(() => {
    const map = new Map<string, { plate: string; fleet: string; operation: string; totalHistory: number }>();
    
    // Add from combined history
    combinedHistory.forEach(item => {
      const p = (item.plate || '').toUpperCase().trim();
      if (!p) return;
      if (!map.has(p)) {
        map.set(p, {
          plate: p,
          fleet: item.fleet || '-',
          operation: item.operation || '-',
          totalHistory: 1
        });
      } else {
        const existing = map.get(p)!;
        existing.totalHistory += 1;
        if (!existing.fleet || existing.fleet === '-') existing.fleet = item.fleet || '-';
        if (!existing.operation || existing.operation === '-') existing.operation = item.operation || '-';
      }
    });

    // Add from base fleet if not present
    baseFleet.forEach(v => {
      const p = (v.plate || '').toUpperCase().trim();
      if (!p) return;
      if (!map.has(p)) {
        map.set(p, {
          plate: p,
          fleet: v.fleet || '-',
          operation: v.operation || '-',
          totalHistory: 0
        });
      }
    });

    return Array.from(map.values()).sort((a, b) => {
      if (b.totalHistory !== a.totalHistory) return b.totalHistory - a.totalHistory;
      return a.plate.localeCompare(b.plate);
    });
  }, [combinedHistory, baseFleet]);

  // Selected vehicle metadata
  const currentVehicleInfo = useMemo(() => {
    if (activePlate === 'ALL') return null;
    const found = availableVehicles.find(v => v.plate === activePlate);
    if (found) return found;
    const fleetVehicle = baseFleet.find(v => v.plate === activePlate);
    return {
      plate: activePlate,
      fleet: fleetVehicle?.fleet || '-',
      operation: fleetVehicle?.operation || '-',
      totalHistory: combinedHistory.filter(h => (h.plate || '').toUpperCase().trim() === activePlate).length
    };
  }, [activePlate, availableVehicles, baseFleet, combinedHistory]);

  // Distinct document types in the history
  const distinctDocTypes = useMemo(() => {
    const set = new Set<string>();
    combinedHistory.forEach(item => {
      if (item.documentType) set.add(item.documentType.trim());
    });
    return Array.from(set).sort();
  }, [combinedHistory]);

  // Helper date parser for Brazilian and ISO formats
  const parseItemDate = (str?: string): number => {
    if (!str) return 0;
    // match dd/MM/yyyy HH:mm or dd/MM/yyyy
    const match = str.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}):(\d{2}))?/);
    if (match) {
      const [, d, m, y, hh, mm] = match;
      return new Date(Number(y), Number(m) - 1, Number(d), Number(hh || 0), Number(mm || 0)).getTime();
    }
    const t = Date.parse(str);
    return isNaN(t) ? 0 : t;
  };

  // Filtered history list
  const filteredHistory = useMemo(() => {
    return combinedHistory.filter(item => {
      // Plate filter
      if (activePlate !== 'ALL' && (item.plate || '').toUpperCase().trim() !== (activePlate || '').toUpperCase().trim()) {
        return false;
      }

      // Document filter
      if (selectedDocFilter !== 'ALL' && item.documentType !== selectedDocFilter) {
        return false;
      }

      // Category filter
      if (selectedCategoryFilter !== 'ALL') {
        const catInfo = getJustificationCategoryInfo(item.reason, item.actionForecast, item.observations);
        if (catInfo.key !== selectedCategoryFilter) {
          return false;
        }
      }

      // Search term
      if (searchTerm.trim()) {
        const term = searchTerm.toLowerCase();
        const plateMatch = (item.plate || '').toLowerCase().includes(term);
        const fleetMatch = (item.fleet || '').toLowerCase().includes(term);
        const docMatch = (item.documentType || '').toLowerCase().includes(term);
        const reasonMatch = (item.reason || '').toLowerCase().includes(term);
        const authMatch = (item.authorizedBy || '').toLowerCase().includes(term);
        const forecastMatch = (item.actionForecast || '').toLowerCase().includes(term);
        const obsMatch = (item.observations || '').toLowerCase().includes(term);
        const opMatch = (item.operation || '').toLowerCase().includes(term);
        if (!plateMatch && !fleetMatch && !docMatch && !reasonMatch && !authMatch && !forecastMatch && !obsMatch && !opMatch) {
          return false;
        }
      }

      return true;
    }).sort((a, b) => {
      const dateA = parseItemDate(a.updatedAt);
      const dateB = parseItemDate(b.updatedAt);
      return sortOrder === 'desc' ? dateB - dateA : dateA - dateB;
    });
  }, [combinedHistory, activePlate, selectedDocFilter, selectedCategoryFilter, searchTerm, sortOrder]);

  // Metrics for current selection
  const metrics = useMemo(() => {
    const total = filteredHistory.length;
    const docs = new Set(filteredHistory.map(i => i.documentType)).size;
    const authorizers = new Set(filteredHistory.map(i => i.authorizedBy)).size;
    const lastAction = filteredHistory.length > 0 ? filteredHistory[0] : null;

    return { total, docs, authorizers, lastAction };
  }, [filteredHistory]);

  // Export to Excel
  const handleExportExcel = () => {
    const exportData = filteredHistory.map(item => {
      const cat = getJustificationCategoryInfo(item.reason, item.actionForecast, item.observations);
      return {
        'Data / Hora': item.updatedAt || '-',
        'Placa': item.plate,
        'Frota': item.fleet || '-',
        'Operação': item.operation || '-',
        'Documento': item.documentType,
        'Status Documento': item.status || '-',
        'Tipo de Ação': item.actionType || 'JUSTIFICATIVA',
        'Motivo / Justificativa': item.reason || '-',
        'Autorizado Por': item.authorizedBy || '-',
        'Previsão de Ação': item.actionForecast || '-',
        'Observações': item.observations || '-',
        'Categoria Operacional': cat.label || 'Geral',
        'Auditoria / Atualizado Por': item.updatedBy || '-'
      };
    });

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Historico_Justificativas');
    const plateSuffix = activePlate === 'ALL' ? 'Geral' : activePlate;
    XLSX.writeFile(wb, `Historico_Justificativas_${plateSuffix}_${format(new Date(), 'dd-MM-yyyy')}.xlsx`);
  };

  // Export to PDF
  const handleExportPDF = async () => {
    const doc = new jsPDF({
      orientation: 'landscape',
      unit: 'mm',
      format: 'a4'
    });

    const loadedImg = loadPDFLogo ? await loadPDFLogo() : null;
    const plateLabel = activePlate === 'ALL' ? 'TODOS OS VEÍCULOS' : `PLACA: ${activePlate} ${currentVehicleInfo?.fleet ? `(FROTA: ${currentVehicleInfo.fleet})` : ''}`;
    
    if (renderModernPDFHeader) {
      renderModernPDFHeader(doc, {
        title: "HISTÓRICO AUDITADO DE JUSTIFICATIVAS E AÇÕES",
        subtitle: `${plateLabel} | Total de Registros: ${filteredHistory.length} | Consulta em: ${format(new Date(), 'dd/MM/yyyy HH:mm')}`,
        badgeText: "HISTÓRICO VEICULAR",
        rightMetaText: `${filteredHistory.length} AÇÕES REGISTRADAS`,
        loadedImg,
        height: 32
      });
    }

    // Executive summary cards box
    const pageWidth = doc.internal.pageSize.getWidth();
    doc.setFillColor(248, 250, 252);
    doc.roundedRect(14, 35, pageWidth - 28, 14, 2, 2, 'F');
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(30, 64, 175);
    doc.text(`VEÍCULO CONSULTADO: ${plateLabel}  |  TOTAL AÇÕES: ${metrics.total}  |  DOCS DISTINTOS: ${metrics.docs}  |  AUTORIZADORES: ${metrics.authorizers}`, 18, 43.5);

    const headers = [
      ["Data / Registro", "Placa", "Frota", "Documento", "Status", "Motivo", "Autorizado Por", "Previsão", "Observações", "Categoria"]
    ];

    const bodyData = filteredHistory.map(item => {
      const cat = getJustificationCategoryInfo(item.reason, item.actionForecast, item.observations);
      return [
        item.updatedAt || '-',
        item.plate || '-',
        item.fleet || '-',
        item.documentType || '-',
        (item.status || '-').toUpperCase(),
        item.reason || '-',
        item.authorizedBy || '-',
        item.actionForecast || '-',
        item.observations || '-',
        cat.shortLabel || '-'
      ];
    });

    autoTable(doc, {
      head: headers,
      body: bodyData,
      startY: 52,
      styles: {
        fontSize: 7.5,
        cellPadding: 2,
        overflow: 'linebreak',
        valign: 'middle'
      },
      headStyles: {
        fillColor: [30, 64, 175],
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        fontSize: 8,
        minCellHeight: 8
      },
      columnStyles: {
        0: { cellWidth: 26 }, // Data
        1: { cellWidth: 18, fontStyle: 'bold' }, // Placa
        2: { cellWidth: 15 }, // Frota
        3: { cellWidth: 32, fontStyle: 'bold' }, // Documento
        4: { cellWidth: 18, halign: 'center' }, // Status
        5: { cellWidth: 50 }, // Motivo
        6: { cellWidth: 26 }, // Autorizado
        7: { cellWidth: 28 }, // Previsão
        8: { cellWidth: 42 }, // Obs
        9: { cellWidth: 22, halign: 'center' } // Categoria
      },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      margin: { top: 52, left: 14, right: 14 }
    });

    const plateSuffix = activePlate === 'ALL' ? 'Geral' : activePlate;
    doc.save(`Historico_Justificativas_${plateSuffix}_${format(new Date(), 'dd-MM-yyyy')}.pdf`);
  };

  // Submit quick action note to history
  const handleSaveNewAction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newActionReason.trim()) {
      alert("Por favor, preencha o motivo ou ação tomada.");
      return;
    }
    if (activePlate === 'ALL' && !newActionDoc) {
      alert("Selecione um veículo específico para registrar a ação.");
      return;
    }

    setIsSubmittingAction(true);
    try {
      const nowStr = format(new Date(), 'dd/MM/yyyy HH:mm');
      const cat = getJustificationCategoryInfo(newActionReason, newActionForecast, newActionNotes);
      
      const newItem: JustificationHistoryItem = {
        id: `hist-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
        plate: activePlate !== 'ALL' ? activePlate : (baseFleet[0]?.plate || 'FROTA'),
        fleet: currentVehicleInfo?.fleet || '-',
        operation: currentVehicleInfo?.operation || '-',
        documentType: newActionDoc.trim() || 'GERAL / DIVERSOS',
        status: 'REGISTRADO',
        reason: newActionReason.trim(),
        authorizedBy: newActionAuthorizer.trim(),
        actionForecast: newActionForecast.trim() || 'Conforme alinhamento',
        observations: newActionNotes.trim(),
        updatedAt: nowStr,
        updatedBy: 'Usuário do Sistema',
        actionType: 'REGISTRO_DIRETO',
        categoryKey: cat.key
      };

      if (onAddHistoryItem) {
        await onAddHistoryItem(newItem);
      }

      setIsAddingAction(false);
      setNewActionReason('');
      setNewActionForecast('');
      setNewActionNotes('');
    } catch (err: any) {
      console.error("Erro ao salvar ação no histórico:", err);
      alert(`Falha ao registrar ação: ${err.message || 'Erro desconhecido'}`);
    } finally {
      setIsSubmittingAction(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 z-[9999] flex items-center justify-center p-3 sm:p-6 bg-slate-950/80 backdrop-blur-md overflow-y-auto animate-in fade-in duration-200"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div 
        className={cn(
          "w-full max-w-6xl max-h-[92vh] flex flex-col rounded-3xl border shadow-2xl overflow-hidden transition-all",
          "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-100"
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header Banner */}
        <div className="p-5 sm:p-6 bg-gradient-to-r from-blue-900 via-indigo-900 to-slate-900 text-white relative shrink-0 border-b border-white/10">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3.5">
              <div className="p-3 bg-blue-500/20 text-cyan-300 rounded-2xl border border-cyan-400/30 backdrop-blur-md shadow-inner">
                <History size={26} />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-xl sm:text-2xl font-display font-black tracking-tight text-white">
                    {title}
                  </h2>
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-cyan-400/20 text-cyan-300 border border-cyan-400/40">
                    Auditoria
                  </span>
                </div>
                <p className="text-xs text-slate-300 font-medium mt-0.5">
                  Consulta cronológica de ações, despachos e justificativas tomadas no passado por placa e frota
                </p>
              </div>
            </div>

            {/* Quick Actions & Close */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleExportPDF}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-xl bg-white/10 hover:bg-white/20 text-white border border-white/20 transition-all cursor-pointer shadow-xs"
                title="Exportar histórico em PDF"
              >
                <Download size={14} />
                <span className="hidden sm:inline">PDF</span>
              </button>

              <button
                type="button"
                onClick={handleExportExcel}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-xl bg-emerald-600/80 hover:bg-emerald-600 text-white border border-emerald-500/40 transition-all cursor-pointer shadow-xs"
                title="Exportar histórico para Excel"
              >
                <FileSpreadsheet size={14} />
                <span className="hidden sm:inline">Excel</span>
              </button>

              <button
                type="button"
                onClick={onClose}
                className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-colors cursor-pointer"
                title="Fechar histórico"
              >
                <X size={18} />
              </button>
            </div>
          </div>

          {/* Active vehicle badge if single vehicle selected */}
          {currentVehicleInfo && (
            <div className="mt-4 pt-3 border-t border-white/10 flex flex-wrap items-center gap-4 text-xs font-medium">
              <div className="flex items-center gap-2">
                <span className="text-slate-400">Veículo Selecionado:</span>
                <span className="px-2.5 py-0.5 rounded-lg bg-cyan-400 text-slate-950 font-black font-mono text-sm tracking-wider">
                  {currentVehicleInfo.plate}
                </span>
              </div>
              {currentVehicleInfo.fleet && currentVehicleInfo.fleet !== '-' && (
                <div className="flex items-center gap-1.5 text-slate-300">
                  <Truck size={14} className="text-cyan-300" />
                  <span>Frota <strong>{currentVehicleInfo.fleet}</strong></span>
                </div>
              )}
              {currentVehicleInfo.operation && currentVehicleInfo.operation !== '-' && (
                <div className="flex items-center gap-1.5 text-slate-300">
                  <Building2 size={14} className="text-cyan-300" />
                  <span>Operação: <strong>{currentVehicleInfo.operation}</strong></span>
                </div>
              )}
              <div className="ml-auto text-[11px] text-cyan-200 bg-white/10 px-3 py-1 rounded-xl">
                <strong>{filteredHistory.length}</strong> {filteredHistory.length === 1 ? 'ação registrada' : 'ações registradas'}
              </div>
            </div>
          )}
        </div>

        {/* Filter & Controls Toolbar */}
        <div className="p-4 bg-slate-50 dark:bg-slate-900/90 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="flex flex-wrap items-center gap-2.5 flex-1 min-w-[280px]">
            {/* Vehicle Selector Dropdown */}
            <div className="flex items-center gap-1.5 min-w-[200px]">
              <label className="text-[11px] font-black uppercase tracking-wider text-slate-400 shrink-0">
                Veículo:
              </label>
              <select
                value={activePlate}
                onChange={(e) => setActivePlate(e.target.value)}
                className="px-3 py-1.5 rounded-xl text-xs font-bold border outline-none bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-200 cursor-pointer shadow-xs focus:ring-2 focus:ring-blue-500 w-full"
              >
                <option value="ALL">Todos os Veículos ({combinedHistory.length} registros)</option>
                {availableVehicles.map(v => (
                  <option key={v.plate} value={v.plate}>
                    {v.plate} {v.fleet && v.fleet !== '-' ? `(Frota ${v.fleet})` : ''} - {v.totalHistory} {v.totalHistory === 1 ? 'ação' : 'ações'}
                  </option>
                ))}
              </select>
            </div>

            {/* Document Filter */}
            {distinctDocTypes.length > 0 && (
              <div className="flex items-center gap-1.5">
                <select
                  value={selectedDocFilter}
                  onChange={(e) => setSelectedDocFilter(e.target.value)}
                  className="px-2.5 py-1.5 rounded-xl text-xs font-bold border outline-none bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 cursor-pointer shadow-xs"
                >
                  <option value="ALL">Todos os Documentos</option>
                  {distinctDocTypes.map(d => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Category Filter */}
            <div className="flex items-center gap-1.5">
              <select
                value={selectedCategoryFilter}
                onChange={(e) => setSelectedCategoryFilter(e.target.value)}
                className="px-2.5 py-1.5 rounded-xl text-xs font-bold border outline-none bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 cursor-pointer shadow-xs"
              >
                <option value="ALL">Todas as Categorias</option>
                <option value="GARAGEM">Parado no Garagem</option>
                <option value="SEM_PREVISAO">Sem Previsão</option>
                <option value="POSTPONED">Próx. Exercício</option>
              </select>
            </div>

            {/* Quick Search Input */}
            <div className="relative min-w-[180px] max-w-xs flex-1">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Buscar em ações, motivos, autor..."
                className="w-full pl-8 pr-3 py-1.5 text-xs rounded-xl border bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-200 outline-none focus:ring-2 focus:ring-blue-500 font-medium"
              />
              {searchTerm && (
                <button
                  onClick={() => setSearchTerm('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  <X size={12} />
                </button>
              )}
            </div>
          </div>

          {/* Right Toolbar: View toggle & Add action */}
          <div className="flex items-center gap-2">
            {/* View Mode Toggle */}
            <div className="flex items-center bg-slate-200/80 dark:bg-slate-800 p-1 rounded-xl">
              <button
                type="button"
                onClick={() => setViewFormat('timeline')}
                className={cn(
                  "px-2.5 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1",
                  viewFormat === 'timeline'
                    ? "bg-white dark:bg-slate-700 text-blue-600 dark:text-cyan-300 shadow-xs"
                    : "text-slate-600 dark:text-slate-400 hover:text-slate-900"
                )}
                title="Exibir como Linha do Tempo"
              >
                <Clock size={13} />
                <span>Linha do Tempo</span>
              </button>
              <button
                type="button"
                onClick={() => setViewFormat('table')}
                className={cn(
                  "px-2.5 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1",
                  viewFormat === 'table'
                    ? "bg-white dark:bg-slate-700 text-blue-600 dark:text-cyan-300 shadow-xs"
                    : "text-slate-600 dark:text-slate-400 hover:text-slate-900"
                )}
                title="Exibir como Tabela Detalhada"
              >
                <Layers size={13} />
                <span>Tabela</span>
              </button>
            </div>

            {/* Sort Order Toggle */}
            <button
              type="button"
              onClick={() => setSortOrder(prev => prev === 'desc' ? 'asc' : 'desc')}
              className="p-1.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors shadow-xs"
              title={`Ordenar por data (${sortOrder === 'desc' ? 'Mais recentes primeiro' : 'Mais antigos primeiro'})`}
            >
              <ArrowUpDown size={14} />
            </button>

            {/* Add action note button */}
            <button
              type="button"
              onClick={() => setIsAddingAction(prev => !prev)}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer shadow-xs",
                isAddingAction
                  ? "bg-rose-50 dark:bg-rose-950/60 text-rose-600 border border-rose-200 dark:border-rose-800"
                  : "bg-blue-600 hover:bg-blue-700 text-white"
              )}
            >
              <Plus size={14} className={isAddingAction ? "rotate-45 transition-transform" : ""} />
              <span>{isAddingAction ? "Cancelar" : "Registrar Ação"}</span>
            </button>
          </div>
        </div>

        {/* Optional: Add action form */}
        {isAddingAction && (
          <form 
            onSubmit={handleSaveNewAction}
            className="p-4 bg-blue-50/70 dark:bg-blue-950/40 border-b border-blue-200 dark:border-blue-900/60 shrink-0 space-y-3 animate-in slide-in-from-top-2"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-black uppercase tracking-wider text-blue-900 dark:text-cyan-300 flex items-center gap-1.5">
                <FileSignature size={15} />
                Registrar Nova Ação ou Despacho no Histórico ({activePlate === 'ALL' ? 'Geral' : `Veículo ${activePlate}`})
              </span>
              <span className="text-[11px] text-blue-700 dark:text-cyan-400">
                Esta ação ficará gravada permanentemente na auditoria do veículo
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <div>
                <label className="text-[10px] font-black uppercase text-slate-500 dark:text-slate-400 block mb-1">
                  Documento / Referência
                </label>
                <input
                  type="text"
                  value={newActionDoc}
                  onChange={(e) => setNewActionDoc(e.target.value)}
                  placeholder="Ex: CRLV, IPVA, SEGURO, DER..."
                  className="w-full px-3 py-1.5 text-xs rounded-xl border bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-700 outline-none focus:ring-2 focus:ring-blue-500 font-bold"
                  required
                />
              </div>

              <div>
                <label className="text-[10px] font-black uppercase text-slate-500 dark:text-slate-400 block mb-1">
                  Autorizado Por
                </label>
                <input
                  type="text"
                  value={newActionAuthorizer}
                  onChange={(e) => setNewActionAuthorizer(e.target.value)}
                  placeholder="Ex: Letícia, Esther, Diretoria..."
                  className="w-full px-3 py-1.5 text-xs rounded-xl border bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-700 outline-none focus:ring-2 focus:ring-blue-500 font-medium"
                  required
                />
              </div>

              <div>
                <label className="text-[10px] font-black uppercase text-slate-500 dark:text-slate-400 block mb-1">
                  Previsão de Ação / Regularização
                </label>
                <input
                  type="text"
                  value={newActionForecast}
                  onChange={(e) => setNewActionForecast(e.target.value)}
                  placeholder="Ex: Regularização em 15 dias..."
                  className="w-full px-3 py-1.5 text-xs rounded-xl border bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-700 outline-none focus:ring-2 focus:ring-blue-500 font-medium"
                />
              </div>

              <div>
                <label className="text-[10px] font-black uppercase text-slate-500 dark:text-slate-400 block mb-1">
                  Motivo / Ação Tomada
                </label>
                <input
                  type="text"
                  value={newActionReason}
                  onChange={(e) => setNewActionReason(e.target.value)}
                  placeholder="Ex: Boleto enviado ao financeiro..."
                  className="w-full px-3 py-1.5 text-xs rounded-xl border bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-700 outline-none focus:ring-2 focus:ring-blue-500 font-medium"
                  required
                />
              </div>
            </div>

            <div className="flex items-center gap-3">
              <input
                type="text"
                value={newActionNotes}
                onChange={(e) => setNewActionNotes(e.target.value)}
                placeholder="Observações complementares ou notas de despacho..."
                className="flex-1 px-3 py-1.5 text-xs rounded-xl border bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-700 outline-none focus:ring-2 focus:ring-blue-500 font-medium"
              />
              <button
                type="submit"
                disabled={isSubmittingAction}
                className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-sm transition-all disabled:opacity-50 cursor-pointer shrink-0"
              >
                {isSubmittingAction ? "Salvando..." : "Salvar no Histórico"}
              </button>
            </div>
          </form>
        )}

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
          {filteredHistory.length === 0 ? (
            <div className="p-12 text-center bg-slate-50/70 dark:bg-slate-800/40 rounded-3xl border border-slate-200 dark:border-slate-800 space-y-3">
              <Clock size={44} className="mx-auto text-slate-300 dark:text-slate-600" />
              <h3 className="text-base font-bold text-slate-700 dark:text-slate-200">
                Nenhum registro histórico encontrado
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">
                {activePlate === 'ALL'
                  ? "Ainda não foram registradas ações no histórico. Qualquer justificativa salva ou atualizada será automaticamente gravada aqui."
                  : `Não constam ações anteriores registradas para o veículo ${activePlate}. Utilize o botão 'Registrar Ação' acima para iniciar o histórico deste veículo.`}
              </p>
            </div>
          ) : viewFormat === 'timeline' ? (
            /* TIMELINE VIEW */
            <div className="relative pl-6 sm:pl-8 space-y-6 before:content-[''] before:absolute before:left-3 sm:before:left-4 before:top-2 before:bottom-2 before:w-0.5 before:bg-gradient-to-b before:from-blue-500 before:via-indigo-500 before:to-slate-300 dark:before:to-slate-700">
              {filteredHistory.map((item, index) => {
                const cat = getJustificationCategoryInfo(item.reason, item.actionForecast, item.observations);
                const isFirst = index === 0;

                return (
                  <div key={item.id || index} className="relative group">
                    {/* Timeline Node Point */}
                    <div className={cn(
                      "absolute -left-6 sm:-left-8 top-1.5 w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all",
                      isFirst 
                        ? "bg-blue-600 border-white text-white shadow-md shadow-blue-500/50 ring-4 ring-blue-500/20" 
                        : "bg-white dark:bg-slate-900 border-blue-500 text-blue-500 group-hover:scale-110"
                    )}>
                      <div className="w-2 h-2 rounded-full bg-current" />
                    </div>

                    {/* Timeline Card */}
                    <div className="p-4 sm:p-5 rounded-2xl border transition-all bg-white dark:bg-slate-800/80 border-slate-200 dark:border-slate-700 hover:border-blue-400 dark:hover:border-blue-500 hover:shadow-md">
                      {/* Card Top: Date & Main Badges */}
                      <div className="flex flex-wrap items-start justify-between gap-2 mb-2.5">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="flex items-center gap-1.5 text-xs font-mono font-black text-slate-800 dark:text-slate-200 bg-slate-100 dark:bg-slate-700/80 px-2.5 py-1 rounded-lg">
                            <Calendar size={13} className="text-blue-500" />
                            {item.updatedAt || 'Data não registrada'}
                          </span>

                          <span className="px-2.5 py-0.5 rounded-lg text-xs font-black font-mono bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-950/70 dark:text-cyan-300 dark:border-blue-800">
                            {item.plate} {item.fleet && item.fleet !== '-' ? `(FROTA ${item.fleet})` : ''}
                          </span>

                          {item.operation && item.operation !== '-' && (
                            <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                              • {item.operation}
                            </span>
                          )}
                        </div>

                        <div className="flex flex-wrap items-center gap-1.5">
                          {cat.label && (
                            <span className={cn("px-2 py-0.5 rounded-md text-[10px] font-bold border", cat.badgeClass)}>
                              {cat.label}
                            </span>
                          )}

                          <span className={cn(
                            "px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider border",
                            item.status === 'vencido' || item.status === 'VENCIDO'
                              ? "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/60 dark:text-rose-300 dark:border-rose-800"
                              : item.status === 'critico' || item.status === 'CRITICO'
                              ? "bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-950/60 dark:text-orange-300 dark:border-orange-800"
                              : item.status === 'atencao' || item.status === 'ATENCAO'
                              ? "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800"
                              : "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800"
                          )}>
                            {item.status || 'REGULAR'}
                          </span>

                          {item.actionType && (
                            <span className="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400">
                              {item.actionType}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Document Type Header */}
                      <div className="mb-2">
                        <span className="text-xs font-black uppercase tracking-wider text-blue-600 dark:text-cyan-400">
                          {item.documentType}
                        </span>
                      </div>

                      {/* Reason / Motivo */}
                      <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-100 dark:border-slate-800 text-xs font-medium text-slate-800 dark:text-slate-200 mb-2.5">
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-0.5">
                          Motivo / Justificativa:
                        </span>
                        <p className="font-semibold leading-relaxed">
                          "{item.reason || 'Sem motivo detalhado'}"
                        </p>
                      </div>

                      {/* Metadata Row: Authorizer & Forecast */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                        <div className="flex items-center gap-2 p-2 rounded-lg bg-slate-100/70 dark:bg-slate-800/60 text-slate-700 dark:text-slate-300">
                          <UserCheck size={14} className="text-blue-500 shrink-0" />
                          <div>
                            <span className="text-[9px] font-black uppercase tracking-wider text-slate-400 block">Autorizado Por:</span>
                            <span className="font-bold">{item.authorizedBy || '-'}</span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 p-2 rounded-lg bg-slate-100/70 dark:bg-slate-800/60 text-slate-700 dark:text-slate-300">
                          <Calendar size={14} className="text-indigo-500 shrink-0" />
                          <div>
                            <span className="text-[9px] font-black uppercase tracking-wider text-slate-400 block">Previsão de Ação:</span>
                            <span className="font-bold">{item.actionForecast || '-'}</span>
                          </div>
                        </div>
                      </div>

                      {/* Observations if present */}
                      {item.observations && (
                        <div className="mt-2.5 pt-2 border-t border-slate-100 dark:border-slate-700/60 text-xs text-slate-600 dark:text-slate-300 flex items-start gap-2">
                          <MessageSquare size={13} className="text-slate-400 shrink-0 mt-0.5" />
                          <div>
                            <strong className="text-slate-700 dark:text-slate-200">Observações: </strong>
                            <span>{item.observations}</span>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            /* TABLE VIEW */
            <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-black text-[11px] uppercase tracking-wider border-b border-slate-200 dark:border-slate-700">
                    <th className="py-3 px-3.5">Data / Hora</th>
                    <th className="py-3 px-3.5">Placa</th>
                    <th className="py-3 px-3.5">Frota</th>
                    <th className="py-3 px-3.5">Documento</th>
                    <th className="py-3 px-3.5 text-center">Status</th>
                    <th className="py-3 px-3.5">Motivo / Ação Tomada</th>
                    <th className="py-3 px-3.5">Autorizado Por</th>
                    <th className="py-3 px-3.5">Previsão</th>
                    <th className="py-3 px-3.5">Observações</th>
                    <th className="py-3 px-3.5 text-center">Categoria</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {filteredHistory.map((item, idx) => {
                    const cat = getJustificationCategoryInfo(item.reason, item.actionForecast, item.observations);

                    return (
                      <tr 
                        key={item.id || idx}
                        className="hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors font-medium text-slate-800 dark:text-slate-200"
                      >
                        <td className="py-2.5 px-3.5 whitespace-nowrap font-mono text-[11px] font-bold text-slate-600 dark:text-slate-400">
                          {item.updatedAt || '-'}
                        </td>
                        <td className="py-2.5 px-3.5 whitespace-nowrap font-mono font-black text-blue-600 dark:text-cyan-400">
                          {item.plate}
                        </td>
                        <td className="py-2.5 px-3.5 whitespace-nowrap font-mono font-bold text-slate-600 dark:text-slate-400">
                          {item.fleet || '-'}
                        </td>
                        <td className="py-2.5 px-3.5 font-bold text-slate-900 dark:text-white uppercase">
                          {item.documentType}
                        </td>
                        <td className="py-2.5 px-3.5 text-center">
                          <span className={cn(
                            "px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider",
                            item.status === 'vencido' || item.status === 'VENCIDO'
                              ? "bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300"
                              : item.status === 'critico' || item.status === 'CRITICO'
                              ? "bg-orange-50 text-orange-700 dark:bg-orange-950/60 dark:text-orange-300"
                              : "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300"
                          )}>
                            {item.status || 'OK'}
                          </span>
                        </td>
                        <td className="py-2.5 px-3.5 min-w-[200px] text-slate-700 dark:text-slate-300">
                          {item.reason}
                        </td>
                        <td className="py-2.5 px-3.5 whitespace-nowrap font-semibold">
                          {item.authorizedBy || '-'}
                        </td>
                        <td className="py-2.5 px-3.5 whitespace-nowrap text-slate-600 dark:text-slate-400">
                          {item.actionForecast || '-'}
                        </td>
                        <td className="py-2.5 px-3.5 min-w-[150px] text-slate-500 dark:text-slate-400 text-[11px]">
                          {item.observations || '-'}
                        </td>
                        <td className="py-2.5 px-3.5 text-center whitespace-nowrap">
                          {cat.label ? (
                            <span className={cn("px-2 py-0.5 rounded text-[10px] font-bold border", cat.badgeClass)}>
                              {cat.shortLabel}
                            </span>
                          ) : (
                            <span className="text-slate-400 text-[10px]">-</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-4 bg-slate-50 dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs shrink-0">
          <div className="flex items-center gap-3 text-slate-500 dark:text-slate-400">
            <span>Exibindo <strong>{filteredHistory.length}</strong> de <strong>{historyItems.length}</strong> ações registradas</span>
            {activePlate !== 'ALL' && (
              <button
                type="button"
                onClick={() => setActivePlate('ALL')}
                className="font-bold text-blue-600 dark:text-cyan-400 hover:underline cursor-pointer"
              >
                Ver todos os veículos
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-bold bg-slate-200 hover:bg-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition-colors cursor-pointer"
            >
              Fechar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
