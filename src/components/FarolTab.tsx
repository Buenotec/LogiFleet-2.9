import React, { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import { Vehicle, Document } from '../types';
import { cn } from '../lib/utils';
import { 
  AlertTriangle, Clock, XCircle, CheckCircle2, Search, Filter, Layers, 
  ChevronDown, Sparkles, FileText, Download, Check, X, ShieldAlert,
  Loader2, Info, Truck, HelpCircle
} from 'lucide-react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { format } from 'date-fns';
import { FarolFloatingTooltip, FarolTooltipType } from './FarolTooltip3D';
import { MultiSelectFilter, MultiSelectOption } from './MultiSelectFilter';

const MercosulPlate = ({ plate }: { plate: string }) => {
  const isPedido = plate && plate.toUpperCase().startsWith("PED");
  const isFrotaOnly = plate && plate.toUpperCase().startsWith("FROTA_");

  if (isPedido || isFrotaOnly) {
    const label = isPedido ? "PEDIDO" : "FROTA";
    const val = isPedido ? plate.replace(/^PED\.?\s*/i, 'PED. ') : plate.replace(/^FROTA_/, '');
    return (
      <div className="relative w-28 h-9 bg-slate-800 text-white rounded-md shadow-sm flex flex-col overflow-hidden items-center justify-between border border-blue-500/40 shrink-0 select-none">
        <div className="w-full bg-blue-600/90 h-2.5 flex items-center justify-center px-1">
          <span className="text-[6px] text-blue-100 font-black tracking-[0.15em] uppercase leading-none">{label}</span>
        </div>
        <div className="flex-1 flex items-center justify-center w-full px-1">
          <span className="text-white font-mono font-black text-xs tracking-wider truncate">{val}</span>
        </div>
      </div>
    );
  }

  const formattedPlate = plate ? plate.replace(/[^a-zA-Z0-9]/g, '').toUpperCase() : 'N/A';
  const displayPlate = formattedPlate.length === 7 
    ? `${formattedPlate.substring(0,3)} ${formattedPlate.substring(3)}`
    : plate || 'N/A';

  return (
    <div className="relative w-28 h-9 bg-white rounded-md shadow-sm flex flex-col overflow-hidden items-center justify-between border-2 border-slate-300 shrink-0 select-none">
      <div className="w-full bg-[#003399] h-2.5 flex items-center justify-between px-1">
        <div className="w-1.5 h-1.5 flex items-center justify-center">
           <img src="https://upload.wikimedia.org/wikipedia/commons/thumb/1/1a/Mercosur_logo.svg/1024px-Mercosur_logo.svg.png" className="max-w-full max-h-full object-contain opacity-90" alt="mercosul" />
        </div>
        <span className="text-[5px] text-white font-black tracking-[0.2em] uppercase leading-none mt-[1px]">BRASIL</span>
        <div className="w-1.5 h-1.5 flex items-center justify-center">
           <img src="https://upload.wikimedia.org/wikipedia/commons/thumb/0/05/Flag_of_Brazil.svg/2560px-Flag_of_Brazil.svg.png" className="max-w-full max-h-full object-contain opacity-90" alt="br" />
        </div>
      </div>
      <div className="flex-1 flex items-center justify-center w-full bg-white relative">
        <span className="text-black font-sans font-black text-sm tracking-[0.1em]">{displayPlate}</span>
      </div>
    </div>
  );
};

interface FarolTabProps {
  baseFleet: Vehicle[];
  mode?: 'licencas' | 'documentacao';
  renderModernPDFHeader?: (doc: any, options: any) => void;
  loadPDFLogo?: () => Promise<HTMLImageElement | null>;
  includePdfSummaries?: boolean;
  companyName?: string;
}

const UNI_LOGO_DEFAULT = "https://raw.githubusercontent.com/Buenotec/Logo_UNI/refs/heads/main/logo_uni.png";

const formatPlateForPDF = (plate?: string) => {
  if (!plate) return '-';
  const clean = plate.trim().toUpperCase();
  if (clean.startsWith('PED')) return clean.replace(/^PED\.?\s*/i, 'PED. ');
  if (clean.startsWith('FROTA_')) return clean.replace(/^FROTA_/, 'FROTA ');
  const alnum = clean.replace(/[^A-Z0-9]/g, '');
  if (alnum.length === 7) {
    return `${alnum.substring(0, 3)} ${alnum.substring(3)}`;
  }
  return clean;
};

export function FarolTab({ 
  baseFleet, 
  mode = 'licencas',
  renderModernPDFHeader,
  loadPDFLogo,
  includePdfSummaries = true,
  companyName = 'LogiFleet'
}: FarolTabProps) {
  const [filterAlertsOnly, setFilterAlertsOnly] = useState(false);
  const [selectedPlates, setSelectedPlates] = useState<string[]>([]);
  const [selectedFleets, setSelectedFleets] = useState<string[]>([]);
  const [selectedLicenses, setSelectedLicenses] = useState<string[]>([]);
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>([]);
  const [activeTooltip, setActiveTooltip] = useState<FarolTooltipType | null>(null);

  // PDF Export States
  const [showPdfModal, setShowPdfModal] = useState(false);
  const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);
  const [pdfScope, setPdfScope] = useState<'filtered' | 'all'>('filtered');
  const [pdfIncludeSummaries, setPdfIncludeSummaries] = useState(true);
  const [pdfIncludeMatrix, setPdfIncludeMatrix] = useState(true);
  const [pdfIncludeActionPlan, setPdfIncludeActionPlan] = useState(true);
  const [pdfSuccessToast, setPdfSuccessToast] = useState<string | null>(null);

  const handleShowTooltip = (
    e: React.MouseEvent<HTMLElement>,
    dataCreator: (coords: { x: number; y: number; placement: 'top' | 'bottom' }) => FarolTooltipType
  ) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = Math.max(165, Math.min(window.innerWidth - 165, rect.left + rect.width / 2));
    const placement = rect.top > 280 ? 'top' : 'bottom';
    const y = placement === 'top' ? rect.top - 6 : rect.bottom + 6;
    setActiveTooltip(dataCreator({ x, y, placement }));
  };

  const handleHideTooltip = () => {
    setActiveTooltip(null);
  };

  // When in documentacao mode, consolidate records belonging to the same vehicle
  const consolidatedFleet = useMemo(() => {
    if (mode !== 'documentacao') {
      return baseFleet;
    }

    const vehicleMap = new Map<string, Vehicle>();
    const statusPriority: Record<string, number> = { vencido: 0, critico: 1, atencao: 2, ok: 3, regular: 3, pagos: 4 };

    baseFleet.forEach(v => {
      const p = (v.plate || "").toUpperCase().trim();
      const f = (v.fleet || "").toString().trim();
      const key = (p && p !== "VÁZIO" && p !== "VAZIO" && p !== "-")
        ? p
        : (f ? `FROTA_${f}` : v.id);

      // Clean operation name
      const opName = v.extraData?.["Filial"] || (v.operation === "DOC_SISTEMA" ? "GLOBUS" : v.operation) || v.client || "-";

      if (!vehicleMap.has(key)) {
        vehicleMap.set(key, {
          ...v,
          operation: opName,
          documents: (v.documents || []).map(d => ({
            ...d,
            type: (d.type || v.extraData?.["Descrição"] || "Documento").trim()
          }))
        });
      } else {
        const existing = vehicleMap.get(key)!;
        if (!existing.fleet && v.fleet) existing.fleet = v.fleet;
        if ((!existing.operation || existing.operation === "-" || existing.operation === "DOC_SISTEMA") && opName && opName !== "DOC_SISTEMA") {
          existing.operation = opName;
        }

        (v.documents || []).forEach(newDoc => {
          const docType = (newDoc.type || v.extraData?.["Descrição"] || "Documento").trim();
          const normalizedDoc = { ...newDoc, type: docType };
          const existingDocIdx = existing.documents.findIndex(d => d.type.toUpperCase() === docType.toUpperCase());

          if (existingDocIdx === -1) {
            existing.documents.push(normalizedDoc);
          } else {
            const currentDoc = existing.documents[existingDocIdx];
            const currentPri = statusPriority[currentDoc.status] ?? 3;
            const newPri = statusPriority[normalizedDoc.status] ?? 3;
            if (newPri < currentPri) {
              existing.documents[existingDocIdx] = normalizedDoc;
            }
          }
        });
      }
    });

    return Array.from(vehicleMap.values());
  }, [baseFleet, mode]);

  // All unique available licenses/documents in the fleet
  const allLicenses = useMemo(() => {
    const types = new Set<string>();
    consolidatedFleet.forEach(v => {
      v.documents.forEach(d => {
        if (d.type && d.type.trim() !== "") {
          types.add(d.type.trim());
        }
      });
    });
    return Array.from(types).sort((a, b) => a.localeCompare(b));
  }, [consolidatedFleet]);

  // If licenses are selected in the multi-select, display those columns; otherwise, display all
  const displayedDocTypes = useMemo(() => {
    if (selectedLicenses.length === 0) return allLicenses;
    return allLicenses.filter(lic => 
      selectedLicenses.some(sl => sl.trim().toUpperCase() === lic.trim().toUpperCase())
    );
  }, [allLicenses, selectedLicenses]);

  // Keep allDocTypes as an alias for displayedDocTypes to avoid breaking any callers
  const allDocTypes = displayedDocTypes;

  // Available unique plates for autocomplete and multi-select
  const availablePlates = useMemo(() => {
    const plates = new Set<string>();
    consolidatedFleet.forEach(v => {
      if (v.plate && v.plate.trim() && v.plate !== '-' && !v.plate.startsWith('FROTA_')) {
        plates.add(v.plate.trim().toUpperCase());
      }
    });
    return Array.from(plates).sort((a, b) => a.localeCompare(b));
  }, [consolidatedFleet]);

  // Available unique fleets for autocomplete and multi-select
  const availableFleets = useMemo(() => {
    const fleets = new Set<string>();
    consolidatedFleet.forEach(v => {
      if (v.fleet && String(v.fleet).trim() && String(v.fleet) !== '-') {
        fleets.add(String(v.fleet).trim());
      }
    });
    return Array.from(fleets).sort((a, b) => {
      const nA = parseInt(a, 10);
      const nB = parseInt(b, 10);
      if (!isNaN(nA) && !isNaN(nB)) return nA - nB;
      return a.localeCompare(b);
    });
  }, [consolidatedFleet]);

  // Helper to categorize a document status
  const getDocStatusCategory = (doc?: Document): 'vencido' | 'critico' | 'atencao' | 'ok' | 'sem_registro' => {
    if (!doc) return 'sem_registro';
    if (doc.status === 'vencido') return 'vencido';
    if (doc.status === 'critico') return 'critico';
    if (doc.status === 'atencao') return 'atencao';
    if (doc.status === 'pagos' || doc.status === 'ok' || doc.status === 'regular' || (doc.expiryDate && doc.daysRemaining > 45)) return 'ok';
    return 'ok';
  };

  // Fleet counts for badges in multi-select
  const fleetCounts = useMemo(() => {
    const counts = new Map<string, number>();
    consolidatedFleet.forEach(v => {
      if (v.fleet && String(v.fleet).trim() && String(v.fleet) !== '-') {
        const f = String(v.fleet).trim();
        counts.set(f, (counts.get(f) || 0) + 1);
      }
    });
    return counts;
  }, [consolidatedFleet]);

  // Options for MultiSelect Placa
  const plateOptions: MultiSelectOption[] = useMemo(() => {
    return availablePlates.map(p => ({
      value: p,
      label: p
    }));
  }, [availablePlates]);

  // Options for MultiSelect Frota
  const fleetOptions: MultiSelectOption[] = useMemo(() => {
    return availableFleets.map(f => ({
      value: f,
      label: `Frota ${f}`,
      count: fleetCounts.get(f) || 0
    }));
  }, [availableFleets, fleetCounts]);

  // Options for MultiSelect Licenças
  const licenseOptions: MultiSelectOption[] = useMemo(() => {
    return allLicenses.map(lic => {
      let count = 0;
      consolidatedFleet.forEach(v => {
        if (v.documents.some(d => d.type.trim().toUpperCase() === lic.trim().toUpperCase())) {
          count++;
        }
      });
      return {
        value: lic,
        label: lic,
        count
      };
    });
  }, [allLicenses, consolidatedFleet]);

  // Options for MultiSelect Status
  const statusOptions: MultiSelectOption[] = useMemo(() => {
    let countVencido = 0;
    let countCritico = 0;
    let countAtencao = 0;
    let countOk = 0;
    let countSemRegistro = 0;

    consolidatedFleet.forEach(v => {
      if (selectedLicenses.length > 0) {
        const relevantDocs = v.documents.filter(d => 
          selectedLicenses.some(sl => sl.trim().toUpperCase() === d.type.trim().toUpperCase())
        );
        if (relevantDocs.length > 0) {
          relevantDocs.forEach(doc => {
            const cat = getDocStatusCategory(doc);
            if (cat === 'vencido') countVencido++;
            else if (cat === 'critico') countCritico++;
            else if (cat === 'atencao') countAtencao++;
            else if (cat === 'ok') countOk++;
            else if (cat === 'sem_registro') countSemRegistro++;
          });
        } else {
          countSemRegistro++;
        }
      } else {
        if (v.documents.some(d => d.status === 'vencido')) countVencido++;
        if (v.documents.some(d => d.status === 'critico')) countCritico++;
        if (v.documents.some(d => d.status === 'atencao')) countAtencao++;
        if (v.documents.some(d => d.status === 'ok' || d.status === 'regular' || d.status === 'pagos' || (d.expiryDate && d.daysRemaining > 45))) countOk++;
        if (v.documents.length === 0 || allLicenses.some(type => !v.documents.some(d => d.type.trim().toUpperCase() === type.toUpperCase()))) countSemRegistro++;
      }
    });

    return [
      {
        value: 'vencido',
        label: 'Vencido',
        count: countVencido,
        colorDot: 'bg-rose-500',
        icon: <XCircle size={13} className="text-rose-500" />
      },
      {
        value: 'critico',
        label: 'Crítico (≤ 15d)',
        count: countCritico,
        colorDot: 'bg-amber-500',
        icon: <AlertTriangle size={13} className="text-amber-500" />
      },
      {
        value: 'atencao',
        label: 'Em Atenção (≤ 30d)',
        count: countAtencao,
        colorDot: 'bg-blue-500',
        icon: <Clock size={13} className="text-blue-500" />
      },
      {
        value: 'ok',
        label: 'Regular / Pago',
        count: countOk,
        colorDot: 'bg-emerald-500',
        icon: <CheckCircle2 size={13} className="text-emerald-500" />
      },
      {
        value: 'sem_registro',
        label: 'Sem Registro',
        count: countSemRegistro,
        colorDot: 'bg-slate-400',
        icon: <HelpCircle size={13} className="text-slate-400" />
      }
    ];
  }, [consolidatedFleet, selectedLicenses, allLicenses]);

  const vehiclesToDisplay = useMemo(() => {
    let filtered = consolidatedFleet;

    // Filter by selected licenses (multi-select / flegue)
    if (selectedLicenses.length > 0) {
      filtered = filtered.filter(v => 
        v.documents.some(d => selectedLicenses.some(sl => sl.trim().toUpperCase() === d.type.trim().toUpperCase()))
      );
    }

    // Filter by selected plates (multi-select / flegue)
    if (selectedPlates.length > 0) {
      filtered = filtered.filter(v => 
        v.plate && selectedPlates.some(sp => sp.toUpperCase() === v.plate.trim().toUpperCase())
      );
    }

    // Filter by selected fleets (multi-select / flegue)
    if (selectedFleets.length > 0) {
      filtered = filtered.filter(v => 
        v.fleet && selectedFleets.includes(String(v.fleet).trim())
      );
    }

    // Filter by selected document statuses (multi-select / flegue)
    if (selectedStatuses.length > 0) {
      filtered = filtered.filter(v => {
        if (selectedLicenses.length > 0) {
          const docs = v.documents.filter(d => 
            selectedLicenses.some(sl => sl.trim().toUpperCase() === d.type.trim().toUpperCase())
          );
          if (docs.length === 0) {
            return selectedStatuses.includes('sem_registro');
          }
          return docs.some(d => selectedStatuses.includes(getDocStatusCategory(d)));
        }
        const matchesDoc = v.documents.some(d => selectedStatuses.includes(getDocStatusCategory(d)));
        const matchesSemRegistro = selectedStatuses.includes('sem_registro') && (
          v.documents.length === 0 || allDocTypes.some(type => !v.documents.some(d => d.type.trim().toUpperCase() === type.toUpperCase()))
        );
        return matchesDoc || matchesSemRegistro;
      });
    }

    // Filter by alerts only
    if (filterAlertsOnly) {
      filtered = filtered.filter(v => {
        if (selectedLicenses.length > 0) {
          const docs = v.documents.filter(d => 
            selectedLicenses.some(sl => sl.trim().toUpperCase() === d.type.trim().toUpperCase())
          );
          return docs.some(d => d.status === 'vencido' || d.status === 'critico' || d.status === 'atencao');
        }
        return v.documents.some(d => d.status === 'vencido' || d.status === 'critico' || d.status === 'atencao');
      });
    }

    // Sort by worst status
    return filtered.sort((a, b) => {
      const getScore = (v: Vehicle) => {
        if (selectedLicenses.length === 1) {
          const doc = v.documents.find(d => d.type.trim().toUpperCase() === selectedLicenses[0].trim().toUpperCase());
          if (!doc) return 0;
          if (doc.status === 'vencido') return 4;
          if (doc.status === 'critico') return 3;
          if (doc.status === 'atencao') return 2;
          return 1;
        }
        if (v.documents.some(d => d.status === 'vencido')) return 4;
        if (v.documents.some(d => d.status === 'critico')) return 3;
        if (v.documents.some(d => d.status === 'atencao')) return 2;
        return 1;
      };
      return getScore(b) - getScore(a) || (a.plate || "").localeCompare(b.plate || "");
    });
  }, [consolidatedFleet, filterAlertsOnly, selectedPlates, selectedFleets, selectedLicenses, selectedStatuses, allDocTypes]);

  const getStatusConfig = (doc?: Document) => {
    if (!doc) {
      return {
        bg: 'bg-slate-100/40 dark:bg-slate-800/30',
        text: 'text-slate-400 dark:text-slate-500',
        border: 'border-slate-200/50 dark:border-slate-800/60',
        hoverGlow: 'hover:border-slate-600/80 hover:bg-slate-800/50 hover:shadow-[0_0_12px_rgba(100,116,139,0.3)]',
        icon: null,
        label: '-'
      };
    }
    if (doc.status === 'vencido') return { 
      bg: 'bg-rose-500/15 dark:bg-rose-500/20',
      text: 'text-rose-700 dark:text-rose-400',
      border: 'border-rose-300 dark:border-rose-500/40',
      hoverGlow: 'hover:border-rose-400 hover:shadow-[0_0_16px_rgba(244,63,94,0.65)] hover:bg-rose-500/30',
      icon: <XCircle size={14} className="drop-shadow-[0_0_4px_rgba(244,63,94,0.7)] text-rose-500 dark:text-rose-400" />,
      label: 'VENCIDO'
    };
    if (doc.status === 'critico') return { 
      bg: 'bg-amber-500/15 dark:bg-amber-500/20',
      text: 'text-amber-700 dark:text-amber-400',
      border: 'border-amber-300 dark:border-amber-500/40',
      hoverGlow: 'hover:border-amber-400 hover:shadow-[0_0_16px_rgba(245,158,11,0.65)] hover:bg-amber-500/30',
      icon: <AlertTriangle size={14} className="drop-shadow-[0_0_4px_rgba(245,158,11,0.7)] text-amber-500 dark:text-amber-400" />,
      label: `${doc.daysRemaining}d`
    };
    if (doc.status === 'atencao') return { 
      bg: 'bg-blue-500/15 dark:bg-blue-500/20',
      text: 'text-blue-700 dark:text-blue-400',
      border: 'border-blue-300 dark:border-blue-500/40',
      hoverGlow: 'hover:border-blue-400 hover:shadow-[0_0_16px_rgba(59,130,246,0.65)] hover:bg-blue-500/30',
      icon: <Clock size={14} className="drop-shadow-[0_0_4px_rgba(59,130,246,0.7)] text-blue-500 dark:text-blue-400" />,
      label: `${doc.daysRemaining}d`
    };
    if (doc.status === 'pagos') return { 
      bg: 'bg-emerald-500/10 dark:bg-emerald-500/15',
      text: 'text-emerald-700 dark:text-emerald-400',
      border: 'border-emerald-200 dark:border-emerald-500/30',
      hoverGlow: 'hover:border-emerald-400 hover:shadow-[0_0_16px_rgba(16,185,129,0.65)] hover:bg-emerald-500/25',
      icon: <CheckCircle2 size={14} className="opacity-80 text-emerald-600 dark:text-emerald-400 drop-shadow-[0_0_4px_rgba(16,185,129,0.6)]" />,
      label: 'PAGO'
    };
    // For any other status (like 'ok', 'regular', or undefined status but existing document), show as regular as long as there is an expiry date or it's explicitly ok
    if ((doc.status as string) === 'regular' || (doc.status as string) === 'ok' || (doc.expiryDate && doc.daysRemaining > 45)) return { 
      bg: 'bg-emerald-500/10 dark:bg-emerald-500/15',
      text: 'text-emerald-700 dark:text-emerald-400',
      border: 'border-emerald-200 dark:border-emerald-500/30',
      hoverGlow: 'hover:border-emerald-400 hover:shadow-[0_0_16px_rgba(16,185,129,0.65)] hover:bg-emerald-500/25',
      icon: <CheckCircle2 size={14} className="opacity-80 text-emerald-600 dark:text-emerald-400 drop-shadow-[0_0_4px_rgba(16,185,129,0.6)]" />,
      label: doc.expiryDate || 'REGULAR'
    };
    
    // Fallback if it has a document but somehow slipped through
    return {
      bg: 'bg-slate-100 dark:bg-slate-800',
      text: 'text-slate-600 dark:text-slate-400',
      border: 'border-slate-200 dark:border-slate-700',
      hoverGlow: 'hover:border-slate-400 hover:shadow-[0_0_12px_rgba(148,163,184,0.4)]',
      icon: <CheckCircle2 size={14} className="opacity-70 text-slate-400" />,
      label: doc.expiryDate || 'OK'
    };
  };

  const getRowGlow = (v: Vehicle) => {
    if (v.documents.some(d => d.status === 'vencido')) return 'shadow-[inset_4px_0_0_0_#e11d48] bg-rose-50/30 dark:bg-rose-900/10';
    if (v.documents.some(d => d.status === 'critico')) return 'shadow-[inset_4px_0_0_0_#d97706] bg-amber-50/30 dark:bg-amber-900/10';
    if (v.documents.some(d => d.status === 'atencao')) return 'shadow-[inset_4px_0_0_0_#2563eb] bg-blue-50/30 dark:bg-blue-900/10';
    return 'shadow-[inset_4px_0_0_0_#059669]';
  };

  // ----------------------------------------------------
  // PDF EXPORT ENGINE (A4 HORIZONTAL / LANDSCAPE)
  // ----------------------------------------------------
  const getLogoImage = async (): Promise<HTMLImageElement | null> => {
    if (loadPDFLogo) {
      try {
        const img = await loadPDFLogo();
        if (img) return img;
      } catch (err) {
        console.warn('loadPDFLogo failed, using fallback', err);
      }
    }
    try {
      return await new Promise<HTMLImageElement | null>((resolve) => {
        const img = new Image();
        img.crossOrigin = 'Anonymous';
        img.onload = () => resolve(img);
        img.onerror = () => resolve(null);
        img.src = UNI_LOGO_DEFAULT;
      });
    } catch {
      return null;
    }
  };

  const drawCorporateHeader = (
    doc: any,
    options: {
      title: string;
      subtitle?: string;
      badgeText?: string;
      rightMetaText?: string;
      loadedImg?: HTMLImageElement | null;
      height?: number;
    }
  ) => {
    if (renderModernPDFHeader) {
      renderModernPDFHeader(doc, {
        ...options,
        height: options.height || 32
      });
      return;
    }

    const pageWidth = doc.internal.pageSize.getWidth();
    const bannerHeight = options.height || 32;

    // Corporate Navy Banner (#1A368A)
    doc.setFillColor(26, 54, 138);
    doc.rect(0, 0, pageWidth, bannerHeight, 'F');

    // Accent line (#3B82F6)
    doc.setFillColor(59, 130, 246);
    doc.rect(0, bannerHeight - 1.2, pageWidth, 1.2, 'F');

    const logoX = 14;
    let logoW = 0;
    if (options.loadedImg) {
      try {
        const maxH = bannerHeight - 10;
        const maxW = 34;
        const naturalW = options.loadedImg.naturalWidth || options.loadedImg.width || 1;
        const naturalH = options.loadedImg.naturalHeight || options.loadedImg.height || 1;
        const aspect = naturalW / naturalH;
        let targetW = maxW;
        let targetH = maxH;
        if (aspect >= 1) {
          targetW = Math.min(maxW, maxH * aspect);
          targetH = targetW / aspect;
        } else {
          targetH = maxH;
          targetW = targetH * aspect;
        }
        const logoY = 5 + (maxH - targetH) / 2;
        doc.addImage(options.loadedImg, 'PNG', logoX, logoY, targetW, targetH);
        logoW = targetW;
      } catch (e) {
        console.error("Error drawing logo in PDF", e);
      }
    }

    const textStartX = logoW > 0 ? (logoX + logoW + 6) : 14;
    const rightMarginX = pageWidth - 14;
    const reservedRightWidth = 68;
    const availableTitleWidth = rightMarginX - textStartX - reservedRightWidth;

    // Eyebrow
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.setTextColor(191, 219, 254);
    const companyTag = `${(companyName || "LOGIFLEET").toUpperCase()} • GESTÃO DE FROTAS & CONFORMIDADE`;
    doc.text(companyTag, textStartX, 10.5);

    // Title
    doc.setFont("helvetica", "bold");
    doc.setTextColor(255, 255, 255);
    let titleFontSize = 13;
    doc.setFontSize(titleFontSize);
    while (doc.getTextWidth(options.title) > availableTitleWidth && titleFontSize > 8.5) {
      titleFontSize -= 0.5;
      doc.setFontSize(titleFontSize);
    }
    doc.text(options.title, textStartX, 18.5);

    // Subtitle
    if (options.subtitle) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.5);
      doc.setTextColor(226, 232, 240);
      let sub = options.subtitle;
      if (doc.getTextWidth(sub) > availableTitleWidth + 28) {
        while (doc.getTextWidth(sub + "...") > (availableTitleWidth + 28) && sub.length > 10) {
          sub = sub.slice(0, -1);
        }
        sub += "...";
      }
      doc.text(sub, textStartX, 25.5);
    }

    // Badge
    const badge = options.badgeText || "FAROL A4 HORIZONTAL";
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    const badgeTextW = doc.getTextWidth(badge);
    const badgeW = Math.max(38, badgeTextW + 8);
    const badgeH = 5;
    doc.setFillColor(37, 99, 235);
    doc.roundedRect(rightMarginX - badgeW, 5.5, badgeW, badgeH, 1.2, 1.2, 'F');
    doc.setTextColor(255, 255, 255);
    doc.text(badge, rightMarginX - (badgeW / 2), 9, { align: "center" });

    // Date
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(219, 234, 254);
    doc.text(`Emissão: ${format(new Date(), "dd/MM/yyyy HH:mm")}`, rightMarginX, 18, { align: "right" });

    // Right Meta Text
    if (options.rightMetaText) {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(7.5);
      doc.setTextColor(255, 255, 255);
      doc.text(options.rightMetaText, rightMarginX, 25.5, { align: "right" });
    }
  };

  const handleExportFarolPDF = async () => {
    setIsGeneratingPDF(true);
    try {
      // 1. Prepare target fleet according to selected scope
      const targetFleet = pdfScope === 'filtered' ? vehiclesToDisplay : consolidatedFleet;

      // Sort by urgency: vencidos first, then criticos, then atencao, then plate
      const sortedFleet = [...targetFleet].sort((a, b) => {
        const aHasVencido = a.documents.some(d => d.status === 'vencido');
        const bHasVencido = b.documents.some(d => d.status === 'vencido');
        if (aHasVencido !== bHasVencido) return aHasVencido ? -1 : 1;
        const aHasCritico = a.documents.some(d => d.status === 'critico');
        const bHasCritico = b.documents.some(d => d.status === 'critico');
        if (aHasCritico !== bHasCritico) return aHasCritico ? -1 : 1;
        return (a.plate || '').localeCompare(b.plate || '');
      });

      // 2. Calculate Indicators
      const totalVehicles = sortedFleet.length;
      const vehiclesWithAlerts = sortedFleet.filter(v => 
        v.documents.some(d => d.status === 'vencido' || d.status === 'critico' || d.status === 'atencao')
      ).length;

      const totalVencidos = sortedFleet.reduce((acc, v) => 
        acc + v.documents.filter(d => d.status === 'vencido').length, 0);
      const totalCriticos = sortedFleet.reduce((acc, v) => 
        acc + v.documents.filter(d => d.status === 'critico').length, 0);
      const totalAtencao = sortedFleet.reduce((acc, v) => 
        acc + v.documents.filter(d => d.status === 'atencao').length, 0);
      const totalRegulares = sortedFleet.reduce((acc, v) => 
        acc + v.documents.filter(d => d.status === 'ok' || (d.status as string) === 'regular' || d.status === 'pagos' || (d.expiryDate && d.daysRemaining > 45)).length, 0);

      const totalDocsEvaluated = totalVencidos + totalCriticos + totalAtencao + totalRegulares;
      const complianceRate = totalDocsEvaluated > 0 
        ? Math.round((totalRegulares / totalDocsEvaluated) * 100) 
        : 100;

      // 3. Load Logo
      const loadedImg = await getLogoImage();

      // 4. Initialize jsPDF in A4 Landscape
      const doc = new jsPDF({
        orientation: 'landscape',
        unit: 'mm',
        format: 'a4'
      });

      const pageWidth = doc.internal.pageSize.getWidth(); // 297mm
      const pageHeight = doc.internal.pageSize.getHeight(); // 210mm
      const marginX = 12;
      const printableWidth = pageWidth - (marginX * 2); // 273mm

      const reportTitle = mode === 'documentacao' 
        ? 'RELATÓRIO FAROL DE CONFORMIDADE • DOCUMENTAÇÃO' 
        : 'RELATÓRIO FAROL DE CONFORMIDADE • LICENÇAS';
      
      const statusLabelsMap: Record<string, string> = {
        vencido: 'Vencido',
        critico: 'Crítico',
        atencao: 'Atenção',
        ok: 'Regular',
        sem_registro: 'Sem Registro'
      };

      const activeFiltersDesc = [
        selectedLicenses.length > 0 ? `Licenças: ${selectedLicenses.join(', ')}` : 'Todas as Licenças',
        selectedPlates.length > 0 ? `Placas: ${selectedPlates.join(', ')}` : null,
        selectedFleets.length > 0 ? `Frotas: ${selectedFleets.join(', ')}` : null,
        selectedStatuses.length > 0 ? `Status: ${selectedStatuses.map(s => statusLabelsMap[s] || s).join(', ')}` : null,
        filterAlertsOnly ? 'Apenas Alertas' : null
      ].filter(Boolean).join(' • ');

      const subtitle = `${activeFiltersDesc} | Escopo: ${pdfScope === 'filtered' ? `Filtro Atual (${targetFleet.length} veículos)` : `Frota Completa (${targetFleet.length} veículos)`} | Análise Regulamentar`;

      // Draw Main Header
      drawCorporateHeader(doc, {
        title: reportTitle,
        subtitle,
        badgeText: "FAROL A4 HORIZONTAL",
        rightMetaText: `${totalVehicles} VEÍCULOS ANALISADOS`,
        loadedImg,
        height: 32
      });

      let currentY = 36;

      // 5. Executive Summary Cards (if enabled)
      if (pdfIncludeSummaries && includePdfSummaries) {
        const boxH = 17;
        doc.setFillColor(248, 250, 252);
        doc.roundedRect(marginX, currentY, printableWidth, boxH, 2, 2, 'F');
        doc.setDrawColor(226, 232, 240);
        doc.setLineWidth(0.3);
        doc.roundedRect(marginX, currentY, printableWidth, boxH, 2, 2, 'S');

        // Card Title
        doc.setFont("helvetica", "bold");
        doc.setFontSize(6.5);
        doc.setTextColor(71, 85, 105);
        doc.text("INDICADORES EXECUTIVOS DO FAROL • GESTÃO DE RISCO OPERACIONAL & CONFORMIDADE", marginX + 4, currentY + 4.5);

        const kpis = [
          { label: "VEÍCULOS ANALISADOS", value: String(totalVehicles), color: [30, 58, 138] },
          { label: "VEÍCULOS C/ ALERTAS", value: String(vehiclesWithAlerts), color: [109, 40, 217] },
          { label: "LICENÇAS VENCIDAS", value: String(totalVencidos), color: [220, 38, 38] },
          { label: "CRÍTICAS (≤15 DIAS)", value: String(totalCriticos), color: [217, 119, 6] },
          { label: "EM ATENÇÃO (≤45 DIAS)", value: String(totalAtencao), color: [37, 99, 235] },
          { label: "REGULARES / EM DIA", value: String(totalRegulares), color: [16, 124, 65] },
          { label: "TAXA DE CONFORMIDADE", value: `${complianceRate}%`, color: complianceRate >= 80 ? [16, 124, 65] : [220, 38, 38] }
        ];

        const colW = (printableWidth - 8) / kpis.length;
        kpis.forEach((kpi, idx) => {
          const kpiX = marginX + 4 + (idx * colW);
          doc.setFont("helvetica", "bold");
          doc.setFontSize(9.5);
          doc.setTextColor(kpi.color[0], kpi.color[1], kpi.color[2]);
          doc.text(kpi.value, kpiX, currentY + 10.5);

          doc.setFont("helvetica", "normal");
          doc.setFontSize(5.5);
          doc.setTextColor(100, 116, 139);
          doc.text(kpi.label, kpiX, currentY + 14.5);
        });

        currentY += boxH + 3.5;
      }

      // 6. Color Legend Bar
      const legendH = 5.5;
      doc.setFillColor(241, 245, 249);
      doc.roundedRect(marginX, currentY, printableWidth, legendH, 1.2, 1.2, 'F');

      const legendItems = [
        { label: "VENCIDO (Expiração Crítica / Bloqueio)", color: [220, 38, 38], bg: [254, 226, 226] },
        { label: "CRÍTICO (Vence em até 15 dias)", color: [217, 119, 6], bg: [254, 243, 199] },
        { label: "ATENÇÃO (Vence em 16 a 45 dias)", color: [37, 99, 235], bg: [239, 246, 255] },
        { label: "REGULAR / PAGO (Vigência Regular)", color: [16, 124, 65], bg: [236, 253, 245] },
        { label: "(-) NÃO APLICÁVEL", color: [100, 116, 139], bg: [248, 250, 252] }
      ];

      const legendColW = printableWidth / legendItems.length;
      legendItems.forEach((item, idx) => {
        const itemX = marginX + (idx * legendColW) + 2.5;
        const swatchW = 3.2;
        const swatchH = 3.2;
        const swatchY = currentY + 1.15;

        doc.setFillColor(item.bg[0], item.bg[1], item.bg[2]);
        doc.setDrawColor(item.color[0], item.color[1], item.color[2]);
        doc.setLineWidth(0.25);
        doc.roundedRect(itemX, swatchY, swatchW, swatchH, 0.5, 0.5, 'FD');

        doc.setFont("helvetica", "bold");
        doc.setFontSize(6);
        doc.setTextColor(item.color[0], item.color[1], item.color[2]);
        doc.text(item.label, itemX + swatchW + 1.8, currentY + 3.8);
      });

      currentY += legendH + 3.5;

      // 7. Matrix Table with Column Chunking for pristine A4 landscape readability
      if (pdfIncludeMatrix) {
        const MAX_DOCS_PER_CHUNK = 7;
        const chunks: string[][] = [];
        if (allDocTypes.length <= 8) {
          chunks.push(allDocTypes);
        } else {
          for (let i = 0; i < allDocTypes.length; i += MAX_DOCS_PER_CHUNK) {
            chunks.push(allDocTypes.slice(i, i + MAX_DOCS_PER_CHUNK));
          }
        }

        chunks.forEach((chunk, chunkIdx) => {
          if (chunkIdx > 0) {
            doc.addPage('a4', 'landscape');
            drawCorporateHeader(doc, {
              title: `${reportTitle} • BLOCO ${chunkIdx + 1}`,
              subtitle: `Matriz do Farol (Continuação de Licenças: ${chunk.join(' • ')})`,
              badgeText: "FAROL A4 HORIZONTAL",
              rightMetaText: `${totalVehicles} VEÍCULOS`,
              loadedImg,
              height: 28
            });

            currentY = 32;

            // Draw quick color legend
            doc.setFillColor(241, 245, 249);
            doc.roundedRect(marginX, currentY, printableWidth, legendH, 1.2, 1.2, 'F');
            legendItems.forEach((item, idx) => {
              const itemX = marginX + (idx * legendColW) + 2.5;
              doc.setFillColor(item.bg[0], item.bg[1], item.bg[2]);
              doc.setDrawColor(item.color[0], item.color[1], item.color[2]);
              doc.setLineWidth(0.25);
              doc.roundedRect(itemX, currentY + 1.15, 3.2, 3.2, 0.5, 0.5, 'FD');
              doc.setFont("helvetica", "bold");
              doc.setFontSize(6);
              doc.setTextColor(item.color[0], item.color[1], item.color[2]);
              doc.text(item.label, itemX + 5, currentY + 3.8);
            });
            currentY += legendH + 3;
          }

          // Build Table Body for this chunk
          const tableHead = [["Veículo", "Frota", "Operação", ...chunk]];
          const tableBody = sortedFleet.map(v => {
            const row = [
              formatPlateForPDF(v.plate),
              v.fleet || "-",
              v.operation || "-"
            ];
            chunk.forEach(type => {
              const d = v.documents.find(docItem => docItem.type === type);
              if (!d) {
                row.push("-");
              } else if (d.status === 'vencido') {
                row.push("VENCIDO");
              } else if (d.status === 'critico') {
                row.push(`CRÍTICO (${d.daysRemaining}d)`);
              } else if (d.status === 'atencao') {
                row.push(`ATENÇÃO (${d.daysRemaining}d)`);
              } else if (d.status === 'pagos') {
                row.push("PAGO");
              } else {
                row.push(d.expiryDate && d.expiryDate !== '-' ? d.expiryDate : "REGULAR");
              }
            });
            return row;
          });

          // Column styles calculation
          const fixedColsWidth = 78; // 26 + 16 + 36
          const docColWidth = (printableWidth - fixedColsWidth) / chunk.length;

          const colStyles: Record<number, any> = {
            0: { cellWidth: 26, fontStyle: 'bold', halign: 'center', textColor: [15, 23, 42] },
            1: { cellWidth: 16, halign: 'center', textColor: [51, 65, 85] },
            2: { cellWidth: 36, halign: 'left', fontStyle: 'bold', textColor: [51, 65, 85] }
          };

          chunk.forEach((_, idx) => {
            colStyles[idx + 3] = { cellWidth: docColWidth, halign: 'center' };
          });

          autoTable(doc, {
            head: tableHead,
            body: tableBody,
            startY: currentY,
            margin: { left: marginX, right: marginX, bottom: 14 },
            theme: 'grid',
            headStyles: {
              fillColor: [26, 54, 138],
              textColor: [255, 255, 255],
              fontStyle: 'bold',
              fontSize: 7,
              halign: 'center',
              valign: 'middle',
              cellPadding: 1.8
            },
            styles: {
              fontSize: 6.5,
              cellPadding: 1.6,
              valign: 'middle',
              halign: 'center',
              overflow: 'linebreak',
              lineColor: [226, 232, 240],
              lineWidth: 0.15
            },
            columnStyles: colStyles,
            didParseCell: (data) => {
              if (data.section === 'body' && data.column.index >= 3) {
                const raw = String(data.cell.raw || '').toUpperCase().trim();
                if (raw.includes('VENCIDO')) {
                  data.cell.styles.fillColor = [254, 226, 226];
                  data.cell.styles.textColor = [190, 18, 60];
                  data.cell.styles.fontStyle = 'bold';
                } else if (raw.includes('CRÍTICO') || raw.includes('CRITICO')) {
                  data.cell.styles.fillColor = [254, 243, 199];
                  data.cell.styles.textColor = [180, 83, 9];
                  data.cell.styles.fontStyle = 'bold';
                } else if (raw.includes('ATENÇÃO') || raw.includes('ATENCAO')) {
                  data.cell.styles.fillColor = [239, 246, 255];
                  data.cell.styles.textColor = [29, 78, 216];
                  data.cell.styles.fontStyle = 'bold';
                } else if (raw.includes('PAGO') || raw.includes('REGULAR') || /\d{2}\/\d{2}\/\d{4}/.test(raw)) {
                  data.cell.styles.fillColor = [236, 253, 245];
                  data.cell.styles.textColor = [4, 120, 87];
                  data.cell.styles.fontStyle = 'bold';
                } else if (raw === '-') {
                  data.cell.styles.fillColor = [248, 250, 252];
                  data.cell.styles.textColor = [148, 163, 184];
                  data.cell.styles.fontStyle = 'normal';
                }
              }
            }
          });
        });
      }

      // 8. Operational Action Plan (Plano de Ação de Alertas e Licenças Prioritárias)
      if (pdfIncludeActionPlan) {
        // Collect all documents with alerts
        const actionItems: Array<{
          plate: string;
          fleet: string;
          operation: string;
          docType: string;
          status: string;
          expiryDate: string;
          daysRemaining: number;
          priority: 'ALTA' | 'MÉDIA' | 'BAIXA';
          action: string;
        }> = [];

        sortedFleet.forEach(v => {
          v.documents.forEach(d => {
            if (d.status === 'vencido') {
              actionItems.push({
                plate: formatPlateForPDF(v.plate),
                fleet: v.fleet || '-',
                operation: v.operation || '-',
                docType: d.type,
                status: 'VENCIDO',
                expiryDate: d.expiryDate || '-',
                daysRemaining: d.daysRemaining,
                priority: 'ALTA',
                action: 'Bloqueio operacional preventivo e protocolo urgente de renovação'
              });
            } else if (d.status === 'critico') {
              actionItems.push({
                plate: formatPlateForPDF(v.plate),
                fleet: v.fleet || '-',
                operation: v.operation || '-',
                docType: d.type,
                status: `CRÍTICO (${d.daysRemaining}d)`,
                expiryDate: d.expiryDate || '-',
                daysRemaining: d.daysRemaining,
                priority: 'MÉDIA',
                action: 'Acompanhar emissão da guia e vistoria técnica imediatamente'
              });
            } else if (d.status === 'atencao') {
              actionItems.push({
                plate: formatPlateForPDF(v.plate),
                fleet: v.fleet || '-',
                operation: v.operation || '-',
                docType: d.type,
                status: `ATENÇÃO (${d.daysRemaining}d)`,
                expiryDate: d.expiryDate || '-',
                daysRemaining: d.daysRemaining,
                priority: 'BAIXA',
                action: 'Iniciar rotina preventiva de coleta de documentação'
              });
            }
          });
        });

        // Sort action items by priority (ALTA first, then MÉDIA, then BAIXA) and days remaining
        actionItems.sort((a, b) => {
          const priorityScore = { ALTA: 0, MÉDIA: 1, BAIXA: 2 };
          if (priorityScore[a.priority] !== priorityScore[b.priority]) {
            return priorityScore[a.priority] - priorityScore[b.priority];
          }
          return a.daysRemaining - b.daysRemaining;
        });

        if (actionItems.length > 0) {
          doc.addPage('a4', 'landscape');
          drawCorporateHeader(doc, {
            title: "PLANO DE AÇÃO E GESTÃO DE PENDÊNCIAS OPERACIONAIS",
            subtitle: "Relação Priorizada de Licenças Vencidas e Críticas para Ação Imediata da Equipe de Frotas",
            badgeText: "PLANO DE AÇÃO",
            rightMetaText: `${actionItems.length} PENDÊNCIAS PRIORITÁRIAS`,
            loadedImg,
            height: 30
          });

          const actionBody = actionItems.map(item => [
            item.priority === 'ALTA' ? 'CRÍTICO' : item.priority === 'MÉDIA' ? 'ATENÇÃO' : 'MONITORAR',
            item.plate,
            item.fleet,
            item.operation,
            item.docType,
            item.status,
            item.expiryDate,
            `${item.daysRemaining} dias`,
            item.action
          ]);

          autoTable(doc, {
            head: [["Prioridade", "Veículo", "Frota", "Operação", "Licença / Documento", "Status", "Vencimento", "Prazo", "Ação Operacional Recomendada"]],
            body: actionBody,
            startY: 34,
            margin: { left: marginX, right: marginX, bottom: 20 },
            theme: 'grid',
            headStyles: {
              fillColor: [30, 58, 138],
              textColor: [255, 255, 255],
              fontStyle: 'bold',
              fontSize: 7.5,
              halign: 'center',
              valign: 'middle'
            },
            styles: {
              fontSize: 7,
              cellPadding: 2,
              valign: 'middle',
              lineColor: [226, 232, 240],
              lineWidth: 0.15
            },
            columnStyles: {
              0: { cellWidth: 22, halign: 'center', fontStyle: 'bold' },
              1: { cellWidth: 24, halign: 'center', fontStyle: 'bold', textColor: [15, 23, 42] },
              2: { cellWidth: 16, halign: 'center', textColor: [51, 65, 85] },
              3: { cellWidth: 32, halign: 'left', fontStyle: 'bold', textColor: [51, 65, 85] },
              4: { cellWidth: 42, halign: 'left', fontStyle: 'bold' },
              5: { cellWidth: 24, halign: 'center', fontStyle: 'bold' },
              6: { cellWidth: 22, halign: 'center' },
              7: { cellWidth: 18, halign: 'center' },
              8: { cellWidth: 'auto', halign: 'left', fontStyle: 'normal', textColor: [71, 85, 105] }
            },
            didParseCell: (data) => {
              if (data.section === 'body') {
                if (data.column.index === 0 || data.column.index === 5) {
                  const val = String(data.cell.raw || '').toUpperCase();
                  if (val.includes('VENCIDO') || val.includes('CRÍTICO') || val.includes('CRITICO')) {
                    data.cell.styles.fillColor = [254, 242, 242];
                    data.cell.styles.textColor = [190, 18, 60];
                  } else if (val.includes('ATENÇÃO') || val.includes('ATENCAO')) {
                    data.cell.styles.fillColor = [255, 251, 235];
                    data.cell.styles.textColor = [180, 83, 9];
                  } else if (val.includes('MONITORAR')) {
                    data.cell.styles.fillColor = [239, 246, 255];
                    data.cell.styles.textColor = [29, 78, 216];
                  }
                }
              }
            }
          });
        }
      }

      // 9. Sign-off and Footers on all pages
      const pageCount = (doc.internal as any).getNumberOfPages 
        ? (doc.internal as any).getNumberOfPages() 
        : doc.getNumberOfPages();

      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        const pHeight = doc.internal.pageSize.getHeight();
        const pWidth = doc.internal.pageSize.getWidth();

        // Footer divider line
        doc.setDrawColor(226, 232, 240);
        doc.setLineWidth(0.3);
        doc.line(marginX, pHeight - 10, pWidth - marginX, pHeight - 10);

        // System brand info
        doc.setFontSize(7);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(148, 163, 184);
        doc.text(
          `${companyName || 'LogiFleet'} • Relatório Farol de Conformidade (${mode === 'documentacao' ? 'Documentação' : 'Licenças'}) | Emissão: ${format(new Date(), "dd/MM/yyyy HH:mm")}`,
          marginX,
          pHeight - 5
        );

        // Page numbering
        doc.text(
          `Página ${i} de ${pageCount}`,
          pWidth - marginX,
          pHeight - 5,
          { align: "right" }
        );
      }

      // Signature line on final page if space permits
      const lastPageTableY = (doc as any).lastAutoTable ? (doc as any).lastAutoTable.finalY : 120;
      if (pageHeight - lastPageTableY > 24) {
        const signY = pageHeight - 16;
        doc.setDrawColor(203, 213, 225);
        doc.setLineWidth(0.3);
        doc.line(40, signY - 4, 110, signY - 4);
        doc.setFontSize(6.5);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(71, 85, 105);
        doc.text("Responsável Técnico de Frota / Documentação", 75, signY, { align: "center" });

        doc.line(pageWidth - 110, signY - 4, pageWidth - 40, signY - 4);
        doc.text("Diretoria Executiva / Gestão de Conformidade", pageWidth - 75, signY, { align: "center" });
      }

      // 10. Save and Trigger Download
      const fileName = `Relatorio_Farol_${mode === 'documentacao' ? 'Documentacao' : 'Licencas'}_${format(new Date(), "dd-MM-yyyy_HHmm")}.pdf`;
      doc.save(fileName);

      setShowPdfModal(false);
      setPdfSuccessToast(`Relatório PDF A4 (${fileName}) baixado com sucesso!`);
      setTimeout(() => setPdfSuccessToast(null), 5000);
    } catch (error) {
      console.error("Erro ao gerar PDF do Farol:", error);
      alert("Ocorreu um erro ao gerar o PDF. Por favor, tente novamente.");
    } finally {
      setIsGeneratingPDF(false);
    }
  };

  return (
    <div className="flex flex-col gap-4 h-[calc(100vh-140px)]">
      {/* Controls */}
      <div className="flex flex-col xl:flex-row items-stretch xl:items-center justify-between gap-3.5 glass-card p-3.5 sm:p-4 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm relative z-50 overflow-visible">
        {/* Filters: Placa, Frota (multi-select / flegue), Licenças, Status (multi-select / flegue) */}
        <div className="flex flex-wrap items-center gap-2.5 flex-1">
          {/* Filtro Placa (Multi-select com flegue) */}
          <MultiSelectFilter
            id="filter-farol-placas"
            label="Placa"
            placeholder="Todas as Placas"
            icon={<Search size={15} />}
            options={plateOptions}
            selectedValues={selectedPlates}
            onChange={setSelectedPlates}
            searchPlaceholder="Buscar placa..."
            dropdownWidth="w-72"
          />

          {/* Filtro Frota (Multi-select com flegue) */}
          <MultiSelectFilter
            id="filter-farol-frotas"
            label="Frota"
            placeholder="Todas as Frotas"
            icon={<Truck size={15} />}
            options={fleetOptions}
            selectedValues={selectedFleets}
            onChange={setSelectedFleets}
            searchPlaceholder="Buscar número de frota..."
            dropdownWidth="w-72"
          />

          {/* Filtro Licença (Multi-select com flegue) */}
          <MultiSelectFilter
            id="filter-farol-licencas"
            label="Licença"
            placeholder="Todas as Licenças"
            icon={<FileText size={15} />}
            options={licenseOptions}
            selectedValues={selectedLicenses}
            onChange={setSelectedLicenses}
            searchPlaceholder="Buscar licença..."
            dropdownWidth="w-72"
          />

          {/* Filtro Status da Documentação (Multi-select com flegue: Vencido, Atenção, Crítico, Regular, etc.) */}
          <MultiSelectFilter
            id="filter-farol-status"
            label="Status"
            placeholder="Todos os Status"
            icon={<Filter size={15} />}
            options={statusOptions}
            selectedValues={selectedStatuses}
            onChange={setSelectedStatuses}
            searchPlaceholder="Buscar status..."
            showSearchThreshold={99}
            dropdownWidth="w-72"
          />

          {/* Reset button if any filter is active */}
          {(selectedPlates.length > 0 || selectedFleets.length > 0 || selectedLicenses.length > 0 || selectedStatuses.length > 0 || filterAlertsOnly) && (
            <button
              type="button"
              onClick={() => {
                setSelectedPlates([]);
                setSelectedFleets([]);
                setSelectedLicenses([]);
                setSelectedStatuses([]);
                setFilterAlertsOnly(false);
              }}
              className="flex items-center gap-1 px-2.5 py-2 text-xs font-bold text-slate-500 hover:text-rose-600 dark:text-slate-400 dark:hover:text-rose-400 bg-slate-100/60 dark:bg-slate-800/60 hover:bg-rose-50 dark:hover:bg-rose-950/30 rounded-xl border border-slate-200/60 dark:border-slate-700/60 transition-all cursor-pointer select-none shrink-0"
              title="Limpar todos os filtros"
            >
              <X size={13} />
              <span>Limpar</span>
            </button>
          )}
        </div>
        
        {/* Right Action Controls */}
        <div className="flex flex-wrap items-center gap-2.5 justify-end shrink-0 pt-2.5 xl:pt-0 border-t xl:border-t-0 border-slate-200/60 dark:border-slate-800">
          <span className="text-xs font-bold text-slate-500 dark:text-slate-400 whitespace-nowrap px-1">
            {vehiclesToDisplay.length} {vehiclesToDisplay.length === 1 ? 'veículo' : 'veículos'}
          </span>
          <button 
            onClick={() => setFilterAlertsOnly(!filterAlertsOnly)}
            className={cn(
              "flex items-center justify-center gap-2 px-3.5 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer select-none",
              filterAlertsOnly 
                ? "bg-blue-600 text-white shadow-md shadow-blue-500/30" 
                : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-200/70"
            )}
          >
            <Filter size={15} />
            <span>Apenas Alertas</span>
          </button>

          {/* Export PDF A4 Button */}
          <button
            onClick={() => setShowPdfModal(true)}
            className="flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-bold bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-700 hover:from-blue-700 hover:to-indigo-800 text-white shadow-md shadow-blue-500/25 transition-all cursor-pointer hover:scale-[1.02] active:scale-95 select-none"
            title="Exportar Relatório Farol em PDF formatado para folha A4 Horizontal (Paisagem)"
          >
            <FileText size={15} />
            <span>Relatório PDF (A4)</span>
          </button>
        </div>
      </div>

      {/* Matrix Table */}
      <div className="flex-1 overflow-hidden glass-card rounded-2xl flex flex-col border border-slate-200 dark:border-slate-700/80 shadow-lg relative z-10">
        {/* Subtle background glow */}
        <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 via-transparent to-purple-500/5 pointer-events-none" />

        <div 
          className="flex-1 overflow-auto custom-scrollbar relative z-10"
          onScroll={handleHideTooltip}
        >
          <table className="w-full text-left border-collapse">
            <thead className="sticky top-0 z-20 bg-slate-100/95 dark:bg-slate-900/95 backdrop-blur-xl shadow-sm border-b border-slate-200 dark:border-slate-700">
              <tr>
                <th className="sticky left-0 z-20 bg-slate-100/95 dark:bg-slate-900/95 backdrop-blur-xl p-4 font-black text-xs text-slate-700 dark:text-slate-300 min-w-[140px] shadow-[1px_0_0_0_rgba(203,213,225,0.4)] dark:shadow-[1px_0_0_0_rgba(51,65,85,0.4)] uppercase tracking-wider">
                  Veículo
                </th>
                <th className="sticky left-[140px] z-20 bg-slate-100/95 dark:bg-slate-900/95 backdrop-blur-xl p-4 font-black text-xs text-slate-700 dark:text-slate-300 min-w-[120px] shadow-[1px_0_0_0_rgba(203,213,225,0.4)] dark:shadow-[1px_0_0_0_rgba(51,65,85,0.4)] uppercase tracking-wider border-l border-slate-200/50 dark:border-slate-700/50">
                  Operação
                </th>
                {allDocTypes.map(type => (
                  <th 
                    key={type} 
                    onMouseEnter={(e) => handleShowTooltip(e, (c) => ({ kind: 'header', title: type, ...c }))}
                    onMouseLeave={handleHideTooltip}
                    className="p-4 font-bold text-xs text-slate-600 dark:text-slate-400 whitespace-nowrap border-l border-slate-200/50 dark:border-slate-700/50 hover:text-cyan-400 hover:bg-slate-800/30 transition-colors cursor-pointer select-none"
                  >
                    <div className="flex items-center justify-between gap-1.5 max-w-[140px]">
                      <span className="truncate">{type}</span>
                      <Sparkles size={11} className="text-cyan-400/60 shrink-0" />
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {vehiclesToDisplay.length > 0 ? vehiclesToDisplay.map((v, i) => (
                <motion.tr 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i > 20 ? 0 : i * 0.02 }}
                  key={v.plate || v.fleet || i} 
                  className={cn(
                    "border-b border-slate-100 dark:border-slate-800/60 hover:bg-white/60 dark:hover:bg-slate-800/60 transition-colors group relative",
                    getRowGlow(v)
                  )}
                >
                  <td 
                    onMouseEnter={(e) => handleShowTooltip(e, (c) => ({ kind: 'vehicle', vehicle: v, ...c }))}
                    onMouseLeave={handleHideTooltip}
                    className="sticky left-0 z-10 bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl p-3 shadow-[1px_0_0_0_rgba(203,213,225,0.3)] dark:shadow-[1px_0_0_0_rgba(51,65,85,0.3)] group-hover:bg-slate-50/95 dark:group-hover:bg-slate-800/95 transition-colors cursor-pointer"
                  >
                    <div className="flex flex-col items-center justify-center transition-transform duration-200 hover:scale-105 active:scale-95">
                      <MercosulPlate plate={v.plate} />
                    </div>
                  </td>
                  <td 
                    onMouseEnter={(e) => handleShowTooltip(e, (c) => ({ kind: 'operation', operation: v.operation || '-', fleet: v.fleet, vehicleCount: 1, ...c }))}
                    onMouseLeave={handleHideTooltip}
                    className="sticky left-[140px] z-10 bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl p-3 shadow-[1px_0_0_0_rgba(203,213,225,0.3)] dark:shadow-[1px_0_0_0_rgba(51,65,85,0.3)] group-hover:bg-slate-50/95 dark:group-hover:bg-slate-800/95 transition-colors border-l border-slate-100 dark:border-slate-800/40 cursor-pointer"
                  >
                    <div className="flex flex-col gap-0.5 justify-center transition-transform duration-200 hover:translate-x-1">
                      <span className="text-xs font-bold text-slate-700 dark:text-slate-300 truncate max-w-[140px]">
                        {v.fleet || '-'}
                      </span>
                      <span className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-wider truncate max-w-[140px]">
                        {v.operation || '-'}
                      </span>
                    </div>
                  </td>
                  {allDocTypes.map(type => {
                    const doc = v.documents.find(d => d.type === type);
                    const config = getStatusConfig(doc);
                    return (
                      <td 
                        key={type} 
                        onMouseEnter={(e) => handleShowTooltip(e, (c) => ({ kind: 'doc', doc, docType: type, vehicle: v, ...c }))}
                        onMouseLeave={handleHideTooltip}
                        className="p-3 text-center min-w-[130px] border-l border-slate-100 dark:border-slate-800/40 cursor-pointer select-none"
                      >
                        {config ? (
                          <div 
                            className={cn(
                              "inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-xl border text-[11px] font-black tracking-wide shadow-sm w-full max-w-[110px] transition-all duration-200 hover:scale-110 hover:-translate-y-0.5 active:scale-95", 
                              config.bg, config.text, config.border, config.hoverGlow
                            )}
                          >
                            {config.icon}
                            <span>{config.label}</span>
                          </div>
                        ) : (
                          <span className="text-slate-300 dark:text-slate-700 font-medium">-</span>
                        )}
                      </td>
                    );
                  })}
                </motion.tr>
              )) : (
                <tr>
                  <td colSpan={allDocTypes.length + 2} className="p-12 text-center text-slate-500 dark:text-slate-400">
                    <div className="flex flex-col items-center justify-center gap-3">
                      <CheckCircle2 size={32} className="text-emerald-500/50" />
                      <span className="font-bold">Nenhum veículo encontrado.</span>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Floating 3D Neon Animated Tooltip Portal */}
      {typeof document !== 'undefined' && activeTooltip && createPortal(
        <AnimatePresence>
          <FarolFloatingTooltip data={activeTooltip} />
        </AnimatePresence>,
        document.body
      )}

      {/* Success Toast Notification */}
      <AnimatePresence>
        {pdfSuccessToast && (
          <motion.div
            initial={{ opacity: 0, y: 30, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            className="fixed bottom-6 right-6 z-50 flex items-center gap-3 px-5 py-3.5 bg-emerald-600 text-white rounded-2xl shadow-xl shadow-emerald-500/25 border border-emerald-400/30 text-sm font-bold"
          >
            <CheckCircle2 size={20} className="text-emerald-100 shrink-0" />
            <span>{pdfSuccessToast}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* PDF Export Configuration Modal */}
      <AnimatePresence>
        {showPdfModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm animate-in fade-in duration-200">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl w-full max-w-xl overflow-hidden flex flex-col"
            >
              {/* Modal Header */}
              <div className="p-6 bg-gradient-to-r from-blue-900 via-indigo-900 to-slate-900 text-white flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-2xl bg-blue-500/20 border border-blue-400/30 flex items-center justify-center text-blue-300 shadow-inner">
                    <FileText size={22} />
                  </div>
                  <div>
                    <h3 className="text-lg font-black tracking-tight">Relatório Farol de Conformidade</h3>
                    <p className="text-xs text-blue-200/80 font-medium">Otimizado para folha A4 Horizontal (Paisagem)</p>
                  </div>
                </div>
                <button 
                  onClick={() => !isGeneratingPDF && setShowPdfModal(false)}
                  disabled={isGeneratingPDF}
                  className="p-2 rounded-xl text-slate-300 hover:text-white hover:bg-white/10 transition-colors cursor-pointer disabled:opacity-50"
                >
                  <X size={20} />
                </button>
              </div>

              {/* Modal Body */}
              <div className="p-6 space-y-5 overflow-y-auto max-h-[75vh]">
                {/* Stats chip overview */}
                <div className="grid grid-cols-3 gap-3 p-3.5 bg-slate-50 dark:bg-slate-800/60 rounded-2xl border border-slate-100 dark:border-slate-800 text-center">
                  <div>
                    <span className="block text-base font-black text-blue-600 dark:text-blue-400">
                      {pdfScope === 'filtered' ? vehiclesToDisplay.length : consolidatedFleet.length}
                    </span>
                    <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400">Veículos no Escopo</span>
                  </div>
                  <div>
                    <span className="block text-base font-black text-rose-600 dark:text-rose-400">
                      {(pdfScope === 'filtered' ? vehiclesToDisplay : consolidatedFleet).reduce((acc, v) => acc + v.documents.filter(d => d.status === 'vencido').length, 0)}
                    </span>
                    <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400">Licenças Vencidas</span>
                  </div>
                  <div>
                    <span className="block text-base font-black text-amber-600 dark:text-amber-400">
                      {(pdfScope === 'filtered' ? vehiclesToDisplay : consolidatedFleet).reduce((acc, v) => acc + v.documents.filter(d => d.status === 'critico').length, 0)}
                    </span>
                    <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400">Críticas (≤15d)</span>
                  </div>
                </div>

                {/* Scope Selection */}
                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    Escopo dos Veículos
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <button
                      type="button"
                      onClick={() => setPdfScope('filtered')}
                      className={cn(
                        "flex flex-col items-start p-3 rounded-xl border text-left transition-all cursor-pointer",
                        pdfScope === 'filtered'
                          ? "border-blue-500 bg-blue-50/50 dark:bg-blue-900/20 text-blue-900 dark:text-blue-200 ring-2 ring-blue-500/20"
                          : "border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800/40 text-slate-700 dark:text-slate-300"
                      )}
                    >
                      <div className="flex items-center justify-between w-full">
                        <span className="text-xs font-bold">Filtro Atual da Tela</span>
                        {pdfScope === 'filtered' && <Check size={14} className="text-blue-600 dark:text-blue-400" />}
                      </div>
                      <span className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                        {vehiclesToDisplay.length} {vehiclesToDisplay.length === 1 ? 'veículo selecionado' : 'veículos selecionados'}
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setPdfScope('all')}
                      className={cn(
                        "flex flex-col items-start p-3 rounded-xl border text-left transition-all cursor-pointer",
                        pdfScope === 'all'
                          ? "border-blue-500 bg-blue-50/50 dark:bg-blue-900/20 text-blue-900 dark:text-blue-200 ring-2 ring-blue-500/20"
                          : "border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800/40 text-slate-700 dark:text-slate-300"
                      )}
                    >
                      <div className="flex items-center justify-between w-full">
                        <span className="text-xs font-bold">Frota Completa</span>
                        {pdfScope === 'all' && <Check size={14} className="text-blue-600 dark:text-blue-400" />}
                      </div>
                      <span className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                        {consolidatedFleet.length} veículos no total
                      </span>
                    </button>
                  </div>
                </div>

                {/* Report Sections */}
                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    Seções do Relatório
                  </label>
                  <div className="space-y-2">
                    <label className="flex items-center gap-3 p-3 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800/40 cursor-pointer">
                      <input 
                        type="checkbox"
                        checked={pdfIncludeSummaries}
                        onChange={(e) => setPdfIncludeSummaries(e.target.checked)}
                        className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                      />
                      <div className="flex-1 text-xs">
                        <span className="font-bold text-slate-800 dark:text-slate-200 block">Resumo Executivo & Indicadores (KPIs)</span>
                        <span className="text-slate-500 dark:text-slate-400">Cartão panorâmico de conformidade, totalizadores e índice de risco</span>
                      </div>
                    </label>

                    <label className="flex items-center gap-3 p-3 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800/40 cursor-pointer">
                      <input 
                        type="checkbox"
                        checked={pdfIncludeMatrix}
                        onChange={(e) => setPdfIncludeMatrix(e.target.checked)}
                        className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                      />
                      <div className="flex-1 text-xs">
                        <span className="font-bold text-slate-800 dark:text-slate-200 block">Matriz Panorâmica do Farol (A4 Landscape)</span>
                        <span className="text-slate-500 dark:text-slate-400">Grade completa de veículos vs documentos com realce colorido de status</span>
                      </div>
                    </label>

                    <label className="flex items-center gap-3 p-3 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800/40 cursor-pointer">
                      <input 
                        type="checkbox"
                        checked={pdfIncludeActionPlan}
                        onChange={(e) => setPdfIncludeActionPlan(e.target.checked)}
                        className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                      />
                      <div className="flex-1 text-xs">
                        <span className="font-bold text-slate-800 dark:text-slate-200 block">Plano de Ação de Licenças Vencidas & Críticas</span>
                        <span className="text-slate-500 dark:text-slate-400">Checklist operacional com prioridade de bloqueio e regularização</span>
                      </div>
                    </label>
                  </div>
                </div>

                {/* Information hint */}
                <div className="flex items-start gap-2.5 p-3 bg-blue-50/50 dark:bg-blue-900/10 border border-blue-100 dark:border-blue-900/30 rounded-xl text-blue-800 dark:text-blue-300 text-[11px] leading-relaxed">
                  <Info size={16} className="shrink-0 text-blue-600 dark:text-blue-400 mt-0.5" />
                  <span>
                    O relatório é dimensionado estritamente para folhas A4 horizontais (paisagem) com divisão proporcional de colunas, rodapé corporativo e campos de aprovação técnica.
                  </span>
                </div>
              </div>

              {/* Modal Footer */}
              <div className="p-4 bg-slate-50 dark:bg-slate-800/80 border-t border-slate-200 dark:border-slate-700 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowPdfModal(false)}
                  disabled={isGeneratingPDF}
                  className="px-4 py-2 text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-200/50 dark:hover:bg-slate-700/50 rounded-xl transition-colors cursor-pointer disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleExportFarolPDF}
                  disabled={isGeneratingPDF || (!pdfIncludeMatrix && !pdfIncludeActionPlan && !pdfIncludeSummaries)}
                  className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-xl text-xs font-bold shadow-lg shadow-blue-500/25 transition-all cursor-pointer hover:scale-[1.02] active:scale-95 disabled:opacity-50 disabled:pointer-events-none"
                >
                  {isGeneratingPDF ? (
                    <>
                      <Loader2 size={16} className="animate-spin" />
                      <span>Gerando PDF A4...</span>
                    </>
                  ) : (
                    <>
                      <Download size={16} />
                      <span>Baixar Relatório PDF A4</span>
                    </>
                  )}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
