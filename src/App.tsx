import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db, handleFirestoreError, OperationType, setDoc } from "./lib/firebase";
import { 
  Home,
  LayoutDashboard, 
  Truck, 
  FileWarning, 
  Map as MapIcon, 
  Search, 
  Bell, 
  Filter,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  Clock,
  ChevronRight,
  ChevronUp,
  ChevronDown,
  RotateCcw,
  Menu,
  X,
  Download,
  FileSpreadsheet,
  Printer,
  FileText,
  Settings,
  Mail,
  MessageSquare,
  ShieldCheck,
  Send,
  Plus,
  Trash2,
  Eye,
  EyeOff,
  Layers,
  DollarSign,
  UserCheck,
  TrendingUp,
  Receipt,
  Coins,
  Building2,
  BarChart3,
  Sun,
  Moon,
  Edit,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  FileSignature,
  AlertCircle,
  HelpCircle,
  Maximize2,
  Minimize2,
  Save
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { format, isAfter, isBefore, addDays, parseISO, subHours, differenceInDays, parse, startOfDay, isValid } from "date-fns";
import Papa from "papaparse";
import { cn } from "@/src/lib/utils";
import { type Vehicle, type FleetStats, type LicenseJustification, type JustificationHistoryItem, type Document as VehicleDocument, normalizeDocKey } from "./types";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  Cell,
  PieChart,
  Pie,
  ComposedChart,
  Line,
  Area,
  LabelList
} from 'recharts';

import MapTab from "./components/MapTab";
import { LicenseJustificationsTab } from "./components/LicenseJustificationsTab";
import { DocJustificationsTab } from "./components/DocJustificationsTab";
import { AppSafeBoundary as ErrorBoundary } from "./components/AppSafeBoundary";
import { FarolTab } from "./components/FarolTab";
import { StatCard3D } from "./components/StatCard3D";
import { ChartContainer3D, ChartTooltip3D, PieTooltip3D, AnimatedChartCursor } from "./components/ChartComponents3D";
import { signInWithGoogleWorkspace, getStoredGoogleToken, setStoredGoogleToken } from "./lib/googleAuth";
import { LandingCover } from "./components/LandingCover";
import { FirebaseStatusIndicator } from "./components/FirebaseStatusIndicator";
import { SidebarToggleButton3D } from "./components/SidebarToggleButton3D";
import { ComoUsarTab } from "./components/ComoUsarTab";
import { OperationDistributionChart } from "./components/OperationDistributionChart";
import { PortalTooltip } from "./components/PortalTooltip";
import { NeonLaserBeam } from "./components/NeonLaserBeam";
import { 
  defaultLicenseJustifications, 
  defaultDocJustifications, 
  defaultLicenseHistory, 
  defaultDocHistory 
} from "./data/initialJustifications";
import {
  saveLicenseHistoryToStorage,
  loadLicenseHistoryFromStorage,
  saveDocHistoryToStorage,
  loadDocHistoryFromStorage
} from "./lib/storageCompression";

interface MultiSelectProps {
  label: string;
  options: string[];
  selected: string[];
  onChange: (selected: string[]) => void;
  placeholder?: string;
  formatOption?: (option: string) => string;
}

function normalizeFrequencyString(freq: string): string {
  if (!freq) return "-";
  const str = freq.trim();
  const strUpper = str.toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

  if (strUpper.includes("ANUAL") || strUpper.includes("01 ANO") || strUpper.includes("1 ANO")) {
    return "01 ANO";
  }
  if (strUpper.includes("BIENAL") || strUpper.includes("02 ANOS") || strUpper.includes("2 ANOS")) {
    return "02 ANOS";
  }
  if (strUpper.includes("SEMESTRAL") || strUpper.includes("06 MESES") || strUpper.includes("6 MESES")) {
    return "06 MESES";
  }
  if (strUpper.includes("TRIENAL") || strUpper.includes("03 ANOS") || strUpper.includes("3 ANOS")) {
    return "03 ANOS";
  }
  if (strUpper.includes("QUADRIENAL") || strUpper.includes("04 ANOS") || strUpper.includes("4 ANOS")) {
    return "04 ANOS";
  }
  if (strUpper.includes("QUINQUENAL") || strUpper.includes("05 ANOS") || strUpper.includes("5 ANOS")) {
    return "05 ANOS";
  }
  
  return str;
}

function normalizeDocTypeForDedup(docType: string): string {
  if (!docType) return "";
  let norm = docType.toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
  norm = norm.replace(/[\-_\/\s]+(VEIC|VEICULO|VEICULAR|SPO|SP|MG|GO|RJ|BA|PR|RS|PE|CE|MA|PA|AM|MT|MS|ES|RN|PB|SC|AL|SE|PI|TO|AP|AC|RO|RR|DF|EMPRESA|EMP)$/i, "").trim();
  return norm;
}

function extractCleanDocTypeAndValidity(rawKey: string, initialValidity: string): { cleanType: string; validityPeriod: string } {
  let validityPeriod = (initialValidity || "").trim();
  let cleanType = (rawKey || "").trim();

  const rawUpper = rawKey.toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if ((rawUpper.includes("INSP") || rawUpper.includes("TX") || rawUpper.includes("TAXA")) && rawUpper.includes("TACO")) {
    return { cleanType: "TX INSP TACOGRAFO", validityPeriod };
  }

  // 1. Extract period regex if key starts with "2 ANOS -", "2 NA-", etc.
  const periodRegex = /^(0?\d+\s*(ANOS|ANO|MESES|MÊSES|MESÊS|MÊS|MES|DIAS|DIA|NA-)(?:\s*[\/\-]\s*\d+\s*(ANOS|ANO|MESES|MÊSES|MESÊS|MÊS|MES|DIAS|DIA|NA-))?)\s*-?\s*/i;
  const matchPeriod = cleanType.match(periodRegex);
  if (matchPeriod) {
    if (!validityPeriod) {
      validityPeriod = matchPeriod[1].trim();
    }
    cleanType = cleanType.replace(periodRegex, "").trim();
  }

  // 2. Extract payment/financial note prefix if key starts with PG TX... SERV... or PG... or TX... or SERV... etc.
  const payPrefixRegex = /^((?:PG|PAG|PAGAMENTO|TX|TAXA|SERV|SERVIÇO|SERVICO|VALOR|CUSTO|R\$)[0-9\.,\s\/A-Z\$\-]*?)\s*(REGISTRO\s+CADASTRAL[^\n]*|AUTORIZA[CÇ][AÃ]O[^\n]*|LICEN[CÇ]A[^\n]*|SEGURO[^\n]*|TACOGRAFO[^\n]*|TACÓGRAFO[^\n]*|VISTORIA[^\n]*|CNH[^\n]*|ANTT[^\n]*|DER[^\n]*|AGR[^\n]*|CRV|CRC|CRLV|CIV|CIPP|OPP|LAUDO|ANEXO[^\n]*|INSPEC[AÃ]O[^\n]*)$/i;

  const matchPayPrefix = cleanType.match(payPrefixRegex);
  if (matchPayPrefix) {
    const payNote = matchPayPrefix[1].trim();
    cleanType = matchPayPrefix[2].trim();
    if (payNote) {
      if (validityPeriod) {
        if (!validityPeriod.toUpperCase().includes(payNote.toUpperCase())) {
          validityPeriod = `${validityPeriod} ${payNote}`.trim();
        }
      } else {
        validityPeriod = payNote;
      }
    }
  } else {
    // Check if cleanType ends with payment info
    const paySuffixRegex = /^(REGISTRO\s+CADASTRAL[^\n]*|AUTORIZA[CÇ][AÃ]O[^\n]*|LICEN[CÇ]A[^\n]*|SEGURO[^\n]*|TACOGRAFO[^\n]*|TACÓGRAFO[^\n]*|VISTORIA[^\n]*|CNH[^\n]*|ANTT[^\n]*|DER[^\n]*|AGR[^\n]*|CRV|CRC|CRLV|CIV|CIPP|OPP|LAUDO|ANEXO[^\n]*|INSPEC[AÃ]O[^\n]*)\s+((?:PG|PAG|PAGAMENTO|TX|TAXA|SERV|SERVIÇO|SERVICO|VALOR|CUSTO|R\$)[0-9\.,\s\/A-Z\$\-]*)$/i;
    const matchPaySuffix = cleanType.match(paySuffixRegex);
    if (matchPaySuffix) {
      cleanType = matchPaySuffix[1].trim();
      const payNote = matchPaySuffix[2].trim();
      if (payNote) {
        if (validityPeriod) {
          if (!validityPeriod.toUpperCase().includes(payNote.toUpperCase())) {
            validityPeriod = `${validityPeriod} ${payNote}`.trim();
          }
        } else {
          validityPeriod = payNote;
        }
      }
    }
  }

  // Normalize "REGISTRO CADASTRAL - EMP" -> "REGISTRO CADASTRAL - EMPR"
  if (cleanType.toUpperCase() === "REGISTRO CADASTRAL - EMP") {
    cleanType = "REGISTRO CADASTRAL - EMPR";
  }

  return { cleanType, validityPeriod };
}

function MultiSelect({ label, options, selected, onChange, placeholder = "Todos", formatOption, className }: MultiSelectProps & { className?: string }) {
  const [isOpen, setIsOpen] = useState(false);
  const [filterText, setFilterText] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  const filteredOptions = useMemo(() => {
    return options.filter(opt => {
      const displayStr = formatOption ? formatOption(opt) : opt;
      return displayStr.toLowerCase().includes(filterText.toLowerCase());
    });
  }, [options, filterText, formatOption]);

  const toggleOption = (option: string) => {
    if (selected.includes(option)) {
      onChange(selected.filter(item => item !== option));
    } else {
      onChange([...selected, option]);
    }
  };

  const isAllSelected = selected.length === options.length && options.length > 0;

  return (
    <div ref={containerRef} className={cn("space-y-2 relative transition-all", isOpen ? "z-[50]" : "z-10", className)}>
      <label className="text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest ml-1">{label}</label>
      <div 
        className={cn(
          "bg-white dark:bg-slate-800/90 border border-slate-200/80 dark:border-slate-700 rounded-2xl px-4 py-3 text-sm outline-none cursor-pointer flex items-center justify-between transition-all shadow-sm hover:border-blue-400 min-h-[48px]",
          isOpen && "ring-4 ring-blue-500/10 border-blue-500"
        )}
        onClick={() => setIsOpen(!isOpen)}
      >
        <span className={cn("truncate", selected.length === 0 ? "text-slate-400 dark:text-slate-400" : "text-slate-900 dark:text-white font-bold")}>
          {selected.length === 0 ? placeholder : selected.length === 1 ? (formatOption ? formatOption(selected[0]) : selected[0]) : selected.length === options.length ? "Todos Selecionados" : `${selected.length} Selecionados`}
        </span>
        <motion.div animate={{ rotate: isOpen ? 180 : 0 }}>
          <ChevronDown size={16} className="text-slate-400 dark:text-slate-400" />
        </motion.div>
      </div>

      <AnimatePresence>
        {isOpen && (
          <>
            <div className="fixed inset-0 z-[40]" onClick={() => setIsOpen(false)} />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="absolute top-full left-0 right-0 mt-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700/80 rounded-3xl shadow-2xl z-[50] max-h-[400px] overflow-hidden flex flex-col min-w-[280px]"
            >
              <div className="p-4 border-b border-slate-100 dark:border-slate-800 space-y-3 bg-slate-50/70 dark:bg-slate-800/50">
                <div className="flex items-center justify-between gap-2">
                  <button 
                    onClick={() => onChange(options)}
                    className="text-[10px] font-black text-blue-600 dark:text-blue-400 uppercase tracking-widest px-3 py-1.5 hover:bg-blue-100/50 dark:hover:bg-blue-900/30 rounded-xl transition-all"
                  >
                    Marcar Todos
                  </button>
                  <button 
                    onClick={() => onChange([])}
                    className="text-[10px] font-black text-slate-400 dark:text-slate-400 uppercase tracking-widest px-3 py-1.5 hover:bg-slate-200/50 dark:hover:bg-slate-800 rounded-xl transition-all"
                  >
                    Desmarcar
                  </button>
                </div>
                <div className="relative group">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-blue-500 transition-colors" size={14} />
                  <input 
                    type="text" 
                    placeholder="Pesquisar opções..."
                    value={filterText}
                    onChange={(e) => setFilterText(e.target.value)}
                    className="w-full pl-9 pr-4 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 text-slate-900 dark:text-white transition-all font-medium placeholder:text-slate-400"
                    onClick={(e) => e.stopPropagation()}
                  />
                </div>
              </div>
              <div className="overflow-y-auto py-2 px-1 scrollbar-hide max-h-[400px]">
                {filteredOptions.length > 0 ? filteredOptions.map((option) => {
                  const isSelected = selected.includes(option);
                  return (
                    <div 
                      key={option}
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleOption(option);
                      }}
                      className={cn(
                        "mx-1 px-4 py-3 text-xs cursor-pointer flex items-center gap-3 transition-all rounded-xl relative group/item mb-0.5",
                        isSelected ? "bg-blue-50 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 font-black shadow-sm" : "hover:bg-slate-50 dark:hover:bg-slate-800/80 text-slate-700 dark:text-slate-200 font-medium"
                      )}
                    >
                      <div className={cn(
                        "w-5 h-5 rounded-lg border-2 flex items-center justify-center transition-all shrink-0",
                        isSelected ? "bg-blue-600 border-blue-600 scale-110 shadow-md shadow-blue-500/20" : "border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 group-hover/item:border-blue-300"
                      )}>
                        {isSelected && <Plus size={14} className="text-white rotate-45" />}
                      </div>
                      <span className="truncate flex-1">{formatOption ? formatOption(option) : option}</span>
                      {isSelected && (
                        <motion.div 
                          initial={{ scale: 0 }}
                          animate={{ scale: 1 }}
                          className="w-1.5 h-1.5 rounded-full bg-blue-600 dark:bg-blue-400"
                        />
                      )}
                    </div>
                  );
                }) : (
                  <div className="py-12 flex flex-col items-center gap-3 text-slate-400">
                    <Search size={24} className="opacity-20" />
                    <span className="text-xs font-black uppercase tracking-widest">Nada encontrado</span>
                  </div>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

const DOC_SISTEMA_COLUMNS = [
  "Frota", "Placa", "Pedido", "Vencimento", "Pagamento", "Razão Social", "Descrição",
  "Documento", "Observações", "Parcela", "Valor"
];

const formatBRDate = (val: any) => {
  if (!val || typeof val !== 'string') return val;
  
  // Handle ISO format: 2026-04-23T...
  if (/^\d{4}-\d{2}-\d{2}/.test(val)) {
    const parts = val.split('T')[0].split('-');
    if (parts.length === 3) {
      const [y, m, d] = parts;
      return `${d}/${m}/${y}`;
    }
  }
  
  // Handle M/D/YYYY or MM/DD/YYYY format: 4/23/2026 or 04/23/2026
  const usMatch = val.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (usMatch) {
    const p1 = parseInt(usMatch[1]);
    const p2 = parseInt(usMatch[2]);
    const y = usMatch[3];
    
    if (p1 <= 12 && p2 > 12) {
      const m = p1.toString().padStart(2, '0');
      const d = p2.toString().padStart(2, '0');
      return `${d}/${m}/${y}`;
    }
  }
  
  return val;
};

const getDaysRemaining = (expiryDate: string) => {
  if (!expiryDate) return 0;
  const parts = expiryDate.split('/');
  if (parts.length !== 3) return 0;
  const d = new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diffTime = d.getTime() - today.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays;
};

const formatDaysRemain = (dateStr: string) => {
  const days = getDaysRemaining(dateStr);
  if (days < 0) return `Vencido há ${Math.abs(days)}d`;
  if (days === 0) return 'Vence Hoje';
  return `Vence em ${days}d`;
};

const isVencimentoNoAno = (vencStr: any) => {
  if (!vencStr) return false;
  const s = String(vencStr).trim();
  if (s === "" || s === "-" || s.toUpperCase().includes("DEFINIR")) return false;
  
  const currentYear = new Date().getFullYear();

  if (/^\d{4}/.test(s)) {
    const y = parseInt(s.substring(0, 4));
    return y === currentYear;
  }

  const clean = s.split("T")[0];
  const parts = clean.split(/[\/\-\s]/).filter(Boolean);
  if (parts.length >= 2) {
    const last = parts[parts.length - 1];
    if (/^\d{2,4}$/.test(last)) {
      let y = parseInt(last);
      if (y < 100) y += 2000;
      return y === currentYear;
    }
  }

  return true;
};

const clientClassifyDocument = (expiryDateStr: string) => {
  if (!expiryDateStr || typeof expiryDateStr !== 'string' || expiryDateStr.trim() === "" || expiryDateStr.toLowerCase().includes("definir")) {
    return { status: 'ok' as const, daysRemaining: 999 };
  }

  const cleanStr = expiryDateStr.trim().replace(/-/g, '/').replace(/\./g, '/');
  const today = startOfDay(new Date());
  let expiryDate: Date | null = null;

  const formats = [
    "dd/MM/yyyy",
    "d/M/yyyy",
    "dd/MM/yy",
    "d/M/yy",
    "yyyy/MM/dd",
    "MM/dd/yyyy",
    "M/d/yyyy"
  ];
  
  if (cleanStr.toUpperCase().includes("RENOVAR") || cleanStr.toUpperCase().includes("VENCIDO") || cleanStr.toUpperCase().includes("SEM AUTORIZ")) {
    return { status: 'vencido' as const, daysRemaining: -999, formattedDate: expiryDateStr };
  }
  if (cleanStr.toUpperCase().includes("RESERVA")) {
    return { status: 'atencao' as const, daysRemaining: 15 };
  }

  for (const fmt of formats) {
    const parsed = parse(cleanStr, fmt, new Date());
    if (isValid(parsed)) {
      expiryDate = startOfDay(parsed);
      break;
    }
  }

  if (!expiryDate) {
    const match = cleanStr.match(/(?:^|\s|-)(\d{1,2})\/(\d{2,4})$/);
    if (match) {
      const month = parseInt(match[1]);
      let year = parseInt(match[2]);
      if (year < 100) year += 2000; 
      if (month >= 1 && month <= 12) {
        expiryDate = startOfDay(new Date(year, month, 0)); 
      }
    }
  }

  if (!expiryDate) return { status: 'ok' as const, daysRemaining: 999, formattedDate: expiryDateStr };

  const daysRemaining = differenceInDays(expiryDate, today);
  const formattedDate = format(expiryDate, "dd/MM/yyyy");

  let status: 'vencido' | 'critico' | 'atencao' | 'ok' = 'ok';
  if (daysRemaining < 0) status = 'vencido';
  else if (daysRemaining <= 7) status = 'critico';
  else if (daysRemaining <= 30) status = 'atencao';

  return { status, daysRemaining, formattedDate };
};

const isPagoDoc = (v: any) => {
  if (!v) return false;
  if (v.overallStatus === 'pagos') return true;

  if (v.source === "LICENCAS") {
    if (v.documents && v.documents.length > 0) {
      const validDocs = v.documents.filter((d: any) => {
        const rawDate = (d.rawExpiryDate || d.expiryDate || "").toString().trim();
        return rawDate && rawDate !== "-" && !rawDate.toUpperCase().includes("DEFINIR") && !rawDate.toUpperCase().includes("VAZIO") && !rawDate.toUpperCase().includes("VÁZIO");
      });
      if (validDocs.length === 0) return false;
      return validDocs.every((d: any) => {
        const rawDate = (d.rawExpiryDate || d.expiryDate || "").toString().trim();
        const classification = clientClassifyDocument(rawDate);
        return classification.status !== 'vencido';
      });
    }
  }

  if (v.documents && v.documents.length > 0 && v.documents.every((d: any) => d.status === 'pagos')) return true;
  
  const pag = (v.extraData?.["Pagamento"] || v.extraData?.["PAGAMENTO"] || v.extraData?.["Data Pagamento"] || v.extraData?.["DT PAGAMENTO"] || v.extraData?.["Dt Pag"] || v.extraData?.["Data Pgto"] || v.extraData?.["Data Pag"] || v.extraData?.["Pago em"] || v.extraData?.["Baixa"] || v.extraData?.["Data Baixa"] || v.extraData?.["DT BAIXA"] || "").toString().trim().toUpperCase();
  if (pag !== "" && pag !== "-" && !pag.includes("DEFINIR") && !pag.includes("NAO") && !pag.includes("NÃO")) {
    return true;
  }
  
  const statusCol = (v.extraData?.["Status"] || v.extraData?.["STATUS"] || v.extraData?.["Situação"] || v.extraData?.["SITUACAO"] || v.extraData?.["Situacao Titulo"] || v.extraData?.["Status Pagamento"] || v.extraData?.["Situação do Pagamento"] || "").toString().trim().toUpperCase();
  if (statusCol.includes("PAGO") || statusCol.includes("BAIXADO") || statusCol.includes("QUITADO")) return true;
  
  return false;
};

export const isDespachanteType = (val: string | null | undefined): boolean => {
  if (!val) return false;
  const s = String(val).toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  return s.includes("DESPACHANTE") || s.includes("DEPACHANTE") || s.includes("DESP.");
};

const isVencidoDoc = (v: any) => {
  if (!v) return false;
  if (isPagoDoc(v)) return false;
  
  const desc = v.extraData?.["Descrição"] || v.extraData?.["Documento"];
  if (isDespachanteType(desc)) return false;

  if (v.documents && v.documents.length > 0) {
    const validDocs = v.documents.filter((d: any) => !isDespachanteType(d.type));
    if (validDocs.length > 0) {
      if (validDocs.some((d: any) => d.status === 'vencido')) return true;
    } else {
      return false;
    }
  }

  if (v.overallStatus === 'vencido') return true;

  if (v.source === "LICENCAS") {
    if (v.documents && v.documents.length > 0) {
      return v.documents.some((d: any) => {
        if (isDespachanteType(d.type)) return false;
        const rawDate = (d.rawExpiryDate || d.expiryDate || "").toString().trim();
        if (!rawDate || rawDate === "-" || rawDate.toUpperCase().includes("DEFINIR") || rawDate.toUpperCase().includes("VAZIO") || rawDate.toUpperCase().includes("VÁZIO")) return false;
        const classification = clientClassifyDocument(rawDate);
        return classification.status === 'vencido';
      });
    }
  }

  const venc = v.extraData?.["Vencimento"] || v.extraData?.["VENCIMENTO"] || (v.docs && v.docs[0]?.rawExpiryDate);
  if (venc) {
    const classification = clientClassifyDocument(venc);
    if (classification.status === 'vencido') return true;
  }
  return false;
};

const isEmAbertoDoc = (v: any) => {
  if (!v) return false;
  if (isPagoDoc(v)) return false;
  if (isVencidoDoc(v)) return false;

  if (v.source === "LICENCAS") {
    if (v.documents && v.documents.length > 0) {
      return v.documents.some((d: any) => {
        const rawDate = (d.rawExpiryDate || d.expiryDate || "").toString().trim();
        return !rawDate || rawDate === "-" || rawDate.toUpperCase().includes("DEFINIR") || rawDate.toUpperCase().includes("VAZIO") || rawDate.toUpperCase().includes("VÁZIO");
      });
    }
  }

  const venc = v.extraData?.["Vencimento"] || v.extraData?.["VENCIMENTO"] || (v.docs && v.docs[0]?.rawExpiryDate);
  if (!isVencimentoNoAno(venc)) return false;

  return true;
};

const parseCurrencyVal = (val: any): number => {
  if (val === undefined || val === null) return 0;
  if (typeof val === 'number') return isNaN(val) ? 0 : val;
  let s = String(val).trim();
  if (!s || s === "-" || s.toUpperCase().includes("DEFINIR") || s.toUpperCase().includes("VAZIO") || s.toUpperCase().includes("VÁZIO")) return 0;
  
  // Guard against dates like "23/05/2027", "2027-05-23", "05/2027" so parseFloat doesn't extract day numbers
  if (/^\d{1,4}[\/\-]\d{1,2}[\/\-]\d{2,4}/.test(s) || /^\d{1,2}[\/\-]\d{2,4}$/.test(s)) {
    return 0;
  }

  s = s.replace("R$", "").replace(/\s/g, "");
  if (s.includes(",") && s.includes(".")) {
    s = s.replace(/\./g, "").replace(",", ".");
  } else if (s.includes(",")) {
    s = s.replace(",", ".");
  }
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
};

const formatCurrencyBR = (val: number): string => {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);
};

const getMonthFromDate = (dateStr: any): number => {
  if (!dateStr) return -1;
  const s = String(dateStr).trim();
  if (!s || s === "-" || s.toUpperCase().includes("DEFINIR")) return -1;

  if (/^\d{4}/.test(s)) {
    const m = parseInt(s.substring(5, 7));
    if (m >= 1 && m <= 12) return m - 1;
  }
  const clean = s.split("T")[0];
  const parts = clean.split(/[\/\-\s]/).filter(Boolean);
  if (parts.length >= 2) {
    if (parts.length === 2) {
      const m = parseInt(parts[0]);
      if (m >= 1 && m <= 12) return m - 1;
    } else {
      const m = parseInt(parts[1]);
      if (m >= 1 && m <= 12) return m - 1;
    }
  }
  return -1;
};

const getMonthYearInfo = (dateVal: any) => {
  if (!dateVal) return { key: "outros", label: "Outros/Sem Data", sortKey: 999999, monthName: "Outros", year: 9999 };
  const s = String(dateVal).trim();
  if (!s || s === "-" || s.toUpperCase().includes("DEFINIR") || s.toUpperCase().includes("VÁZIO") || s.toUpperCase().includes("VAZIO")) {
    return { key: "outros", label: "Outros/Sem Data", sortKey: 999999, monthName: "Outros", year: 9999 };
  }

  const monthNames = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
  const ptMonths: Record<string, number> = {
    jan: 1, janeiro: 1, fev: 2, fevereiro: 2, mar: 3, marco: 3, março: 3,
    abr: 4, abril: 4, mai: 5, maio: 5, jun: 6, junho: 6, jul: 7, julho: 7,
    ago: 8, agosto: 8, set: 9, setembro: 9, out: 10, outubro: 10,
    nov: 11, novembro: 11, dez: 12, dezembro: 12
  };

  let day = 1, month = -1, year = -1;

  // Handle ISO format YYYY-MM-DD
  if (/^\d{4}/.test(s)) {
    const clean = s.split("T")[0];
    const parts = clean.split("-");
    if (parts.length >= 2) {
      year = parseInt(parts[0]);
      month = parseInt(parts[1]);
      if (parts.length >= 3) day = parseInt(parts[2]);
    }
  }

  // Handle BR/US format or text months with slashes, dashes, or spaces
  if (month === -1) {
    const parts = s.split(/[\/\-\s,]+/).filter(Boolean);
    if (parts.length === 3) {
      let p1Num = parseInt(parts[0]);
      let p2Num = parseInt(parts[1]);
      let p3Num = parseInt(parts[2]);

      let p1Str = parts[0].toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      let p2Str = parts[1].toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

      if (!isNaN(p3Num)) {
        year = p3Num > 1000 ? p3Num : (p3Num >= 0 && p3Num < 100 ? 2000 + p3Num : -1);
      } else if (!isNaN(p1Num) && p1Num > 1000) {
        year = p1Num;
      }

      if (ptMonths[p2Str]) {
        month = ptMonths[p2Str];
        day = p1Num || 1;
      } else if (ptMonths[p1Str]) {
        month = ptMonths[p1Str];
        day = p2Num || 1;
      } else if (!isNaN(p1Num) && !isNaN(p2Num)) {
        if (p1Num > 1000) {
          // YYYY/MM/DD
          month = p2Num;
          day = p3Num;
        } else if (p1Num <= 12 && p2Num > 12) {
          // MM/DD/YYYY
          month = p1Num;
          day = p2Num;
        } else {
          // DD/MM/YYYY
          day = p1Num;
          month = p2Num;
        }
      }
    } else if (parts.length === 2) {
      let p1Num = parseInt(parts[0]);
      let p2Num = parseInt(parts[1]);
      let p1Str = parts[0].toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      let p2Str = parts[1].toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

      if (!isNaN(p2Num)) {
        year = p2Num > 1000 ? p2Num : (p2Num >= 0 && p2Num < 100 ? 2000 + p2Num : -1);
        if (ptMonths[p1Str]) {
          month = ptMonths[p1Str];
        } else if (!isNaN(p1Num) && p1Num >= 1 && p1Num <= 12) {
          month = p1Num;
        }
      } else if (!isNaN(p1Num)) {
        year = p1Num > 1000 ? p1Num : (p1Num >= 0 && p1Num < 100 ? 2000 + p1Num : -1);
        if (ptMonths[p2Str]) {
          month = ptMonths[p2Str];
        } else if (!isNaN(p2Num) && p2Num >= 1 && p2Num <= 12) {
          month = p2Num;
        }
      }
    }
  }

  // Handle Excel Serial Number (e.g. 45870)
  if (month === -1 && !isNaN(Number(s)) && Number(s) > 30000 && Number(s) < 60000) {
    const jsDate = new Date(Math.round((Number(s) - 25569) * 86400 * 1000));
    if (!isNaN(jsDate.getTime())) {
      year = jsDate.getUTCFullYear();
      month = jsDate.getUTCMonth() + 1;
      day = jsDate.getUTCDate();
    }
  }

  if (month >= 1 && month <= 12 && year > 1900 && year < 2100) {
    const mName = monthNames[month - 1];
    const label = `${mName}/${year}`;
    const key = `${year}-${String(month).padStart(2, '0')}`;
    const sortKey = year * 100 + month;
    return { key, label, sortKey, monthName: mName, year };
  }

  return { key: "outros", label: "Outros/Sem Data", sortKey: 999999, monthName: "Outros", year: 9999 };
};

const DEFAULT_LEGAL_VALIDITY_MAP: Record<string, string> = {
  "SEGURO": "01 ANO",
  "TACOGRAFO": "02 ANOS",
  "VISTORIA - SETA": "6 MESES",
  "REGISTRO CADASTRAL - EMP": "2 NA- PG TX 1280,00 SERV 1.500,00",
  "REGISTRO CADASTRAL - EMPR": "2 NA- PG TX 1280,00 SERV 1.500,00",
  "VISTORIA - G.O": "06 MESES",
  "AGR - GOIAS": "01 MÊS",
  "DER": "1 ANO",
  "CRV CERTIFICADO REG VEICULO": "1 ANO - 9 MESES",
  "CRC CERT.REGIST.CADASTRAL FRET": "1 ANO",
  "SEGURO - VEICULO": "01 ANO",
  "SEGURO- PASSAGEIRO": "01 ANO",
  "LAUDO DE VISTORIA - M.G": "06 MESES",
  "DER - M.G": "04meses/9 meses",
  "DER - VENC": "01 ANO",
  "DER- SPO": "01 ANO",
  "VISTORIA - CQI": "01 ANO"
};

const DEFAULT_DOCUMENT_COST_MAP: Record<string, number> = {
  "TACOGRAFO": 350.00,
  "CRONOTACOGRAFO": 380.00,
  "TX INSP TACOGRAFO": 90.09,
  "TX INSP TACO": 90.09,
  "TAXA INSP TACO": 90.09,
  "DER": 120.00,
  "DER- SPO": 120.00,
  "DER - SPO": 120.00,
  "DER - M.G": 120.00,
  "DER - VENC": 120.00,
  "VISTORIA - G.O": 550.00,
  "CUSTO VISTO": 550.00,
  "VISTORIA - SETA": 300.00,
  "LAUDO DE VISTORIA - M.G": 350.00,
  "VISTORIA - CQI": 250.00,
  "VISTORIA": 300.00,
  "AGR - GOIAS": 35.38,
  "CUSTO AGR": 35.38,
  "LICENÇA AGR 40DIAS": 1256.70,
  "SEGURO": 466.64,
  "CUSTO SEG": 466.64,
  "SEGURO - VEICULO": 262.31,
  "SEGURO- VEIC": 262.31,
  "SEGURO- PASSAGEIRO": 466.64,
  "REGISTRO CADASTRAL - EMP": 1280.00,
  "CRC CERT.REGIST.CADASTRAL FRET": 350.00,
  "ANTT": 450.00,
  "CRLV": 180.00,
  "CRV CERTIFICADO REG VEICULO": 180.00,
  "CIV": 220.00,
  "CIPP": 220.00
};

function getDefaultDocumentCost(docType: string): number {
  return 0;
}

export interface LicenseModelItem {
  id: string;
  type: string;
  title: string;
  category: "seguros" | "vistorias" | "orgaos" | "documentos" | "equipamentos";
  categoryLabel: string;
  validity: string;
  frequency: string;
  issuingBody: string;
  description: string;
  requirements: string;
  associatedCostName?: string;
}

const LICENSE_MODELS_CATALOG: LicenseModelItem[] = [
  {
    id: "seguro_geral",
    type: "SEGURO",
    title: "Seguro Geral da Frota",
    category: "seguros",
    categoryLabel: "Seguros & Coberturas",
    validity: "01 ANO",
    frequency: "Renovação Anual",
    issuingBody: "Companhia Seguradora (SUSEP)",
    description: "Apólice de seguro contra sinistros, acidentes de trânsito e cobertura de danos materiais a terceiros.",
    requirements: "Obrigatório para circulação operacional da frota em contratos de fretamento e transporte.",
    associatedCostName: "CUSTO SEGURO"
  },
  {
    id: "seguro_veiculo",
    type: "SEGURO - VEICULO",
    title: "Seguro do Veículo (Casco)",
    category: "seguros",
    categoryLabel: "Seguros & Coberturas",
    validity: "01 ANO",
    frequency: "Renovação Anual",
    issuingBody: "Companhia Seguradora",
    description: "Proteção específica para a estrutura física, colisão, roubo, furto e incêndio do ônibus ou caminhão.",
    requirements: "Exigido pela gestão patrimonial da frota comercial.",
    associatedCostName: "CUSTO SEGURO"
  },
  {
    id: "seguro_passageiro",
    type: "SEGURO- PASSAGEIRO",
    title: "Seguro RCO / Passageiros",
    category: "seguros",
    categoryLabel: "Seguros & Coberturas",
    validity: "01 ANO",
    frequency: "Renovação Anual",
    issuingBody: "Seguradora Habilitada SUSEP / ANTT",
    description: "Seguro de Responsabilidade Civil Operacional cobrindo danos pessoais e materiais a passageiros transportados.",
    requirements: "Exigência legal da ANTT, DER e AGR para transporte coletivo fretado.",
    associatedCostName: "CUSTO SEGURO PASSAGEIRO"
  },
  {
    id: "tacografo",
    type: "TACOGRAFO",
    title: "Cronotacógrafo (Aferição INMETRO)",
    category: "equipamentos",
    categoryLabel: "Equipamentos & Calibração",
    validity: "02 ANOS",
    frequency: "Renovação Bienal (24 Meses)",
    issuingBody: "INMETRO / Postos Credenciados",
    description: "Laudo de verificação metrológica, selagem e certificado de calibração do registrador instantâneo de velocidade e tempo.",
    requirements: "Obrigatório por lei para veículos de carga > 4.536 kg e transporte coletivo de passageiros.",
    associatedCostName: "CUSTO TACOGRAFO"
  },
  {
    id: "tx_insp_tacografo",
    type: "TX INSP TACOGRAFO",
    title: "Taxa / Inspeção de Tacógrafo",
    category: "equipamentos",
    categoryLabel: "Equipamentos & Calibração",
    validity: "02 ANOS",
    frequency: "Renovação Bienal (24 Meses)",
    issuingBody: "INMETRO / Postos Credenciados",
    description: "Taxa de verificação e inspeção periódica do cronotacógrafo para emissão de certificado.",
    requirements: "Obrigatório para regularização da aferição do cronotacógrafo no INMETRO.",
    associatedCostName: "TX INSP TACO"
  },
  {
    id: "vistoria_seta",
    type: "VISTORIA - SETA",
    title: "Vistoria Técnica SETA",
    category: "vistorias",
    categoryLabel: "Vistorias & Laudos",
    validity: "6 MESES",
    frequency: "Renovação Semestral (6 em 6 meses)",
    issuingBody: "Inspeção Técnica SETA / Operações",
    description: "Laudo de inspeção de itens mecânicos, elétricos, pneus, freios e segurança veicular específica.",
    requirements: "Exigido em auditorias de contratantes e frotas de transporte de trabalhadores.",
    associatedCostName: "CUSTO VISTORIA SETA"
  },
  {
    id: "vistoria_go",
    type: "VISTORIA - G.O",
    title: "Vistoria Técnica G.O (Goiás)",
    category: "vistorias",
    categoryLabel: "Vistorias & Laudos",
    validity: "06 MESES",
    frequency: "Renovação Semestral",
    issuingBody: "DETRAN-GO / Entidade Credenciada",
    description: "Laudo de vistoria veicular oficial para veículos em operação no estado de Goiás.",
    requirements: "Pré-requisito para obtenção e renovação da Licença AGR.",
    associatedCostName: "CUSTO VISTORIA GO"
  },
  {
    id: "laudo_vistoria_mg",
    type: "LAUDO DE VISTORIA - M.G",
    title: "Laudo de Vistoria DER-MG",
    category: "vistorias",
    categoryLabel: "Vistorias & Laudos",
    validity: "06 MESES",
    frequency: "Renovação Semestral",
    issuingBody: "DER-MG / Engenheiro Credenciado",
    description: "Laudo de inspeção técnica de segurança e acessibilidade exigido no estado de Minas Gerais.",
    requirements: "Obrigatório para concessão do Certificado DER-MG.",
    associatedCostName: "CUSTO VISTORIA MG"
  },
  {
    id: "vistoria_cqi",
    type: "VISTORIA - CQI",
    title: "Vistoria CQI (Qualidade Interna)",
    category: "vistorias",
    categoryLabel: "Vistorias & Laudos",
    validity: "01 ANO",
    frequency: "Renovação Anual",
    issuingBody: "Auditoria Interna / CQI",
    description: "Certificado de Qualidade e Inspeção de conformidade operacional da frota.",
    requirements: "Padrão interno de manutenção preventiva e excelência.",
    associatedCostName: "CUSTO VISTORIA CQI"
  },
  {
    id: "agr_goias",
    type: "AGR - GOIAS",
    title: "Licença AGR (Goiás)",
    category: "orgaos",
    categoryLabel: "Órgãos Reguladores",
    validity: "01 MÊS",
    frequency: "Renovação Mensal / Periódica",
    issuingBody: "AGR - Agência Goiana de Regulação",
    description: "Autorização de tráfego intermunicipal de passageiros nas rodovias do estado de Goiás.",
    requirements: "Exigido comprovante de pagamento da taxa e laudo de vistoria válido.",
    associatedCostName: "CUSTO AGR"
  },
  {
    id: "licenca_agr_40d",
    type: "LICENÇA AGR 40DIAS",
    title: "Licença AGR 40 Dias / Especial",
    category: "orgaos",
    categoryLabel: "Órgãos Reguladores",
    validity: "01 ANO",
    frequency: "Renovação Anual (Autorização Especial)",
    issuingBody: "AGR Goiás",
    description: "Licença especial de fretamento contínuo/eventual emitida sob regime temporário pela AGR.",
    requirements: "Apresentação da relação de passageiros e contrato comercial vigente.",
    associatedCostName: "CUSTO LICENCA AGR"
  },
  {
    id: "der_geral",
    type: "DER",
    title: "Licença DER (Geral / Rodovias)",
    category: "orgaos",
    categoryLabel: "Órgãos Reguladores",
    validity: "1 ANO",
    frequency: "Renovação Anual",
    issuingBody: "DER - Depto de Estradas de Rodagem",
    description: "Autorização para tráfego e fretamento em rodovias estaduais.",
    requirements: "Pagamento de taxas regulamentares e cadastro ativo da empresa.",
    associatedCostName: "CUSTO DER"
  },
  {
    id: "der_mg",
    type: "DER - M.G",
    title: "Licença DER-MG (Minas Gerais)",
    category: "orgaos",
    categoryLabel: "Órgãos Reguladores",
    validity: "04meses/9 meses",
    frequency: "Quadrimestral / Conforme Contrato",
    issuingBody: "DER-MG",
    description: "Autorização de transporte coletivo fretado em malhas rodoviárias mineiras.",
    requirements: "Vistoria semestral válida e quitação da taxa de fiscalização.",
    associatedCostName: "CUSTO DER MG"
  },
  {
    id: "der_spo",
    type: "DER- SPO",
    title: "Licença DER-SPO (São Paulo / Operacional)",
    category: "orgaos",
    categoryLabel: "Órgãos Reguladores",
    validity: "01 ANO",
    frequency: "Renovação Anual",
    issuingBody: "DER-SP / ARTESP",
    description: "Autorização para fretamento e circulação na malha rodoviária do estado de São Paulo.",
    requirements: "Cadastro ativo na ARTESP / DER-SP.",
    associatedCostName: "CUSTO DER SPO"
  },
  {
    id: "crv_veiculo",
    type: "CRV CERTIFICADO REG VEICULO",
    title: "CRV / CRLV (Certificado do Veículo)",
    category: "documentos",
    categoryLabel: "Documentação & Cadastros",
    validity: "1 ANO - 9 MESES",
    frequency: "Licenciamento Anual (conforme final de placa)",
    issuingBody: "DETRAN / SENATRAN",
    description: "Certificado de Registro e Licenciamento do Veículo digital (CRLV-e) comprovando regularidade fiscal e IPVA.",
    requirements: "Quitação de IPVA, DPVAT/SPVAT e multas administrativas.",
    associatedCostName: "CUSTO CRV / LICENCIAMENTO"
  },
  {
    id: "crc_fretamento",
    type: "CRC CERT.REGIST.CADASTRAL FRET",
    title: "CRC Certificado Cadastral Fretamento",
    category: "documentos",
    categoryLabel: "Documentação & Cadastros",
    validity: "1 ANO",
    frequency: "Renovação Anual",
    issuingBody: "ANTT / DER",
    description: "Certificado de Registro Cadastral habilitando a transportadora a prestar serviços de fretamento de passageiros.",
    requirements: "Regularidade jurídica, fiscal e trabalhista da empresa.",
    associatedCostName: "CUSTO CRC FRETAMENTO"
  },
  {
    id: "registro_empresa",
    type: "REGISTRO CADASTRAL - EMPR",
    title: "Registro Cadastral da Empresa",
    category: "documentos",
    categoryLabel: "Documentação & Cadastros",
    validity: "2 ANOS (Tx 1280,00 Serv 1500,00)",
    frequency: "Renovação Bienal",
    issuingBody: "Órgão Municipal / Estadual",
    description: "Cadastro de habilitação jurídica e operadora de transporte público/privado fretado.",
    requirements: "Taxa cadastral de R$ 1.280,00 e taxa de serviço R$ 1.500,00.",
    associatedCostName: "CUSTO REGISTRO CADASTRAL"
  }
];

const getLegalValidityPeriod = (type: string, rawValidity?: string, customMap?: Record<string, string>) => {
  if (rawValidity && rawValidity.trim()) return rawValidity.trim();
  const norm = type.toUpperCase().trim();
  const map = customMap || DEFAULT_LEGAL_VALIDITY_MAP;
  if (map[norm]) return map[norm];
  const foundKey = Object.keys(map).find(k => norm.includes(k) || k.includes(norm));
  if (foundKey) return map[foundKey];
  return "01 ANO";
};

export const getBayerGoDespachanteInfo = (fleetList: any[]) => {
  let detectedOp = "";
  for (const v of (fleetList || [])) {
    if (v && v.extraData) {
      const despKey = Object.keys(v.extraData).find(k => {
        const uk = k.toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        return uk.includes("DESPACHANTE") || uk.includes("DEPACHANTE");
      });
      if (despKey && v.extraData[despKey]) {
        const valStr = String(v.extraData[despKey]).trim();
        if (valStr && valStr !== "-") {
          const valNum = parseCurrencyVal(valStr);
          if (valNum > 0) {
            return {
              formatted: formatCurrencyBR(valNum),
              value: valNum,
              hasBayerGo: true,
              operationName: v.operation || "BAYER"
            };
          }
        }
      }
    }
    if (v && v.operation && !detectedOp) {
      const opUpper = v.operation.toUpperCase();
      if (opUpper.includes("BAYER")) detectedOp = v.operation;
    }
  }

  return {
    formatted: "R$ 120,00",
    value: 120,
    hasBayerGo: true,
    operationName: detectedOp || "BAYER GO"
  };
};

const isFinancialColumnName = (colName: string): boolean => {
  const uc = colName.toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (uc === "TACOGRAFO") return true;
  return uc.includes("VALOR") || 
         uc.includes("TAXA") || 
         uc.includes("TX") || 
         uc.includes("CUSTO") || 
         uc.includes("CUSTA") || 
         uc.includes("PRECO") || 
         uc.includes("PREÇO") || 
         uc.includes("R$") ||
         uc.includes("LICENCA AGR") ||
         uc.includes("LICENÇA AGR") ||
         uc.includes("AGR 40") ||
         uc.includes("DESPACHANTE") ||
         uc.includes("DEPACHANTE");
};

const getAssociatedFinancials = (docType: string, allFinCols: string[], allDocTypes: string[] = []): string[] => {
  const dt = docType.toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const finOnly = allFinCols.filter(isFinancialColumnName);

  if (dt.includes("SEGURO")) {
    if (dt.includes("VEICULO") || dt.includes("VEIC")) {
      return finOnly.filter(col => {
        const uc = col.toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        return uc.includes("SEGURO") && uc.includes("VEIC");
      });
    }
    if (dt.includes("PASSAGEIRO") || dt.includes("PASS") || dt.includes("RCO")) {
      return finOnly.filter(col => {
        const uc = col.toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        return (uc.includes("SEGURO") || uc.includes("SEG")) && (uc.includes("PASSAGEIRO") || uc.includes("PASS") || uc.includes("RCO"));
      });
    }
    const matched = finOnly.filter(col => {
      const uc = col.toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      return (uc.includes("SEGURO") || uc.includes("CUSTO SEG") || uc.includes("CUSTO SEGURO") || uc === "CUSTO SEG" || uc === "SEG") && !uc.includes("VEIC") && !uc.includes("PASSAGEIRO");
    });
    if (matched.length > 0) return matched;
  }

  if (dt.includes("TACOGRAFO") || dt.includes("CRONOTACOGRAFO") || dt.includes("TACO")) {
    if (dt.includes("INSP") || dt.includes("TAXA") || dt.includes("TX")) {
      return finOnly.filter(col => {
        const uc = col.toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        return (uc.includes("INSP") || uc.includes("TAXA") || uc.includes("TX")) && (uc.includes("TACO") || uc.includes("TACOGRAFO"));
      });
    } else {
      return finOnly.filter(col => {
        const uc = col.toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        return (uc.includes("TACOGRAFO") || uc === "TACOGRAFO" || uc.includes("CUSTO TACO")) && !uc.includes("INSP") && !uc.includes("TAXA") && !uc.includes("TX");
      });
    }
  }

  if (dt.includes("VISTORIA")) {
    return finOnly.filter(col => {
      const uc = col.toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      return uc.includes("VISTORIA") || uc.includes("VISTO");
    });
  }

  if (dt.includes("AGR")) {
    if (dt.includes("40") || dt.includes("LICENCA") || dt.includes("LICENÇA") || dt.includes("DIAS")) {
      return finOnly.filter(col => {
        const uc = col.toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        return uc.includes("AGR") && (uc.includes("40") || uc.includes("LICENCA") || uc.includes("LICENÇA") || uc.includes("DIAS"));
      });
    } else {
      return finOnly.filter(col => {
        const uc = col.toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        return uc.includes("AGR") && !uc.includes("40") && !uc.includes("LICENCA") && !uc.includes("LICENÇA") && !uc.includes("DIAS");
      });
    }
  }

  if (dt.includes("DER")) {
    return finOnly.filter(col => {
      const uc = col.toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      return uc.includes("DER") && !uc.includes("DESP");
    });
  }

  // AUTORIZAÇÃO DE FRET. CONTINUO and REGISTRO CADASTRAL - EMPR do NOT have financial values ($0). They are only for validity tracking.
  if (dt.includes("AUTORIZACAO") || dt.includes("FRET") || dt.includes("CADASTRAL") || dt.includes("REGISTRO") || dt.includes("EMPR")) {
    return [];
  }

  if (dt.includes("LICENCA") || dt.includes("LICENÇA") || dt.includes("ANEXO")) {
    const matched = finOnly.filter(col => {
      const uc = col.toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      return uc.includes("LICENCA") || uc.includes("LICENÇA") || uc.includes("DESPACHANTE") || uc.includes("CUSTO");
    });
    if (matched.length > 0) return matched;
  }

  const hasDespCol = finOnly.some(c => {
    const uc = c.toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    return uc.includes("DESPACHANTE") || uc.includes("DEPACHANTE") || uc.includes("DESP");
  });

  if (hasDespCol) {
    if (dt.includes("DER")) {
      return finOnly.filter(col => {
        const uc = col.toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        return uc.includes("DESPACHANTE") || uc.includes("DEPACHANTE") || uc.includes("DESP");
      });
    }
  }

  return [];
};

export default function App() {
  const [showCover, setShowCover] = useState(true);
  
  const [theme, setTheme] = useState<"light" | "dark">(() => {
    const saved = localStorage.getItem("app_theme_v2");
    if (saved === "light" || saved === "dark") {
      return saved;
    }
    // Padrão do sistema: DARK
    return "dark";
  });

  useEffect(() => {
    localStorage.setItem("app_theme_v2", theme);
    localStorage.setItem("app_theme", theme);
    if (theme === "dark") {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  }, [theme]);

  const [fleet, setFleet] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date>(() => new Date());
  const [lastSaved, setLastSaved] = useState<Date>(() => {
    try {
      const saved = localStorage.getItem("logifleet_last_save_time");
      if (saved) {
        const d = new Date(saved);
        if (!isNaN(d.getTime())) return d;
      }
    } catch (_) {}
    return new Date();
  });
  const [savingManual, setSavingManual] = useState(false);
  const [saveSuccessNotice, setSaveSuccessNotice] = useState(false);

  const updateLastSavedTime = useCallback((d: Date = new Date()) => {
    setLastSaved(d);
    try {
      localStorage.setItem("logifleet_last_save_time", d.toISOString());
    } catch (_) {}
  }, []);
  const [isStaticMode, setIsStaticMode] = useState(false);
  const [serverStarting, setServerStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"home" | "dashboard" | "licencas_detalhadas" | "licencas_documentos" | "financeiro_docs" | "financeiro_licencas" | "map" | "settings" | "tutorial">("dashboard");
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [activeDashboardSubTab, setActiveDashboardSubTab] = useState<"licencas" | "documentacao">("licencas");
  const [dashLicActiveTab, setDashLicActiveTab] = useState<"indicadores" | "justificativas" | "farol">("indicadores");
  const [dashDocActiveTab, setDashDocActiveTab] = useState<"indicadores" | "justificativas" | "farol">("indicadores");
  const [isIsometricStats, setIsIsometricStats] = useState(true);
  const [justifications, setJustifications] = useState<LicenseJustification[]>(() => {
    try {
      const saved = localStorage.getItem("uni_license_justifications");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch (_) {}
    return defaultLicenseJustifications;
  });
  const [justificationsLoaded, setJustificationsLoaded] = useState(false);
  const [docJustifications, setDocJustifications] = useState<LicenseJustification[]>(() => {
    try {
      const saved = localStorage.getItem("uni_doc_justifications");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch (_) {}
    return defaultDocJustifications;
  });
  const [docJustificationsLoaded, setDocJustificationsLoaded] = useState(false);

  // Histórico detalhado de ações por veículo (Licenças e Documentação) com suporte a descompressão
  const [licenseHistory, setLicenseHistory] = useState<JustificationHistoryItem[]>(() => {
    return loadLicenseHistoryFromStorage(defaultLicenseHistory);
  });
  const [docHistory, setDocHistory] = useState<JustificationHistoryItem[]>(() => {
    return loadDocHistoryFromStorage(defaultDocHistory);
  });

  const justificationsRef = useRef(justifications);
  justificationsRef.current = justifications;
  const docJustificationsRef = useRef(docJustifications);
  docJustificationsRef.current = docJustifications;
  const licenseHistoryRef = useRef(licenseHistory);
  licenseHistoryRef.current = licenseHistory;
  const docHistoryRef = useRef(docHistory);
  docHistoryRef.current = docHistory;

  // Fullscreen state and handler for header button
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const handleFullscreenChange = () => {
      const isCurrentlyFullscreen = !!(
        document.fullscreenElement ||
        (document as any).webkitFullscreenElement ||
        (document as any).mozFullScreenElement ||
        (document as any).msFullscreenElement
      );
      setIsFullscreen(isCurrentlyFullscreen);
    };

    document.addEventListener("fullscreenchange", handleFullscreenChange);
    document.addEventListener("webkitfullscreenchange", handleFullscreenChange);
    document.addEventListener("mozfullscreenchange", handleFullscreenChange);
    document.addEventListener("MSFullscreenChange", handleFullscreenChange);

    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
      document.removeEventListener("webkitfullscreenchange", handleFullscreenChange);
      document.removeEventListener("mozfullscreenchange", handleFullscreenChange);
      document.removeEventListener("MSFullscreenChange", handleFullscreenChange);
    };
  }, []);

  const toggleFullscreen = useCallback(() => {
    try {
      const doc = document as any;
      const docEl = document.documentElement as any;

      if (!doc.fullscreenElement && !doc.webkitFullscreenElement && !doc.mozFullScreenElement && !doc.msFullscreenElement) {
        if (docEl.requestFullscreen) {
          docEl.requestFullscreen().catch(() => {});
        } else if (docEl.webkitRequestFullscreen) {
          docEl.webkitRequestFullscreen();
        } else if (docEl.mozRequestFullScreen) {
          docEl.mozRequestFullScreen();
        } else if (docEl.msRequestFullscreen) {
          docEl.msRequestFullscreen();
        }
      } else {
        if (doc.exitFullscreen) {
          doc.exitFullscreen().catch(() => {});
        } else if (doc.webkitExitFullscreen) {
          doc.webkitExitFullscreen();
        } else if (doc.mozCancelFullScreen) {
          doc.mozCancelFullScreen();
        } else if (doc.msExitFullscreen) {
          doc.msExitFullscreen();
        }
      }
    } catch (err) {
      console.warn("Fullscreen toggle warning:", err);
    }
  }, []);

  // Sidebar navigation scroll tracking and helper controls
  const sidebarNavRef = useRef<HTMLElement>(null);
  const [sidebarCanScrollUp, setSidebarCanScrollUp] = useState(false);
  const [sidebarCanScrollDown, setSidebarCanScrollDown] = useState(false);

  const checkSidebarScroll = useCallback(() => {
    if (sidebarNavRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = sidebarNavRef.current;
      setSidebarCanScrollUp(scrollTop > 6);
      setSidebarCanScrollDown(scrollTop + clientHeight < scrollHeight - 6);
    }
  }, []);

  useEffect(() => {
    const el = sidebarNavRef.current;
    if (!el) return;
    checkSidebarScroll();
    el.addEventListener("scroll", checkSidebarScroll, { passive: true });
    window.addEventListener("resize", checkSidebarScroll);
    const timer = setTimeout(checkSidebarScroll, 200);
    return () => {
      el.removeEventListener("scroll", checkSidebarScroll);
      window.removeEventListener("resize", checkSidebarScroll);
      clearTimeout(timer);
    };
  }, [checkSidebarScroll, isSidebarOpen]);
  const [showMapFilters, setShowMapFilters] = useState(true);
  const [activeSettingsTab, setActiveSettingsTab] = useState("geral");
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedOperation, setSelectedOperation] = useState<string[]>([]);
  const [selectedStatus, setSelectedStatus] = useState<string[]>([]);
  const [selectedCity, setSelectedCity] = useState<string[]>([]);
  const [selectedDriver, setSelectedDriver] = useState<string[]>([]);
  const [selectedDocTypesLic, setSelectedDocTypesLic] = useState<string[]>([]);
  const [selectedFrequencyLic, setSelectedFrequencyLic] = useState<string[]>([]);

  // Dashboard Licenças filters
  const [selectedPlatesLic, setSelectedPlatesLic] = useState<string[]>([]);
  const [selectedStatusLic, setSelectedStatusLic] = useState<string[]>([]);
  const [selectedFleetStatusLic, setSelectedFleetStatusLic] = useState<string[]>([]);
  const [selectedOperationsLic, setSelectedOperationsLic] = useState<string[]>([]);
  const [selectedCitiesLic, setSelectedCitiesLic] = useState<string[]>([]);
  const [isDashLicFilterVisible, setIsDashLicFilterVisible] = useState(false);
  const [includePdfSummaries, setIncludePdfSummaries] = useState<boolean>(() => {
    const saved = localStorage.getItem("uni_include_pdf_summaries");
    return saved !== null ? saved === "true" : true;
  });

  const toggleIncludePdfSummaries = (val?: boolean) => {
    const nextVal = val !== undefined ? val : !includePdfSummaries;
    setIncludePdfSummaries(nextVal);
    localStorage.setItem("uni_include_pdf_summaries", String(nextVal));
  };

  // Dashboard Documentação filters
  const [selectedPlatesDocDash, setSelectedPlatesDocDash] = useState<string[]>([]);
  const [selectedStatusDocDash, setSelectedStatusDocDash] = useState<string[]>([]);
  const [selectedFleetStatusDocDash, setSelectedFleetStatusDocDash] = useState<string[]>([]);
  const [selectedFleetDocDash, setSelectedFleetDocDash] = useState<string[]>([]);
  const [selectedDescDocDash, setSelectedDescDocDash] = useState<string[]>([]);
  const [isDashDocFilterVisible, setIsDashDocFilterVisible] = useState(false);
  const [exibirDocsSemPlaca, setExibirDocsSemPlaca] = useState(true);

  // Documentação specific filters
  const [selectedEmpresa, setSelectedEmpresa] = useState<string[]>([]);
  const [selectedRazaoSocial, setSelectedRazaoSocial] = useState<string[]>([]);
  const [selectedEstado, setSelectedEstado] = useState<string[]>([]);
  const [selectedFleetDoc, setSelectedFleetDoc] = useState<string[]>([]);
  const [selectedPlateDoc, setSelectedPlateDoc] = useState<string[]>([]);
  const [selectedDescDoc, setSelectedDescDoc] = useState<string[]>([]);
  const [selectedObsDoc, setSelectedObsDoc] = useState<string[]>([]);
  const [selectedVencimentoDoc, setSelectedVencimentoDoc] = useState<string[]>([]);
  const [selectedPagamentoDoc, setSelectedPagamentoDoc] = useState<string[]>([]);
  const [selectedParcelaDoc, setSelectedParcelaDoc] = useState<string[]>([]);
  const [selectedStatusDoc, setSelectedStatusDoc] = useState<string[]>([]);
  const [selectedYearLic, setSelectedYearLic] = useState<string[]>([]);
  const [selectedMonthLic, setSelectedMonthLic] = useState<string[]>([]);
  const [isFilterVisible, setIsFilterVisible] = useState(true);
  const [finLicencasSubTab, setFinLicencasSubTab] = useState<'resumo' | 'painel' | 'prazos_modelos'>('resumo');
  const [resumoStatusFilter, setResumoStatusFilter] = useState<'todos' | 'alertas' | 'vencido' | 'critico' | 'atencao' | 'ok'>('todos');
  const [resumoSearchTerm, setResumoSearchTerm] = useState('');
  const [resumoSortKey, setResumoSortKey] = useState<'docType' | 'operation' | 'plate' | 'fleet' | 'frequencia' | 'valor' | 'status' | 'prazo' | 'vencimento'>('status');
  const [resumoSortDir, setResumoSortDir] = useState<'asc' | 'desc'>('asc');
  const [modelosSearch, setModelosSearch] = useState('');
  const [modelosCategory, setModelosCategory] = useState<string>('todos');
  const [isParcelaUnica, setIsParcelaUnica] = useState(false);
  const [isPagos100, setIsPagos100] = useState(false);
  const [includeChartsInPDF, setIncludeChartsInPDF] = useState(true);
  const [showPlatesCol, setShowPlatesCol] = useState(true);
  const [originCity, setOriginCity] = useState<string>("");
  const [destinationCity, setDestinationCity] = useState<string>("");
  const [routeDistance, setRouteDistance] = useState<number | null>(null);
  const [showNotifications, setShowNotifications] = useState(false);
  const [isGoogleConnected, setIsGoogleConnected] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [prazosSearchTerm, setPrazosSearchTerm] = useState("");
  const [editingPrazoKey, setEditingPrazoKey] = useState<string | null>(null);
  const [editingPrazoVal, setEditingPrazoVal] = useState("");
  const [isAddingPrazo, setIsAddingPrazo] = useState(false);
  const [newPrazoKey, setNewPrazoKey] = useState("");
  const [newPrazoVal, setNewPrazoVal] = useState("01 ANO");

  const [settings, setSettings] = useState(() => {
    const saved = localStorage.getItem('logifleet_settings');
    const defaultSettings = {
      companyName: "LogiFleet",
      timezone: "Brasília (GMT-3)",
      refreshInterval: 60,
      alertAttention: 30,
      alertCritical: 7,
      showLogo: true,
      logoUrl: "https://raw.githubusercontent.com/Buenotec/Logo_UNI/refs/heads/main/logo_uni.png",
      notifications: {
        email: true,
        push: true,
        weekly: true,
        whatsapp: true
      },
      notificationEmails: ["diretoria@uni.com.br"],
      notificationWhatsapps: ["5511999999999"],
      reportFrequency: "weekly",
      lastSentDate: null as string | null,
      requiredDocuments: ["CRLV", "ANTT", "CRONOTACÓGRAFO", "CIV", "CIPP", "OPP"],
      legalValidityMap: DEFAULT_LEGAL_VALIDITY_MAP,
      exportFormat: 'PDF Gerencial',
      includeCharts: true,
      digitalSignature: false,
      twoFactor: false,
      auditLogs: true
    };
    
    if (saved) {
      try {
        return { ...defaultSettings, ...JSON.parse(saved) };
      } catch (e) {
        return defaultSettings;
      }
    }
    return defaultSettings;
  });

  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const isRemoteSettingsUpdateRef = useRef(false);
  const lastSavedSettingsRef = useRef<string>(JSON.stringify(settings));

  useEffect(() => {
    const settingsDocRef = doc(db, "settings", "global");
    const unsubscribeSnapshot = onSnapshot(settingsDocRef, (snapshot) => {
      if (snapshot.exists()) {
        const remoteData = snapshot.data();
        setSettings((prev: any) => {
          const prevStr = JSON.stringify(prev);
          const nextCombined = { ...prev, ...remoteData };
          const nextStr = JSON.stringify(nextCombined);
          if (prevStr !== nextStr) {
            isRemoteSettingsUpdateRef.current = true;
            lastSavedSettingsRef.current = nextStr;
            return nextCombined;
          }
          return prev;
        });
      }
      setSettingsLoaded(true);
    }, (error) => {
      setSettingsLoaded(true);
      handleFirestoreError(error, OperationType.GET, "settings/global");
    });

    return () => {
      unsubscribeSnapshot();
    };
  }, []);

  useEffect(() => {
    if (!settingsLoaded) return;

    localStorage.setItem('logifleet_settings', JSON.stringify(settings));

    if (isRemoteSettingsUpdateRef.current) {
      isRemoteSettingsUpdateRef.current = false;
      return;
    }

    const currentStr = JSON.stringify(settings);
    if (currentStr === lastSavedSettingsRef.current) {
      return;
    }

    const timeoutId = setTimeout(async () => {
      try {
        lastSavedSettingsRef.current = currentStr;
        const settingsDocRef = doc(db, "settings", "global");
        await setDoc(settingsDocRef, settings);
      } catch (e) {
        handleFirestoreError(e, OperationType.WRITE, "settings/global");
      }
    }, 2000);

    return () => clearTimeout(timeoutId);
  }, [settings, settingsLoaded]);

  // Helper to smartly reconcile and merge justifications between machines and cloud without losing data
  const mergeJustifications = useCallback((
    localList: LicenseJustification[],
    incomingList: LicenseJustification[]
  ): { merged: LicenseJustification[]; localHadExtra: boolean } => {
    const map = new Map<string, LicenseJustification>();
    let localHadExtra = false;

    // Incoming (remote/server) first
    incomingList.forEach(item => {
      if (!item.plate) return;
      const p = (item.plate || "").toUpperCase().trim();
      const d = normalizeDocKey(item.documentType);
      const s = (item.status || "").toUpperCase().trim();
      map.set(`${p}#${d}#${s}`, item);
    });

    // Local items merged
    localList.forEach(item => {
      if (!item.plate) return;
      const p = (item.plate || "").toUpperCase().trim();
      const d = normalizeDocKey(item.documentType);
      const s = (item.status || "").toUpperCase().trim();
      const key = `${p}#${d}#${s}`;

      const existing = map.get(key);
      if (!existing) {
        const hasContent = !!(item.reason?.trim() || item.authorizedBy?.trim() || item.actionForecast?.trim() || item.observations?.trim());
        if (hasContent) {
          map.set(key, item);
          localHadExtra = true;
        }
      } else {
        const localHasContent = !!(item.reason?.trim() || item.authorizedBy?.trim() || item.actionForecast?.trim() || item.observations?.trim());
        const existingHasContent = !!(existing.reason?.trim() || existing.authorizedBy?.trim() || existing.actionForecast?.trim() || existing.observations?.trim());
        if (localHasContent && !existingHasContent) {
          map.set(key, item);
          localHadExtra = true;
        }
      }
    });

    return {
      merged: Array.from(map.values()),
      localHadExtra
    };
  }, []);

  // Cross-machine synchronization & persistence for License Justifications
  useEffect(() => {
    const syncServerJustifications = async () => {
      try {
        const res = await fetch("/api/justifications");
        if (res.ok) {
          const data = await res.json();
          const serverItems: LicenseJustification[] = Array.isArray(data?.items) ? data.items : [];
          
          let currentLocal: LicenseJustification[] = [];
          try {
            const raw = localStorage.getItem("uni_license_justifications");
            if (raw) currentLocal = JSON.parse(raw);
          } catch (_) {}

          const { merged, localHadExtra } = mergeJustifications(currentLocal, serverItems);
          if (merged.length > 0) {
            setJustifications(merged);
            try {
              localStorage.setItem("uni_license_justifications", JSON.stringify(merged));
            } catch (_) {}

            if (localHadExtra) {
              fetch("/api/justifications", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ items: merged })
              }).catch(() => {});
            }
          }
        }
      } catch (err) {
        console.warn("Failed to fetch /api/justifications:", err);
      } finally {
        setJustificationsLoaded(true);
      }
    };

    // Initial fetch
    syncServerJustifications();

    // Auto-sync across different machines every 12 seconds
    const intervalId = setInterval(syncServerJustifications, 12000);

    // Sync immediately when user focuses back on the tab/window
    const onWindowFocus = () => syncServerJustifications();
    window.addEventListener("focus", onWindowFocus);

    // Firestore real-time listener as primary cloud sync
    let unsubscribe = () => {};
    try {
      const justDocRef = doc(db, "license_justifications", "all");
      unsubscribe = onSnapshot(justDocRef, (snapshot) => {
        if (snapshot.exists()) {
          const remoteData = snapshot.data();
          const remoteItems = Array.isArray(remoteData?.items) ? remoteData.items : [];
          let currentLocal: LicenseJustification[] = [];
          try {
            const raw = localStorage.getItem("uni_license_justifications");
            if (raw) currentLocal = JSON.parse(raw);
          } catch (_) {}

          const { merged } = mergeJustifications(currentLocal, remoteItems);
          if (merged.length > 0) {
            setJustifications(merged);
            try {
              localStorage.setItem("uni_license_justifications", JSON.stringify(merged));
            } catch (_) {}
          }
        }
        setJustificationsLoaded(true);
      }, (error) => {
        setJustificationsLoaded(true);
        console.warn("Firestore notice for license_justifications:", error?.message || error);
      });
    } catch (_) {
      setJustificationsLoaded(true);
    }

    return () => {
      clearInterval(intervalId);
      window.removeEventListener("focus", onWindowFocus);
      unsubscribe();
    };
  }, [mergeJustifications]);

  const handleSaveJustification = async (just: LicenseJustification) => {
    // Isolate strictly by plate + normalized documentType + status: only replace the exact same license item
    const targetNormDoc = normalizeDocKey(just.documentType);
    const targetPlate = (just.plate || "").toUpperCase().trim();
    const targetStatus = (just.status || "").toUpperCase().trim();

    const nextJustifications = [
      ...justifications.filter(j => {
        if (j.id === just.id) return false;
        const samePlate = (j.plate || "").toUpperCase().trim() === targetPlate;
        const sameDoc = normalizeDocKey(j.documentType) === targetNormDoc;
        const sameStatus = (j.status || "").toUpperCase().trim() === targetStatus;
        if (samePlate && sameDoc && sameStatus) return false;
        return true;
      }),
      just
    ];

    setJustifications(nextJustifications);

    // Gravar no histórico de ações do veículo
    const histItem: JustificationHistoryItem = {
      id: `hist-lic-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      justificationId: just.id,
      plate: just.plate,
      fleet: just.fleet,
      operation: just.operation,
      documentType: just.documentType,
      status: just.status,
      reason: just.reason,
      authorizedBy: just.authorizedBy,
      actionForecast: just.actionForecast,
      observations: just.observations,
      updatedAt: just.updatedAt || format(new Date(), "dd/MM/yyyy HH:mm"),
      updatedBy: just.updatedBy || "Sistema",
      actionType: "ATUALIZADA"
    };
    const nextHist = [histItem, ...licenseHistory];
    setLicenseHistory(nextHist);

    // 1. Immediate local persistence
    try {
      localStorage.setItem("uni_license_justifications", JSON.stringify(nextJustifications));
      saveLicenseHistoryToStorage(nextHist);
      updateLastSavedTime();
    } catch (e) {
      console.warn("Erro ao salvar localmente:", e);
    }

    // 2. Server persistence across machines
    try {
      fetch("/api/justifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: nextJustifications })
      }).catch(() => {});
      fetch("/api/justifications/history", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: nextHist })
      }).catch(() => {});
    } catch (err) {
      console.warn("Backup to /api/justifications failed:", err);
    }

    // 3. Firestore cloud sync
    try {
      const justDocRef = doc(db, "license_justifications", "all");
      setDoc(justDocRef, {
        items: nextJustifications,
        updatedAt: new Date().toISOString()
      }).catch(e => console.warn("Firestore license sync notice:", e));

      const histDocRef = doc(db, "license_justifications_history", "all");
      setDoc(histDocRef, {
        items: nextHist,
        updatedAt: new Date().toISOString()
      }).catch(e => console.warn("Firestore license hist notice:", e));
    } catch (_) {}
  };

  const handleDeleteJustification = async (id: string) => {
    const targetJust = justifications.find(j => j.id === id);
    const nextJustifications = justifications.filter(j => j.id !== id);
    setJustifications(nextJustifications);

    let nextHist = licenseHistory;
    if (targetJust) {
      const histItem: JustificationHistoryItem = {
        id: `hist-lic-del-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        justificationId: targetJust.id,
        plate: targetJust.plate,
        fleet: targetJust.fleet,
        operation: targetJust.operation,
        documentType: targetJust.documentType,
        status: targetJust.status,
        reason: targetJust.reason,
        authorizedBy: targetJust.authorizedBy,
        actionForecast: targetJust.actionForecast,
        observations: "Justificativa excluída / liberada do sistema",
        updatedAt: format(new Date(), "dd/MM/yyyy HH:mm"),
        updatedBy: "Sistema",
        actionType: "EXCLUIDA"
      };
      nextHist = [histItem, ...licenseHistory];
      setLicenseHistory(nextHist);
    }

    try {
      localStorage.setItem("uni_license_justifications", JSON.stringify(nextJustifications));
      saveLicenseHistoryToStorage(nextHist);
      updateLastSavedTime();
    } catch (_) {}

    try {
      fetch("/api/justifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: nextJustifications })
      }).catch(() => {});
      fetch("/api/justifications/history", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: nextHist })
      }).catch(() => {});
    } catch (err) {
      console.warn("Delete in /api/justifications failed:", err);
    }

    try {
      const justDocRef = doc(db, "license_justifications", "all");
      setDoc(justDocRef, {
        items: nextJustifications,
        updatedAt: new Date().toISOString()
      }).catch(e => console.warn("Firestore delete notice:", e));

      const histDocRef = doc(db, "license_justifications_history", "all");
      setDoc(histDocRef, {
        items: nextHist,
        updatedAt: new Date().toISOString()
      }).catch(() => {});
    } catch (_) {}
  };

  const handleAddLicenseHistoryItem = async (item: JustificationHistoryItem) => {
    const nextHist = [item, ...licenseHistory.filter(h => h.id !== item.id)];
    setLicenseHistory(nextHist);
    try {
      saveLicenseHistoryToStorage(nextHist);
      await fetch("/api/justifications/history", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: nextHist })
      });
      const histDocRef = doc(db, "license_justifications_history", "all");
      await setDoc(histDocRef, { items: nextHist, updatedAt: new Date().toISOString() });
    } catch (err) {
      console.warn("Error saving license history item:", err);
    }
  };

  const handleBatchRestoreLicenseJustifications = async (restoredItems: LicenseJustification[], overwrite: boolean = false) => {
    if (!restoredItems || !Array.isArray(restoredItems) || restoredItems.length === 0) return;

    // Sanitize and validate every restored license justification item
    const safeRestored: LicenseJustification[] = restoredItems
      .filter(j => j && typeof j === 'object')
      .map(j => ({
        id: String(j.id || `just-lic-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`),
        plate: String(j.plate || "").toUpperCase().trim(),
        fleet: String(j.fleet || "-").trim(),
        operation: String(j.operation || "-").trim(),
        documentType: String(j.documentType || "Geral").trim(),
        status: String(j.status || "ATENCAO").toUpperCase().trim(),
        reason: String(j.reason || "-").trim(),
        authorizedBy: String(j.authorizedBy || "-").trim(),
        actionForecast: String(j.actionForecast || "-").trim(),
        observations: String(j.observations || "").trim(),
        updatedAt: String(j.updatedAt || format(new Date(), "dd/MM/yyyy HH:mm")).trim()
      }))
      .filter(j => j.plate.length > 0);

    if (safeRestored.length === 0) return;

    let nextJustifications: LicenseJustification[];
    if (overwrite) {
      nextJustifications = [...safeRestored];
    } else {
      const map = new Map<string, LicenseJustification>();
      (justifications || []).forEach(j => {
        if (!j || !j.plate) return;
        const normDoc = normalizeDocKey(j.documentType);
        const key = `${(j.plate || "").toUpperCase().trim()}#${normDoc}#${(j.status || "").toUpperCase().trim()}`;
        map.set(key, j);
      });
      safeRestored.forEach(j => {
        if (!j || !j.plate) return;
        const normDoc = normalizeDocKey(j.documentType);
        const key = `${(j.plate || "").toUpperCase().trim()}#${normDoc}#${(j.status || "").toUpperCase().trim()}`;
        map.set(key, j);
      });
      nextJustifications = Array.from(map.values());
    }

    setJustifications(nextJustifications);

    const currentHist = Array.isArray(licenseHistory) ? licenseHistory : [];
    const newHistItems: JustificationHistoryItem[] = safeRestored.map(j => ({
      id: `hist-lic-restore-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
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
      updatedAt: j.updatedAt || format(new Date(), "dd/MM/yyyy HH:mm"),
      updatedBy: "Restauração de Backup",
      actionType: "CRIADA"
    }));
    const nextHist = [...newHistItems, ...currentHist];
    setLicenseHistory(nextHist);

    try {
      localStorage.setItem("uni_license_justifications", JSON.stringify(nextJustifications));
      saveLicenseHistoryToStorage(nextHist);
      updateLastSavedTime();
    } catch (_) {}

    try {
      await fetch("/api/justifications/restore", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: nextJustifications, source: "excel_restore" })
      });
      await fetch("/api/justifications/history", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: nextHist })
      });
    } catch (err) {
      console.warn("Failed to save restored license items to server:", err);
    }

    try {
      const justDocRef = doc(db, "license_justifications", "all");
      await setDoc(justDocRef, {
        items: nextJustifications,
        updatedAt: new Date().toISOString()
      });
      const histDocRef = doc(db, "license_justifications_history", "all");
      await setDoc(histDocRef, {
        items: nextHist,
        updatedAt: new Date().toISOString()
      });
    } catch (e) {
      console.warn("Firestore license restore sync error:", e);
    }
  };

  // Cross-machine synchronization & persistence for Document Justifications
  useEffect(() => {
    const syncServerDocJustifications = async () => {
      try {
        const res = await fetch("/api/doc-justifications");
        if (res.ok) {
          const data = await res.json();
          const serverItems: LicenseJustification[] = Array.isArray(data?.items) ? data.items : [];

          let currentLocal: LicenseJustification[] = [];
          try {
            const raw = localStorage.getItem("uni_doc_justifications");
            if (raw) currentLocal = JSON.parse(raw);
          } catch (_) {}

          const { merged, localHadExtra } = mergeJustifications(currentLocal, serverItems);
          if (merged.length > 0) {
            setDocJustifications(merged);
            try {
              localStorage.setItem("uni_doc_justifications", JSON.stringify(merged));
            } catch (_) {}

            if (localHadExtra) {
              fetch("/api/doc-justifications", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ items: merged })
              }).catch(() => {});
            }
          }
        }
      } catch (err) {
        console.warn("Failed to fetch /api/doc-justifications:", err);
      } finally {
        setDocJustificationsLoaded(true);
      }
    };

    // Initial fetch
    syncServerDocJustifications();

    // Auto-sync across different machines every 12 seconds
    const intervalId = setInterval(syncServerDocJustifications, 12000);

    // Sync immediately when window gains focus
    const onWindowFocus = () => syncServerDocJustifications();
    window.addEventListener("focus", onWindowFocus);

    // Firestore real-time listener as primary cloud sync
    let unsubscribe = () => {};
    try {
      const docRef = doc(db, "doc_justifications", "all");
      unsubscribe = onSnapshot(docRef, (snapshot) => {
        if (snapshot.exists()) {
          const remoteData = snapshot.data();
          const remoteItems = Array.isArray(remoteData?.items) ? remoteData.items : [];
          let currentLocal: LicenseJustification[] = [];
          try {
            const raw = localStorage.getItem("uni_doc_justifications");
            if (raw) currentLocal = JSON.parse(raw);
          } catch (_) {}

          const { merged } = mergeJustifications(currentLocal, remoteItems);
          if (merged.length > 0) {
            setDocJustifications(merged);
            try {
              localStorage.setItem("uni_doc_justifications", JSON.stringify(merged));
            } catch (_) {}
          }
        }
        setDocJustificationsLoaded(true);
      }, (error) => {
        setDocJustificationsLoaded(true);
        console.warn("Firestore notice for doc_justifications:", error?.message || error);
      });
    } catch (_) {
      setDocJustificationsLoaded(true);
    }

    return () => {
      clearInterval(intervalId);
      window.removeEventListener("focus", onWindowFocus);
      unsubscribe();
    };
  }, [mergeJustifications]);

  const handleSaveDocJustification = async (just: LicenseJustification) => {
    // Isolate by plate + documentType + status: only replace the exact same item
    const nextJustifications = [
      ...docJustifications.filter(j => {
        if (j.id === just.id) return false;
        const samePlate = (j.plate || "").toUpperCase().trim() === (just.plate || "").toUpperCase().trim();
        const sameDoc = (j.documentType || "").toUpperCase().trim() === (just.documentType || "").toUpperCase().trim();
        const sameStatus = (j.status || "").toUpperCase().trim() === (just.status || "").toUpperCase().trim();
        if (samePlate && sameDoc && sameStatus) return false;
        return true;
      }),
      just
    ];

    setDocJustifications(nextJustifications);

    // Gravar no histórico de ações do veículo
    const histItem: JustificationHistoryItem = {
      id: `hist-doc-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      justificationId: just.id,
      plate: just.plate,
      fleet: just.fleet,
      operation: just.operation,
      documentType: just.documentType,
      status: just.status,
      reason: just.reason,
      authorizedBy: just.authorizedBy,
      actionForecast: just.actionForecast,
      observations: just.observations,
      updatedAt: just.updatedAt || format(new Date(), "dd/MM/yyyy HH:mm"),
      updatedBy: just.updatedBy || "Sistema",
      actionType: "ATUALIZADA"
    };
    const nextHist = [histItem, ...docHistory];
    setDocHistory(nextHist);

    // 1. Local storage
    try {
      localStorage.setItem("uni_doc_justifications", JSON.stringify(nextJustifications));
      saveDocHistoryToStorage(nextHist);
      updateLastSavedTime();
    } catch (e) {
      console.warn("Erro ao salvar localmente:", e);
    }

    // 2. Server persistence across machines
    try {
      fetch("/api/doc-justifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: nextJustifications })
      }).catch(() => {});
      fetch("/api/doc-justifications/history", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: nextHist })
      }).catch(() => {});
    } catch (err) {
      console.warn("Backup to /api/doc-justifications failed:", err);
    }

    // 3. Firestore cloud sync
    try {
      const docRef = doc(db, "doc_justifications", "all");
      setDoc(docRef, {
        items: nextJustifications,
        updatedAt: new Date().toISOString()
      }).catch(e => console.warn("Firestore doc sync notice:", e));

      const histDocRef = doc(db, "doc_justifications_history", "all");
      setDoc(histDocRef, {
        items: nextHist,
        updatedAt: new Date().toISOString()
      }).catch(e => console.warn("Firestore doc hist notice:", e));
    } catch (_) {}
  };

  const handleDeleteDocJustification = async (id: string) => {
    const targetJust = docJustifications.find(j => j.id === id);
    const nextJustifications = docJustifications.filter(j => j.id !== id);
    setDocJustifications(nextJustifications);

    let nextHist = docHistory;
    if (targetJust) {
      const histItem: JustificationHistoryItem = {
        id: `hist-doc-del-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        justificationId: targetJust.id,
        plate: targetJust.plate,
        fleet: targetJust.fleet,
        operation: targetJust.operation,
        documentType: targetJust.documentType,
        status: targetJust.status,
        reason: targetJust.reason,
        authorizedBy: targetJust.authorizedBy,
        actionForecast: targetJust.actionForecast,
        observations: "Justificativa excluída / liberada do sistema",
        updatedAt: format(new Date(), "dd/MM/yyyy HH:mm"),
        updatedBy: "Sistema",
        actionType: "EXCLUIDA"
      };
      nextHist = [histItem, ...docHistory];
      setDocHistory(nextHist);
    }

    try {
      localStorage.setItem("uni_doc_justifications", JSON.stringify(nextJustifications));
      saveDocHistoryToStorage(nextHist);
      updateLastSavedTime();
    } catch (_) {}

    try {
      fetch("/api/doc-justifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: nextJustifications })
      }).catch(() => {});
      fetch("/api/doc-justifications/history", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: nextHist })
      }).catch(() => {});
    } catch (err) {
      console.warn("Delete in /api/doc-justifications failed:", err);
    }

    try {
      const docRef = doc(db, "doc_justifications", "all");
      setDoc(docRef, {
        items: nextJustifications,
        updatedAt: new Date().toISOString()
      }).catch(e => console.warn("Firestore delete doc notice:", e));

      const histDocRef = doc(db, "doc_justifications_history", "all");
      setDoc(histDocRef, {
        items: nextHist,
        updatedAt: new Date().toISOString()
      }).catch(() => {});
    } catch (_) {}
  };

  const handleBatchRestoreDocJustifications = async (restoredItems: LicenseJustification[], overwrite: boolean = false) => {
    if (!restoredItems || !Array.isArray(restoredItems) || restoredItems.length === 0) return;

    // Sanitize and validate every restored doc justification item
    const safeRestored: LicenseJustification[] = restoredItems
      .filter(j => j && typeof j === 'object')
      .map(j => ({
        id: String(j.id || `just-doc-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`),
        plate: String(j.plate || "").toUpperCase().trim(),
        fleet: String(j.fleet || "-").trim(),
        operation: String(j.operation || "-").trim(),
        documentType: String(j.documentType || "Documentação Geral").trim(),
        status: String(j.status || "ATENCAO").toUpperCase().trim(),
        reason: String(j.reason || "-").trim(),
        authorizedBy: String(j.authorizedBy || "-").trim(),
        actionForecast: String(j.actionForecast || "-").trim(),
        observations: String(j.observations || "").trim(),
        updatedAt: String(j.updatedAt || format(new Date(), "dd/MM/yyyy HH:mm")).trim()
      }))
      .filter(j => j.plate.length > 0);

    if (safeRestored.length === 0) return;

    let nextJustifications: LicenseJustification[];
    if (overwrite) {
      nextJustifications = [...safeRestored];
    } else {
      // Merge by plate + documentType + status
      const map = new Map<string, LicenseJustification>();
      (docJustifications || []).forEach(j => {
        if (!j || !j.plate) return;
        const key = `${(j.plate || "").toUpperCase().trim()}#${(j.documentType || "").toUpperCase().trim()}#${(j.status || "").toUpperCase().trim()}`;
        map.set(key, j);
      });
      safeRestored.forEach(j => {
        if (!j || !j.plate) return;
        const key = `${(j.plate || "").toUpperCase().trim()}#${(j.documentType || "").toUpperCase().trim()}#${(j.status || "").toUpperCase().trim()}`;
        map.set(key, j);
      });
      nextJustifications = Array.from(map.values());
    }

    setDocJustifications(nextJustifications);

    // Create history items for restored items safely
    const currentHist = Array.isArray(docHistory) ? docHistory : [];
    const newHistItems: JustificationHistoryItem[] = safeRestored.map(j => ({
      id: `hist-doc-restore-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
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
      updatedAt: j.updatedAt || format(new Date(), "dd/MM/yyyy HH:mm"),
      updatedBy: "Restauração de Backup",
      actionType: "CRIADA"
    }));
    const nextHist = [...newHistItems, ...currentHist];
    setDocHistory(nextHist);

    // 1. LocalStorage
    try {
      localStorage.setItem("uni_doc_justifications", JSON.stringify(nextJustifications));
      saveDocHistoryToStorage(nextHist);
      updateLastSavedTime();
    } catch (_) {}

    // 2. Server persistence across stations
    try {
      await fetch("/api/doc-justifications/restore", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: nextJustifications, source: "excel_restore" })
      });
      await fetch("/api/doc-justifications/history", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: nextHist })
      });
    } catch (err) {
      console.warn("Failed to save restored items to server:", err);
    }

    // 3. Firestore cloud sync
    try {
      const docRef = doc(db, "doc_justifications", "all");
      await setDoc(docRef, {
        items: nextJustifications,
        updatedAt: new Date().toISOString()
      });
      const histDocRef = doc(db, "doc_justifications_history", "all");
      await setDoc(histDocRef, {
        items: nextHist,
        updatedAt: new Date().toISOString()
      });
    } catch (_) {}
  };

  const handleAddDocHistoryItem = async (item: JustificationHistoryItem) => {
    const nextHist = [item, ...docHistory.filter(h => h.id !== item.id)];
    setDocHistory(nextHist);
    try {
      saveDocHistoryToStorage(nextHist);
      await fetch("/api/doc-justifications/history", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: nextHist })
      });
      const histDocRef = doc(db, "doc_justifications_history", "all");
      await setDoc(histDocRef, { items: nextHist, updatedAt: new Date().toISOString() });
    } catch (err) {
      console.warn("Error saving doc history item:", err);
    }
  };

  const handleManualSaveAll = async () => {
    if (savingManual) return;
    setSavingManual(true);
    const now = new Date();

    try {
      // 1. Armazenamento local imediato de todas as justificativas e históricos com compressão
      try {
        localStorage.setItem("uni_license_justifications", JSON.stringify(justifications));
        localStorage.setItem("uni_doc_justifications", JSON.stringify(docJustifications));
        saveLicenseHistoryToStorage(licenseHistory);
        saveDocHistoryToStorage(docHistory);
        localStorage.setItem("app_settings_v2", JSON.stringify(settings));
        localStorage.setItem("logifleet_last_save_time", now.toISOString());
      } catch (e) {
        console.warn("Aviso ao salvar no localStorage:", e);
      }

      // 2. Persistência nos endpoints de API do servidor e criação de ponto de snapshot
      const requests: Promise<any>[] = [
        fetch("/api/justifications", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ items: justifications })
        }).catch(() => {}),

        fetch("/api/doc-justifications", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ items: docJustifications })
        }).catch(() => {}),

        fetch("/api/justifications/history", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ items: licenseHistory })
        }).catch(() => {}),

        fetch("/api/doc-justifications/history", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ items: docHistory })
        }).catch(() => {}),

        fetch("/api/doc-justifications/backup-snapshot", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ items: docJustifications, reason: "manual_header_save" })
        }).catch(() => {}),

        fetch("/api/settings", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(settings)
        }).catch(() => {})
      ];

      // 3. Sincronização em nuvem via Firestore
      try {
        const licDocRef = doc(db, "license_justifications", "all");
        requests.push(setDoc(licDocRef, { items: justifications, updatedAt: now.toISOString() }).catch(() => {}));

        const docDocRef = doc(db, "doc_justifications", "all");
        requests.push(setDoc(docDocRef, { items: docJustifications, updatedAt: now.toISOString() }).catch(() => {}));

        const licHistDocRef = doc(db, "license_justifications_history", "all");
        requests.push(setDoc(licHistDocRef, { items: licenseHistory, updatedAt: now.toISOString() }).catch(() => {}));

        const docHistDocRef = doc(db, "doc_justifications_history", "all");
        requests.push(setDoc(docHistDocRef, { items: docHistory, updatedAt: now.toISOString() }).catch(() => {}));
      } catch (fErr) {
        console.warn("Aviso Firestore ao salvar manualmente:", fErr);
      }

      await Promise.all(requests);

      updateLastSavedTime(now);
      setSaveSuccessNotice(true);
      setTimeout(() => {
        setSaveSuccessNotice(false);
      }, 3000);
    } catch (err) {
      console.error("Falha no salvamento manual:", err);
    } finally {
      setSavingManual(false);
    }
  };

  // Limpeza automática de justificativas manuais quando o documento for regularizado ou pago na base
  const cleanRegularizedJustifications = useCallback((baseFleetList: Vehicle[]) => {
    if (!Array.isArray(baseFleetList) || baseFleetList.length === 0) return;

    const isDocRegularOrPaid = (docItem?: VehicleDocument | null): boolean => {
      if (!docItem) return false;
      const st = (docItem.status || "").toLowerCase().trim();
      if (st === "ok" || st === "pagos" || st === "regular" || st === "pago") return true;
      if (typeof docItem.daysRemaining === "number" && docItem.daysRemaining > 30) return true;
      return false;
    };

    // 1. Justificativas de Licenças
    const licVehicles = baseFleetList.filter(v => v && (v.source === "LICENCAS" || !v.source));
    const licMap = new Map<string, Vehicle>();
    licVehicles.forEach(v => {
      if (v && v.plate) licMap.set((v.plate || "").toUpperCase().trim(), v);
    });

    const licIdsToRemove = new Set<string>();
    const removedLicDetails: { plate: string; docType: string }[] = [];

    (justificationsRef.current || []).forEach(j => {
      if (!j || !j.plate) return;
      const p = (j.plate || "").toUpperCase().trim();
      const veh = licMap.get(p);
      if (!veh || !Array.isArray(veh.documents)) return;

      const normTargetDoc = normalizeDocKey(j.documentType);
      const matchedDoc = veh.documents.find(d => {
        if (!d) return false;
        return normalizeDocKey(d.type) === normTargetDoc;
      });

      // Se a data foi alterada e o documento agora está regular ou pago na base:
      if (matchedDoc && isDocRegularOrPaid(matchedDoc)) {
        licIdsToRemove.add(j.id);
        removedLicDetails.push({ plate: j.plate, docType: j.documentType });
      }
    });

    // 2. Justificativas de Documentação
    const docVehicles = baseFleetList.filter(v => v && (v.source === "DOCUMENTACAO" || !v.source));
    const docMap = new Map<string, Vehicle>();
    docVehicles.forEach(v => {
      if (v && v.plate) docMap.set((v.plate || "").toUpperCase().trim(), v);
    });

    const docIdsToRemove = new Set<string>();
    const removedDocDetails: { plate: string; docType: string }[] = [];

    (docJustificationsRef.current || []).forEach(j => {
      if (!j || !j.plate) return;
      const p = (j.plate || "").toUpperCase().trim();
      const veh = docMap.get(p);
      if (!veh || !Array.isArray(veh.documents)) return;

      const normTargetDoc = normalizeDocKey(j.documentType);
      const matchedDoc = veh.documents.find(d => {
        if (!d) return false;
        return normalizeDocKey(d.type) === normTargetDoc;
      });

      // Se a data foi alterada e o documento agora está regular ou pago na base:
      if (matchedDoc && isDocRegularOrPaid(matchedDoc)) {
        docIdsToRemove.add(j.id);
        removedDocDetails.push({ plate: j.plate, docType: j.documentType });
      }
    });

    // Executa exclusão das justificativas manuais de Licenças regularizadas
    if (licIdsToRemove.size > 0) {
      console.log(`[Auto-Clean] Baixa automática: removendo ${licIdsToRemove.size} justificativas manuais de Licenças regularizadas/pagas.`, removedLicDetails);
      const nextLicJustifications = (justificationsRef.current || []).filter(j => !licIdsToRemove.has(j.id));
      setJustifications(nextLicJustifications);

      const historyEntries: JustificationHistoryItem[] = removedLicDetails.map(item => ({
        id: `hist-lic-autoclean-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        plate: item.plate,
        fleet: "-",
        operation: "-",
        documentType: item.docType,
        status: "REGULAR",
        reason: "Baixa automática: Documento regularizado / pago com data alterada na base",
        authorizedBy: "Sistema",
        actionForecast: "Concluído / Regular",
        observations: "Exclusão automática de justificativa manual após atualização da base",
        updatedAt: format(new Date(), "dd/MM/yyyy HH:mm"),
        updatedBy: "Sistema (Auto)",
        actionType: "EXCLUIDA"
      }));
      const nextLicHist = [...historyEntries, ...(licenseHistoryRef.current || [])];
      setLicenseHistory(nextLicHist);

      try {
        localStorage.setItem("uni_license_justifications", JSON.stringify(nextLicJustifications));
        saveLicenseHistoryToStorage(nextLicHist);
      } catch (_) {}

      fetch("/api/justifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: nextLicJustifications })
      }).catch(() => {});

      fetch("/api/justifications/history", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: nextLicHist })
      }).catch(() => {});

      try {
        const licDocRef = doc(db, "license_justifications", "all");
        setDoc(licDocRef, { items: nextLicJustifications, updatedAt: new Date().toISOString() }).catch(() => {});
        const licHistDocRef = doc(db, "license_justifications_history", "all");
        setDoc(licHistDocRef, { items: nextLicHist, updatedAt: new Date().toISOString() }).catch(() => {});
      } catch (_) {}

      updateLastSavedTime();
    }

    // Executa exclusão das justificativas manuais de Documentação regularizadas
    if (docIdsToRemove.size > 0) {
      console.log(`[Auto-Clean] Baixa automática: removendo ${docIdsToRemove.size} justificativas manuais de Documentação regularizadas/pagas.`, removedDocDetails);
      const nextDocJustifications = (docJustificationsRef.current || []).filter(j => !docIdsToRemove.has(j.id));
      setDocJustifications(nextDocJustifications);

      const historyEntries: JustificationHistoryItem[] = removedDocDetails.map(item => ({
        id: `hist-doc-autoclean-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        plate: item.plate,
        fleet: "-",
        operation: "-",
        documentType: item.docType,
        status: "REGULAR",
        reason: "Baixa automática: Documento regularizado / pago com data alterada na base",
        authorizedBy: "Sistema",
        actionForecast: "Concluído / Regular",
        observations: "Exclusão automática de justificativa manual após atualização da base",
        updatedAt: format(new Date(), "dd/MM/yyyy HH:mm"),
        updatedBy: "Sistema (Auto)",
        actionType: "EXCLUIDA"
      }));
      const nextDocHist = [...historyEntries, ...(docHistoryRef.current || [])];
      setDocHistory(nextDocHist);

      try {
        localStorage.setItem("uni_doc_justifications", JSON.stringify(nextDocJustifications));
        saveDocHistoryToStorage(nextDocHist);
      } catch (_) {}

      fetch("/api/doc-justifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: nextDocJustifications })
      }).catch(() => {});

      fetch("/api/doc-justifications/history", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: nextDocHist })
      }).catch(() => {});

      try {
        const docDocRef = doc(db, "doc_justifications", "all");
        setDoc(docDocRef, { items: nextDocJustifications, updatedAt: new Date().toISOString() }).catch(() => {});
        const docHistDocRef = doc(db, "doc_justifications_history", "all");
        setDoc(docHistDocRef, { items: nextDocHist, updatedAt: new Date().toISOString() }).catch(() => {});
      } catch (_) {}

      updateLastSavedTime();
    }
  }, [updateLastSavedTime]);

  // Sincronização em segundo plano dos históricos de ações
  useEffect(() => {
    const syncHistories = async () => {
      try {
        const [resLic, resDoc] = await Promise.all([
          fetch("/api/justifications/history"),
          fetch("/api/doc-justifications/history")
        ]);
        if (resLic.ok) {
          const dataLic = await resLic.json();
          if (dataLic && Array.isArray(dataLic.items) && dataLic.items.length > 0) {
            setLicenseHistory(dataLic.items);
            try {
              saveLicenseHistoryToStorage(dataLic.items);
            } catch (_) {}
          }
        }
        if (resDoc.ok) {
          const dataDoc = await resDoc.json();
          if (dataDoc && Array.isArray(dataDoc.items) && dataDoc.items.length > 0) {
            setDocHistory(dataDoc.items);
            try {
              saveDocHistoryToStorage(dataDoc.items);
            } catch (_) {}
          }
        }
      } catch (err) {
        console.warn("Failed to sync history from API:", err);
      }
    };

    syncHistories();
    const interval = setInterval(syncHistories, 25000);
    return () => clearInterval(interval);
  }, []);

  // Auto-seed history from existing justifications when history is empty
  useEffect(() => {
    if (justificationsLoaded && justifications.length > 0 && licenseHistory.length === 0) {
      const seeded: JustificationHistoryItem[] = justifications.map(j => ({
        id: `hist-lic-${j.id || Math.random().toString(36).substring(2, 8)}`,
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
        updatedAt: j.updatedAt || format(new Date(), "dd/MM/yyyy HH:mm"),
        updatedBy: j.updatedBy || "Gestão da Frota",
        actionType: "JUSTIFICATIVA ATIVA"
      }));
      setLicenseHistory(seeded);
      try {
        saveLicenseHistoryToStorage(seeded);
        fetch("/api/justifications/history", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ items: seeded })
        }).catch(() => {});
      } catch (_) {}
    }
  }, [justificationsLoaded, justifications, licenseHistory.length]);

  useEffect(() => {
    if (docJustificationsLoaded && docJustifications.length > 0 && docHistory.length === 0) {
      const seeded: JustificationHistoryItem[] = docJustifications.map(j => ({
        id: `hist-doc-${j.id || Math.random().toString(36).substring(2, 8)}`,
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
        updatedAt: j.updatedAt || format(new Date(), "dd/MM/yyyy HH:mm"),
        updatedBy: j.updatedBy || "Gestão da Frota",
        actionType: "JUSTIFICATIVA ATIVA"
      }));
      setDocHistory(seeded);
      try {
        saveDocHistoryToStorage(seeded);
        fetch("/api/doc-justifications/history", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ items: seeded })
        }).catch(() => {});
      } catch (_) {}
    }
  }, [docJustificationsLoaded, docJustifications, docHistory.length]);

  const UNI_LOGO = "https://raw.githubusercontent.com/Buenotec/Logo_UNI/refs/heads/main/logo_uni.png"; 

  const getValClient = (row: any, keys: string[]) => {
    const rowKeys = Object.keys(row);
    const normalizedSearchKeys = keys.map(k => k.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim());
    
    for (const search of normalizedSearchKeys) {
      for (const actualKey of rowKeys) {
        const normalizedActual = actualKey.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
        if (normalizedActual === search) {
          const val = row[actualKey];
          if (val !== undefined && val !== null && val.toString().trim() !== "") return val.toString().trim();
        }
      }
    }
    
    for (const search of normalizedSearchKeys) {
      if (search.length < 4) continue;
      for (const actualKey of rowKeys) {
        const normalizedActual = actualKey.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
        if (normalizedActual.includes(search)) {
          const val = row[actualKey];
          if (val !== undefined && val !== null && val.toString().trim() !== "") return val.toString().trim();
        }
      }
    }
    return "";
  };

  const fetchAndNormalizeClient = async (name: string, url: string) => {
    let response: Response | null = null;
    let success = false;
    let lastError: any = null;

    try {
      response = await fetch(url);
      if (response.ok) {
        success = true;
      } else {
        lastError = new Error(`Direct fetch returned status ${response.status}`);
      }
    } catch (err: any) {
      console.warn(`Direct fetch for ${name} failed (most likely CORS on client-only environment):`, err);
      lastError = err;
    }

    if (!success) {
      try {
        console.log(`Attempting corsproxy.io proxy for ${name}`);
        const proxyUrl = `https://corsproxy.io/?${encodeURIComponent(url)}`;
        response = await fetch(proxyUrl);
        if (response.ok) {
          success = true;
        } else {
          lastError = new Error(`corsproxy.io returned status ${response.status}`);
        }
      } catch (err: any) {
        console.warn(`corsproxy.io for ${name} failed:`, err);
        lastError = err;
      }
    }

    if (!success) {
      try {
        console.log(`Attempting api.allorigins.win proxy for ${name}`);
        const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`;
        response = await fetch(proxyUrl);
        if (response.ok) {
          success = true;
        } else {
          lastError = new Error(`allorigins returned status ${response.status}`);
        }
      } catch (err: any) {
        console.warn(`allorigins for ${name} failed:`, err);
        lastError = err;
      }
    }

    if (!success || !response) {
      throw lastError || new Error(`Failed to fetch ${name} through all channels`);
    }

    let csvText = await response.text();
    csvText = csvText.trim();
    if (csvText.includes("<!DOCTYPE html>") || csvText.includes("<html")) {
      throw new Error(`${name} returned HTML instead of CSV`);
    }

    const rawParsed = Papa.parse(csvText, { 
      skipEmptyLines: 'greedy',
      transform: (val) => val.trim()
    });
    const rows = rawParsed.data as string[][];
    if (rows.length < 1) return [];

    const targetHeaders = ["PLACA", "PREFIXO", "FROTA", "VEICULO", "MOTORISTA", "STATUS", "EQUIPAMENTO", "EMPRESA", "FILIAL", "VENCIMENTO"];
    let maxMatches = -1;
    let headerRowIndex = 0;

    rows.slice(0, 10).forEach((row, idx) => {
      const matches = row.filter(cell => 
        targetHeaders.some(target => cell.toUpperCase().includes(target))
      ).length;
      if (matches > maxMatches) {
        maxMatches = matches;
        headerRowIndex = idx;
      }
    });

    const validityRow = headerRowIndex > 0 ? rows[headerRowIndex - 1] : [];
    const dataRows = rows.slice(headerRowIndex + 1);

    const rawHeaders = rows[headerRowIndex].map(h => h.trim());
    const headerCounts: { [key: string]: number } = {};
    const headers = rawHeaders.map((h, i) => {
      if (!h) return "";
      const count = (headerCounts[h] || 0) + 1;
      headerCounts[h] = count;
      if (count > 1) {
        const sampleVal = dataRows.find(r => r[i] && r[i].trim() !== "")?.[i] || "";
        if (sampleVal.includes("R$") || sampleVal.includes("r$") || /^\d+([.,]\d+)?$/.test(sampleVal.trim())) {
          return `${h} (VALOR)`;
        }
        return `${h}_${count}`;
      }
      return h;
    });

    const parsedData = dataRows.filter(r => r.some(c => c !== "")).map(row => {
      const obj: any = {};
      headers.forEach((h, i) => {
        if (h) obj[h] = row[i] || "";
      });
      return obj;
    });

    const isPlateFormat = (s: string | undefined): boolean => {
      if (!s) return false;
      const cleaned = s.toString().toUpperCase().replace(/[^A-Z0-9]/g, "");
      const isMatch = (/^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/.test(cleaned) || /^[A-Z]{3}[0-9]{4}$/.test(cleaned));
      if (!isMatch) return false;
      if (cleaned === "IDO3839" || cleaned === "ENC0104") return false;
      return true;
    };

    const isFleetFormat = (s: string) => {
      const cleaned = s.toString().trim().replace(/^0+/, '');
      return /^\d{2,7}$/.test(cleaned) && cleaned.length >= 2;
    };

    const extractPlate = (s: string) => {
      if (!s) return "";
      const cleaned = s.toUpperCase().trim().replace(/[^A-Z0-9]/g, "");
      if (cleaned.length > 8) return "";
      const match = cleaned.match(/[A-Z]{3}[0-9][A-Z0-9][0-9]{2}/) || cleaned.match(/[A-Z]{3}[0-9]{4}/);
      if (match && match[0]) {
        const plateCandidate = match[0];
        if (plateCandidate === "IDO3839" || plateCandidate === "ENC0104") return "";
        return plateCandidate;
      }
      return "";
    };

    const countPlates = (s: string) => {
      if (!s) return 0;
      const cleaned = s.toUpperCase().trim().replace(/[^A-Z0-9/]/g, " ");
      const plates = new Set<string>();
      const m1 = cleaned.match(/[A-Z]{3}[0-9][A-Z0-9][0-9]{2}/g) || [];
      const m2 = cleaned.match(/[A-Z]{3}[0-9]{4}/g) || [];
      [...m1, ...m2].forEach(p => {
        if (p !== "IDO3839" && p !== "ENC0104") plates.add(p);
      });
      return plates.size;
    };

    const isLikelyPedido = (s: string) => {
      const cleaned = s.toString().trim().replace(/^0+/, "");
      return /^(38|32)\d{3,5}$/.test(cleaned);
    };

    const extractFleet = (s: string) => {
      if (!s) return "";
      let cleaned = s.toString().toUpperCase().trim();
      if (isPlateFormat(cleaned)) return "";
      if (cleaned.length < 2) return "";
      // Never extract fleet from date strings (e.g. 26/08/2026, 01/09/2026)
      if (/\d{1,2}[\/\.\-]\d{1,2}/.test(cleaned)) return "";
      cleaned = cleaned.replace(/\.$/, "");
      if (cleaned.includes("PEDIDO")) return "";
      const match = cleaned.match(/\d{2,7}/);
      const result = match ? match[0].replace(/^0+/, "") : "";
      if (!result || result.length < 2) return "";
      if (isLikelyPedido(result) && !s.toString().toUpperCase().includes("FROTA") && !s.toString().toUpperCase().includes("PREFIXO")) {
        return "";
      }
      const currentYear = new Date().getFullYear();
      const possibleYears = [currentYear - 2, currentYear - 1, currentYear, currentYear + 1, currentYear + 2].map(String);
      if (possibleYears.includes(result) && cleaned.length === 4) return "";
      return result;
    };

    const cleanObsForFleet = (s: string) => {
      return s
        .replace(/PEDIDO\s*\d+/gi, "")
        .replace(/\d{1,2}\/\d{1,2}\/\d{2,4}/g, "")
        .replace(/\d{1,2}\.\d{1,2}\.\d{2,4}/g, "")
        .replace(/\d{1,2}-\d{1,2}-\d{2,4}/g, "");
    };

    const plateKeys = ["Placa", "placa", "PLATE", "VEICULO", "EQUIPAMENTO", "IDENTIFICACAO", "PLACA/VEICULO", "PLACA CAVALO", "CAVALO"];
    const fleetKeys = ["Frota", "FROTA", "PREFIXO", "Nº FROTA", "NRO FROTA", "FROTA/PREFIXO", "PREFIXO/FROTA", "fleet", "CODIGO", "NUMERO"];

    return parsedData.map((row: any) => {
      let plate = "";
      let fleet = "";

      const rawPlateVal = getValClient(row, plateKeys).toString().trim();
      const rawFleetVal = getValClient(row, fleetKeys).toString().trim();
      const obsVal = getValClient(row, ["Observações", "OBSERVACOES", "OBS", "Observação", "Descrição", "DESCRICAO", "DESC"]).toString().toUpperCase();

      if (countPlates(obsVal) > 1) {
        plate = "";
        fleet = "";
      } else {
        plate = extractPlate(rawPlateVal);
        fleet = rawFleetVal.replace(/^0+/, "");
        if (isLikelyPedido(fleet)) {
          fleet = "";
        }
        
        if (name === "DOC_SISTEMA") {
          const cleanedObs = cleanObsForFleet(obsVal);
          const directFleet = row["Frota"] || row["FROTA"] || row["Nº FROTA"];
          if (directFleet) {
            const df = directFleet.toString().trim().replace(/^0+/, "");
            if (/^\d{2,7}$/.test(df) && !isLikelyPedido(df)) {
              fleet = df;
            }
          }

          if (cleanedObs) {
            const plateMatch = obsVal.match(/PLACA\s*[:\-]?\s*([A-Z]{3}\s*[-]?\s*[0-9][A-Z0-9][0-9]{2})/) || 
                               obsVal.match(/PLACA\s*[:\-]?\s*([A-Z]{3}\s*[-]?\s*[0-9]{4})/);
            if (plateMatch && (!plate || plate.length < 7)) plate = extractPlate(plateMatch[1]);

            const fleetMatch = cleanedObs.match(/(?:FROTA|PREF|PREFIXO)\s*[:\-]?\s*([A-Z0-9]{1,7})/);
            if (fleetMatch && (!fleet || fleet.length < 2)) {
              const candidate = fleetMatch[1].replace(/^0+/, "");
              if (!isPlateFormat(candidate)) fleet = candidate;
            }

            if (!plate || !fleet || fleet.length < 2) {
              const slashParts = cleanedObs.split('/').map(p => p.trim());
              if (slashParts.length >= 2) {
                const isInstallment = /^\d+$/.test(slashParts[0]) && /^\d+$/.test(slashParts[1]) && 
                                     parseInt(slashParts[0]) <= 100 && parseInt(slashParts[1]) <= 100;

                if (!isInstallment && (!fleet || fleet.length < 2)) {
                  const fleetPart1 = slashParts[0].split('-')[0];
                  if (fleetPart1 && /^\d+$/.test(fleetPart1)) {
                    const candidate = fleetPart1.replace(/^0+/, "");
                    if (candidate !== "2024" && candidate !== "2025" && candidate !== "2026" && !isLikelyPedido(candidate)) {
                      fleet = candidate;
                    }
                  }
                }
                if (!plate || plate.length < 7) {
                  const extractedPlate = extractPlate(slashParts[1]);
                  if (extractedPlate) plate = extractedPlate;
                }
                if ((!fleet || fleet.length < 2) && slashParts.length >= 3) {
                  const fleetPart3 = slashParts[2].replace(/^0+/, "");
                  if (fleetPart3 && !isPlateFormat(fleetPart3) && !isLikelyPedido(fleetPart3)) {
                    if (/^\d+$/.test(fleetPart3)) {
                      fleet = fleetPart3;
                    } else if (fleetPart3.length <= 5) {
                      fleet = fleetPart3;
                    }
                  }
                }
              }
            }
            if (!plate) plate = extractPlate(obsVal);
          }
        }

        if (!fleet) fleet = extractFleet(rawFleetVal);
        if (!plate && isPlateFormat(rawFleetVal)) plate = extractPlate(rawFleetVal);
        if (!fleet && isFleetFormat(rawPlateVal)) fleet = rawPlateVal.toUpperCase().replace(/[^0-9]/g, "").replace(/^0+/, "");

        if (!plate || !fleet) {
          for (const key of Object.keys(row)) {
            const uk = key.toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
            if (
              uk.includes("PEDIDO") || uk.includes("VALOR") || uk.includes("VLR") ||
              uk.includes("DATA") || uk.includes("DT") || uk.includes("VENC") ||
              uk.includes("EMISS") || uk.includes("PAG") || uk.includes("PGTO") ||
              uk.includes("BAIXA") || uk.includes("OBSERVACAO") || uk.includes("DESCRICAO") ||
              uk.includes("DESC") || uk.includes("RAZAO") || uk.includes("ID") ||
              uk.includes("NUMERO") || uk.includes("DOC") || uk.includes("PARCELA") ||
              uk.includes("FILIAL") || uk.includes("FORNEC") || uk.includes("STATUS") ||
              uk.includes("SITUACAO") || uk.includes("SIT") || uk.includes("EMPRESA")
            ) continue;

            const val = (row[key] || "").toString().trim();
            if (!val || val.length < 2) continue;
            if (/\d{1,2}[\/\.\-]\d{1,2}/.test(val)) continue;
            
            if (!plate) {
              const extracted = extractPlate(val);
              if (extracted === "IDO3839" || extracted === "ENC0104") continue;
              if (extracted) plate = extracted;
            }
            
            if (!fleet) {
              const extractedFleet = extractFleet(val);
              if (extractedFleet && extractedFleet !== plate) fleet = extractedFleet;
            }
          }
        }
      }

      if (plate === "IDO3839" || plate === "ENC0104") plate = "";
      if (fleet === "2024" || fleet === "2025" || fleet === "2026" || fleet === "S") fleet = "";

      // Extract Pedido from Obs, Documento or row
      const docVal = getValClient(row, ["Documento", "DOC", "Doc", "Nº Documento"]).toString().trim();
      const pedMatch = obsVal.match(/PEDIDO\s*[:\-#]?\s*([0-9]{4,8})/i) || docVal.match(/^([0-9]{4,8})$/);
      const rowPedido = pedMatch ? pedMatch[1] : (getValClient(row, ["Pedido", "PEDIDO"]).toString().trim() || (/^\d{4,8}$/.test(docVal) ? docVal : ""));
      if (rowPedido) {
        row["Pedido"] = rowPedido;
      }

      if (!plate && !fleet) {
        if (name.startsWith("DOC_SISTEMA") && rowPedido) {
          fleet = rowPedido;
          plate = `PED. ${rowPedido}`;
        } else {
          return null;
        }
      }

      const lastUpdate = getValClient(row, ["Data Atualização", "updated_at", "Last Update", "Data"]) || new Date().toISOString();
      let docs: any[] = [];

      if (name.startsWith("DOC_SISTEMA")) {
        const pagamento = getValClient(row, ["Pagamento", "PAGAMENTO", "Pag", "Data Pagamento", "DT PAGAMENTO", "Dt Pag", "Data Pgto", "Data Pag", "Pago em", "Baixa", "Data Baixa", "DT BAIXA", "Pagto", "PGTO", "Dt Pgto"]);
        const vencimento = getValClient(row, ["Vencimento", "VENCIMENTO", "Venc", "Prox Venc", "Data Vencimento", "DT VENCIMENTO", "Dt Venc"]);
        const rawDesc = getValClient(row, ["Descrição", "DESCRICAO", "Desc", "Documento", "_Tipo Documento"]) || "Documento";
        let descricao = String(rawDesc).trim();
        if (descricao.toUpperCase().includes("SERVIÇO DE MONITORAMENTO") || descricao.toUpperCase().includes("SERVICO DE MONITORAMENTO")) {
          descricao = descricao.replace(/SERVIÇO DE MONITORAMENTO/gi, "SERV. MONITORAMENTO")
                               .replace(/SERVICO DE MONITORAMENTO/gi, "SERV. MONITORAMENTO");
        }
        row["Descrição"] = descricao;
        
        const isPaidValue = (s: string) => {
          if (!s) return false;
          const val = s.toString().trim().toUpperCase();
          return !(val === "" || val === "-" || val.includes("DEFINIR") || val === "NÃO" || val === "NAO");
        };

        const statusColStr = getValClient(row, ["Status", "STATUS", "Situação", "SITUACAO", "Situacao Titulo", "Status Pagamento", "Situação do Pagamento"]).toString().toUpperCase();
        const isStatusPaid = statusColStr.includes("PAGO") || statusColStr.includes("BAIXADO") || statusColStr.includes("QUITADO");
        const hasPaidValue = isPaidValue(pagamento) || (getValClient(row, ["Valor Pago", "VALOR PAGO", "Pago", "Vlr Pago"]).toString().trim() !== "");

        const isActuallyPaid = hasPaidValue || isStatusPaid;
        const isDesp = isDespachanteType(descricao) || isDespachanteType(getValClient(row, ["Documento"]));

        let status: 'pagos' | 'vencido' | 'critico' | 'atencao' | 'ok' = 'ok';
        let daysRemaining = 999;
        let classification: any = { formattedDate: "", status: "ok", daysRemaining: 999 };

        if (isDesp) {
          // Despachante é serviço/custo operacional dinâmico, nunca deve ser puxado como vencido documentalmente
          status = isActuallyPaid ? 'pagos' : 'ok';
          daysRemaining = 999;
          classification = {
            formattedDate: formatBRDate(isActuallyPaid ? (pagamento || vencimento) : vencimento),
            status,
            daysRemaining
          };
        } else {
          const refDate = (isActuallyPaid && pagamento) ? pagamento : vencimento;
          classification = clientClassifyDocument(refDate);
          status = isActuallyPaid ? 'pagos' : classification.status;
          daysRemaining = isActuallyPaid ? 999 : classification.daysRemaining;
        }

        docs.push({
          type: descricao,
          expiryDate: classification.formattedDate || (isActuallyPaid ? pagamento : vencimento),
          rawExpiryDate: isActuallyPaid ? pagamento : vencimento,
          validityPeriod: "",
          status: status,
          daysRemaining: daysRemaining
        });

        row._status = status;
        row._daysRemaining = daysRemaining;
      } else {
        const isFinancialKey = (key: string) => {
          const uk = key.toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
          if (uk.startsWith("CUSTO ") || uk.startsWith("VALOR ") || uk.startsWith("PRECO ") || uk.startsWith("PREÇO ") || uk.startsWith("PAGO ") || uk === "VALOR" || uk === "CUSTO" || uk === "PRECO") {
            return true;
          }
          if (uk.includes("TACO") || uk.includes("INSP") || uk.includes("AUTORIZACAO") || uk.includes("REGISTRO") || uk.includes("CADASTRAL") || uk.includes("FRET") || uk.includes("EMPR") || uk.includes("AGR") || uk.includes("VISTORIA") || uk.includes("SEGURO") || uk.includes("CRV") || uk.includes("CRC") || uk.includes("CRLV") || uk.includes("CIV") || uk.includes("CIPP") || uk.includes("OPP") || uk.includes("DER") || uk.includes("ANTT") || uk.includes("CNH") || uk.includes("LAUDO") || uk.includes("ANEXO") || uk.includes("LICENCA") || uk.includes("LICENÇA")) {
            return false;
          }
          return uk.includes("VALOR") || 
                 uk.includes("TAXA") || 
                 uk.includes("TX") || 
                 uk.includes("CUSTO") || 
                 uk.includes("CUSTA") || 
                 uk.includes("PRECO") || 
                 uk.includes("PREÇO") || 
                 uk.includes("R$") ||
                 uk.includes("DESPACHANTE") ||
                 uk.includes("DEPACHANTE") ||
                 uk.startsWith("PAGAMENTO") ||
                 uk.startsWith("STATUS");
        };

        const docKeys = Object.keys(row).filter(key => {
          if (isFinancialKey(key)) return false;
          const uk = key.toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
          if (uk.includes("LIBERACAO")) return false;
          return uk.includes("SEGURO") || uk.includes("TACO") || uk.includes("INSP") || uk.includes("VISTORIA") || uk.includes("CNH") || uk.includes("ANTT") || uk.includes("DER") || uk.includes("AGR") || uk.includes("AUTORIZACAO") || uk.includes("REGISTRO") || uk.includes("CADASTRAL") || uk.includes("CRV") || uk.includes("CRC") || uk.includes("CRLV") || uk.includes("CIV") || uk.includes("CIPP") || uk.includes("OPP") || uk.includes("LAUDO") || uk.includes("LICENCA") || uk.includes("LICENÇA") || uk.includes("ANEXO") || uk.includes("FRET") || uk.includes("EMPR");
        });

        docs = docKeys.map(key => {
          let val = row[key];
          // If val contains currency symbol or format, it's not a valid date
          if (val && typeof val === "string" && (val.includes("R$") || val.includes("r$"))) {
            val = "-";
          }
          const classification = clientClassifyDocument(val);
          const headerIdx = headers.indexOf(key);
          const { cleanType, validityPeriod } = extractCleanDocTypeAndValidity(key, validityRow[headerIdx] || "");
          return {
            type: cleanType,
            expiryDate: classification.formattedDate,
            rawExpiryDate: val,
            validityPeriod: validityPeriod,
            status: classification.status,
            daysRemaining: classification.daysRemaining
          };
        }).filter(d => {
          const dt = d.type.toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
          return !dt.includes("LIBERACAO");
        });

        // Resolve missing dates for linked inspection/fee licenses (like TX INSP TACOGRAFO)
        const tacoMainDoc = docs.find(d => d.type.toUpperCase().includes("TACOGRAFO") && !d.type.toUpperCase().includes("INSP") && !d.type.toUpperCase().includes("TAXA") && !d.type.toUpperCase().includes("TX") && d.expiryDate !== "DEFINIR / SEM DATA" && d.rawExpiryDate !== "-");
        
        docs.forEach(d => {
          const uk = d.type.toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
          if ((uk.includes("INSP") || uk.includes("TX") || uk.includes("TAXA")) && uk.includes("TACO")) {
            if (tacoMainDoc && (d.expiryDate === "DEFINIR / SEM DATA" || d.rawExpiryDate === "-")) {
              d.expiryDate = tacoMainDoc.expiryDate;
              d.rawExpiryDate = tacoMainDoc.rawExpiryDate;
              d.status = tacoMainDoc.status;
              d.daysRemaining = tacoMainDoc.daysRemaining;
              if (!d.validityPeriod) d.validityPeriod = tacoMainDoc.validityPeriod || "02 ANOS";
            }
          }
        });

        const uniqueDocsMap = new Map<string, any>();
        docs.forEach(d => {
          const normType = normalizeDocTypeForDedup(d.type);
          if (!uniqueDocsMap.has(normType)) {
            uniqueDocsMap.set(normType, d);
          } else {
            const existing = uniqueDocsMap.get(normType);
            const scoreDoc = (doc: any) => {
              let score = 0;
              if (doc.rawExpiryDate && doc.rawExpiryDate !== "-" && !doc.rawExpiryDate.toUpperCase().includes("DEFINIR") && !doc.rawExpiryDate.toUpperCase().includes("VAZIO")) score += 20;
              if (doc.validityPeriod && /\d+/.test(doc.validityPeriod)) score += 10;
              return score;
            };
            if (scoreDoc(d) > scoreDoc(existing)) {
              if (!d.validityPeriod && existing.validityPeriod) d.validityPeriod = existing.validityPeriod;
              uniqueDocsMap.set(normType, d);
            } else {
              if (!existing.validityPeriod && d.validityPeriod) existing.validityPeriod = d.validityPeriod;
            }
          }
        });
        docs = Array.from(uniqueDocsMap.values());

        // Check if TX INSP TACOGRAFO is present in row as a financial column with a value
        const inspTacoKey = Object.keys(row).find(k => {
          const uk = k.toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
          return (uk.includes("INSP") || uk.includes("TX") || uk.includes("TAXA")) && (uk.includes("TACO") || uk.includes("TACOGRAFO"));
        });

        if (inspTacoKey && row[inspTacoKey] && String(row[inspTacoKey]).trim() !== "" && String(row[inspTacoKey]).trim() !== "-") {
          const tacoDoc = docs.find(d => d.type.toUpperCase().includes("TACOGRAFO") && !d.type.toUpperCase().includes("INSP") && !d.type.toUpperCase().includes("TAXA") && !d.type.toUpperCase().includes("TX"));
          if (tacoDoc && !docs.some(d => d.type.toUpperCase().includes("INSP") || d.type.toUpperCase().includes("TAXA") || d.type.toUpperCase().includes("TX"))) {
            docs.push({
              type: "TX INSP TACOGRAFO",
              expiryDate: tacoDoc.expiryDate,
              rawExpiryDate: tacoDoc.rawExpiryDate,
              validityPeriod: tacoDoc.validityPeriod || "02 ANOS",
              status: tacoDoc.status,
              daysRemaining: tacoDoc.daysRemaining
            });
          }
        }

        // Check if LICENÇA AGR 40DIAS is present in row as a financial column with a value
        const agr40Key = Object.keys(row).find(k => {
          const uk = k.toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
          return uk.includes("LICENCA AGR") || uk.includes("LICENÇA AGR") || uk.includes("AGR 40");
        });

        if (agr40Key && row[agr40Key] && String(row[agr40Key]).trim() !== "" && String(row[agr40Key]).trim() !== "-") {
          const agrDoc = docs.find(d => d.type.toUpperCase().includes("AGR") && !d.type.toUpperCase().includes("40") && !d.type.toUpperCase().includes("LICENCA") && !d.type.toUpperCase().includes("LICENÇA"));
          if (agrDoc && !docs.some(d => d.type.toUpperCase().includes("40") || d.type.toUpperCase().includes("LICENCA AGR") || d.type.toUpperCase().includes("LICENÇA AGR"))) {
            docs.push({
              type: "LICENÇA AGR 40DIAS",
              expiryDate: agrDoc.expiryDate,
              rawExpiryDate: agrDoc.rawExpiryDate,
              validityPeriod: "40 DIAS",
              status: agrDoc.status,
              daysRemaining: agrDoc.daysRemaining
            });
          }
        }
      }

      const statusPriority: Record<string, number> = { vencido: 0, critico: 1, atencao: 2, ok: 3, pagos: 4 };
      let overallStatus = 'ok';
      if (docs.length > 0) {
        overallStatus = docs.reduce((prev, curr) => {
          return (statusPriority[curr.status as keyof typeof statusPriority] ?? 3) < (statusPriority[prev as keyof typeof statusPriority] ?? 3) ? curr.status : prev;
        }, docs[0].status as any);
      }

      let driver = getValClient(row, ["Motorista", "driver", "MOTORISTA"]);
      if (plate === "EFO1936" || fleet === "733") {
        if (driver === "5448") driver = "Jean";
      }

      return {
        id: `${name}-${plate || 'NOPLATE'}-${fleet || 'NOFLEET'}-${Math.random().toString(36).substr(2, 5)}`,
        fleet, plate, driver,
        operation: name,
        client: name.split(" ")[0],
        cityBase: getValClient(row, ["Cidade/Base", "city", "CIDADE", "Base"]),
        vehicleType: getValClient(row, ["Tipo de veículo", "type", "TIPO"]),
        status: getValClient(row, ["Status", "STATUS", "Situação"]) || "Ativo",
        hasBathroom: getValClient(row, ["Banheiro", "BANHEIRO", "WC"]),
        origin: name,
        source: name === "DOC_SISTEMA" ? "DOCUMENTACAO" : "LICENCAS",
        lastUpdate,
        lat: parseFloat(getValClient(row, ["Latitude", "lat", "LAT"]) || "0"),
        lng: parseFloat(getValClient(row, ["Longitude", "lng", "LNG"]) || "0"),
        documents: docs,
        overallStatus,
        extraData: row
      };
    }).filter((v: any) => {
      if (!v) return false;
      const p = (v.plate || "").toUpperCase();
      const f = (v.fleet || "").toString().toUpperCase();
      const invalidTerms = ["OPERANDO", "VAI FICAR", "DEFINIR", "PREFIXO", "PLACA", "FROTA", "SUBTOTAL", "SUB-TOTAL", "TOTAL", "SOMA", "63 - 72", "63-72"];
      const isInvalid = (val: string) => {
        const cleaned = val.toUpperCase().trim();
        if (invalidTerms.some(t => cleaned.includes(t))) return true;
        if (/^\d+\s*[-–—]\s*\d+$/.test(cleaned)) return true;
        return cleaned === "N/A" || cleaned === "NA";
      };
      if (p === "CUD3486" || f === "5434" || p === "CUD2903" || f === "5409") return true;
      
      const rejected = (!p.startsWith("PED.") && isInvalid(p)) || isInvalid(f) || p === "RESERVA" || f === "RESERVA" || f === "6372" || p === "-" || p === "–" || p === "NOPLATE" || (!p && !f);
      if (rejected) return false;
      return true;
    });
  };

  const fetchFleetDirectlyFromSheets = async () => {
    setIsStaticMode(true);
    setServerStarting(false);
    try {
      const urls = {
        "BAYER MT": "https://docs.google.com/spreadsheets/d/1oMQutBfRI1amf6-E05Q1p3elKzlRpx5a6Qo_zpiXPd4/gviz/tq?tqx=out:csv&sheet=BAYER.%20M.T",
        "BAYER GO": "https://docs.google.com/spreadsheets/d/1oMQutBfRI1amf6-E05Q1p3elKzlRpx5a6Qo_zpiXPd4/gviz/tq?tqx=out:csv&sheet=BAYER%20-%20G.O",
        "CITROSUCO - UBERLANDIA": "https://docs.google.com/spreadsheets/d/1oMQutBfRI1amf6-E05Q1p3elKzlRpx5a6Qo_zpiXPd4/gviz/tq?tqx=out:csv&sheet=CITROSUCO%20-%20UBERLANDIA",
        "CITROSUCO - SÃO PAULO": "https://docs.google.com/spreadsheets/d/1oMQutBfRI1amf6-E05Q1p3elKzlRpx5a6Qo_zpiXPd4/gviz/tq?tqx=out:csv&sheet=CITROSUCO%20-%20S%C3%83O%20PAULO",
        "DOC_SISTEMA": "https://docs.google.com/spreadsheets/d/1_Wy2mIjpz-muAyDmDADm05C4kBUYo7dbVdkAY08MXhQ/gviz/tq?tqx=out:csv&sheet=DOC_SISTEMA_ETL"
      };

      const allData = await Promise.all([
        fetchAndNormalizeClient("BAYER MT", urls["BAYER MT"]),
        fetchAndNormalizeClient("BAYER GO", urls["BAYER GO"]),
        fetchAndNormalizeClient("CITROSUCO - UBERLANDIA", urls["CITROSUCO - UBERLANDIA"]),
        fetchAndNormalizeClient("CITROSUCO - SÃO PAULO", urls["CITROSUCO - SÃO PAULO"]),
        fetchAndNormalizeClient("DOC_SISTEMA", urls["DOC_SISTEMA"]),
      ]);

      const flatData = allData.flat();

      // Dynamic bidirectional plate <-> fleet resolution across all vehicles
      const isPlateFormat = (s: string) => /^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/.test(s) || /^[A-Z]{3}[0-9]{4}$/.test(s);
      const isLikelyPedido = (s: string) => /^(38|32)\d{3,5}$/.test(s.toString().trim().replace(/^0+/, ""));

      const plateFleetVotes = new Map<string, Map<string, number>>();
      const fleetPlateVotes = new Map<string, Map<string, number>>();

      flatData.forEach((v: any) => {
        const p = (v.plate || "").toUpperCase().trim();
        const f = (v.fleet || "").toString().trim().replace(/^0+/, "");
        if (isPlateFormat(p) && f && f.length >= 2 && !isLikelyPedido(f) && f !== "2024" && f !== "2025" && f !== "2026") {
          if (!plateFleetVotes.has(p)) plateFleetVotes.set(p, new Map());
          const fVotes = plateFleetVotes.get(p)!;
          fVotes.set(f, (fVotes.get(f) || 0) + 1);

          if (!fleetPlateVotes.has(f)) fleetPlateVotes.set(f, new Map());
          const pVotes = fleetPlateVotes.get(f)!;
          pVotes.set(p, (pVotes.get(p) || 0) + 1);
        }
      });

      const plateToFleetMap = new Map<string, string>();
      plateFleetVotes.forEach((fVotes, p) => {
        let bestFleet = "";
        let maxCount = -1;
        fVotes.forEach((cnt, f) => {
          if (cnt > maxCount) {
            maxCount = cnt;
            bestFleet = f;
          }
        });
        if (bestFleet) plateToFleetMap.set(p, bestFleet);
      });

      const fleetToPlateMap = new Map<string, string>();
      fleetPlateVotes.forEach((pVotes, f) => {
        let bestPlate = "";
        let maxCount = -1;
        pVotes.forEach((cnt, p) => {
          if (cnt > maxCount) {
            maxCount = cnt;
            bestPlate = p;
          }
        });
        if (bestPlate) fleetToPlateMap.set(f, bestPlate);
      });

      // Dynamically resolve missing or mismatched fleet and plate
      flatData.forEach((v: any) => {
        const p = (v.plate || "").toUpperCase().trim();
        const f = (v.fleet || "").toString().trim().replace(/^0+/, "");

        if (isPlateFormat(p) && plateToFleetMap.has(p)) {
          v.fleet = plateToFleetMap.get(p)!;
        } else if (f && (!p || !isPlateFormat(p)) && fleetToPlateMap.has(f)) {
          v.plate = fleetToPlateMap.get(f)!;
        }
      });

      const consolidatedMap = new Map();
        
      flatData.forEach((v: any) => {
        let key = "";
        if (v.source === "DOCUMENTACAO") {
          const docType = v.documents[0]?.type || "Documento";
          const docDate = v.documents[0]?.rawExpiryDate || "";
          const docId = v.extraData?.Documento || v.extraData?.["Documento"] || v.extraData?.Parcela || v.id;
          key = v.plate 
            ? `${v.source}-P-${v.plate}-${docType}-${docDate}-${docId}` 
            : `${v.source}-F-${v.fleet}-${docType}-${docDate}-${docId}`;
        } else {
          key = v.plate ? `${v.source}-P-${v.plate}` : `${v.source}-F-${v.fleet}`;
        }

        const existing = consolidatedMap.get(key);
        if (!existing) {
          consolidatedMap.set(key, v);
        } else {
          const existingScore = (existing.documents?.length || 0) + (existing.driver ? 1 : 0);
          const currentScore = (v.documents?.length || 0) + (v.driver ? 1 : 0);
          
          if (currentScore >= existingScore) {
            v.documents.forEach((d: any) => {
              const isDuplicate = existing.documents.some((ed: any) => 
                ed.type === d.type && ed.expiryDate === d.expiryDate
              );
              if (!isDuplicate) {
                existing.documents.push(d);
              }
            });
            consolidatedMap.set(key, { ...v, documents: existing.documents });
          }
        }
      });

      const result = Array.from(consolidatedMap.values());
      if (result.length > 0) {
        const sanitized = sanitizeFleetData(result);
        setFleet(sanitized);
        setLastUpdated(new Date());
        cleanRegularizedJustifications(sanitized);
        setError(null);
      } else {
        throw new Error("No vehicles consolidated");
      }
    } catch (err) {
      console.error("Direct parsing failed:", err);
      setError("Falha na conexão com o servidor de dados.");
    } finally {
      setLoading(false);
    }
  };

  const sanitizeFleetData = (list: Vehicle[]): Vehicle[] => {
    if (!Array.isArray(list)) return [];
    return list.map(v => {
      if (!v || !v.documents) return v;
      let docs = v.documents.map(d => {
        if (!d || !d.type) return d;
        const { cleanType, validityPeriod } = extractCleanDocTypeAndValidity(d.type, d.validityPeriod || "");
        return {
          ...d,
          type: cleanType,
          validityPeriod: validityPeriod || d.validityPeriod
        };
      });
      if (v.source === "LICENCAS") {
        docs = docs.filter(d => {
          if (!d || !d.type) return false;
          const dt = d.type.toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
          return !dt.includes("LIBERACAO");
        });
      }
      
      const uniqueDocsMap = new Map<string, any>();
      docs.forEach(d => {
        const normType = normalizeDocTypeForDedup(d.type);
        if (!uniqueDocsMap.has(normType)) {
          uniqueDocsMap.set(normType, d);
        } else {
          const existing = uniqueDocsMap.get(normType);
          const scoreDoc = (doc: any) => {
            let score = 0;
            if (doc.status === 'vencido') score += 10000;
            else if (doc.status === 'critico') score += 8000;
            else if (doc.status === 'atencao') score += 6000;
            else if (doc.status === 'ok') score += 4000;
            else if (doc.status === 'pagos') score += 0;
            
            if (doc.rawExpiryDate && doc.rawExpiryDate !== "-" && !doc.rawExpiryDate.toUpperCase().includes("DEFINIR") && !doc.rawExpiryDate.toUpperCase().includes("VAZIO")) score += 20;
            if (doc.validityPeriod && /\d+/.test(doc.validityPeriod)) score += 10;
            return score;
          };
          if (scoreDoc(d) > scoreDoc(existing)) {
            if (!d.validityPeriod && existing.validityPeriod) d.validityPeriod = existing.validityPeriod;
            uniqueDocsMap.set(normType, d);
          } else {
            if (!existing.validityPeriod && d.validityPeriod) existing.validityPeriod = d.validityPeriod;
          }
        }
      });
      docs = Array.from(uniqueDocsMap.values());
      
      return { ...v, documents: docs };
    });
  };

  const fetchFleet = async (retryAttempt = 0) => {
    setLoading(true);
    if (retryAttempt === 0) {
      setError(null);
    }
    try {
      const response = await fetch("/api/fleet");
      if (!response.ok) {
        console.warn(`Server error response ${response.status}. Falling back to direct sheet parser.`);
        await fetchFleetDirectlyFromSheets();
        return;
      }
      
      const contentType = response.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) {
        console.warn("Non-JSON/HTML received from API. Falling back to direct sheet parser.");
        await fetchFleetDirectlyFromSheets();
        return;
      }

      setServerStarting(false);
      setIsStaticMode(false);
      const data = await response.json();
      
      if (data.debug && !Array.isArray(data)) {
        console.log("Debug Info:", data.debug);
        setError(`Nenhum dado consolidado. Verifique as colunas das planilhas. (Encontradas: ${Object.keys(data.debug).map(k => `${k}: ${data.debug[k].rowCount || 0} linhas`).join(", ")})`);
        setFleet([]);
      } else if (Array.isArray(data)) {
        const sanitized = sanitizeFleetData(data);
        setFleet(sanitized);
        setLastUpdated(new Date());
        cleanRegularizedJustifications(sanitized);
      } else {
        console.error("Data is not an array:", data);
        setFleet([]);
      }
      setLoading(false);
    } catch (error) {
      if (retryAttempt < 2) {
        console.warn(`Error fetching fleet from API (attempt ${retryAttempt + 1}):`, error);
        const delay = Math.min(2000 * Math.pow(1.5, retryAttempt), 5000);
        console.log(`Failed to fetch fleet. Retrying in ${delay}ms...`);
        setTimeout(() => fetchFleet(retryAttempt + 1), delay);
      } else {
        console.error("Maximum API retries reached. Falling back to direct sheet parser...", error);
        await fetchFleetDirectlyFromSheets();
      }
    }
  };

  useEffect(() => {
    fetchFleet();
    checkGoogleStatus();
    const interval = setInterval(fetchFleet, settings.refreshInterval * 1000);
    return () => clearInterval(interval);
  }, [settings.refreshInterval]);

  const getAdjustedDate = () => subHours(new Date(), 3);

  const checkGoogleStatus = async (retryCount = 0) => {
    try {
      if (getStoredGoogleToken()) {
        setIsGoogleConnected(true);
        return;
      }

      const token = getStoredGoogleToken();
      const response = await fetch("/api/auth/google/status", {
        headers: token ? { "Authorization": `Bearer ${token}` } : {}
      });
      if (!response.ok) {
        if (retryCount < 3) {
          setTimeout(() => checkGoogleStatus(retryCount + 1), 5000);
        }
        return;
      }
      
      const contentType = response.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) {
        if (retryCount < 3) {
          setTimeout(() => checkGoogleStatus(retryCount + 1), 5000);
        }
        return;
      }

      const data = await response.json();
      setIsGoogleConnected(data.connected || !!getStoredGoogleToken());
    } catch (error) {
      console.error("Error checking Google status:", error);
      if (retryCount < 3) {
        setTimeout(() => checkGoogleStatus(retryCount + 1), 5000);
      }
    }
  };

  const handleGoogleConnect = async (): Promise<string | null> => {
    try {
      const authRes = await signInWithGoogleWorkspace();
      if (authRes?.token) {
        setIsGoogleConnected(true);
        return authRes.token;
      }
    } catch (error: any) {
      console.error("Error connecting to Google:", error);
      alert(`Erro ao conectar com a conta Google: ${error.message || String(error)}`);
    }
    return null;
  };

  const saveToGoogleDrive = async () => {
    let token = getStoredGoogleToken();
    if (!token) {
      token = await handleGoogleConnect();
      if (!token) return null;
    }

    setIsUploading(true);
    try {
      // Generate the PDF first
      const doc = await generateBoardReportDoc();
      const pdfBase64 = doc.output('datauristring');
      const fileName = `Relatorio_Diretoria_${format(getAdjustedDate(), "dd-MM-yyyy_HH-mm")}.pdf`;

      const response = await fetch("/api/drive/upload", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({ pdfBase64, fileName, accessToken: token })
      });

      const contentType = response.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) {
        throw new Error("O servidor ainda está iniciando. Por favor, aguarde alguns segundos e tente novamente.");
      }

      if (!response.ok) {
        if (response.status === 401) {
          setStoredGoogleToken(null);
          token = await handleGoogleConnect();
          if (token) {
            return await saveToGoogleDrive();
          }
        }
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || "Falha no upload");
      }
      
      const data = await response.json();
      alert(`Relatório salvo com sucesso no Google Drive!`);
      return data.webViewLink;
    } catch (error: any) {
      console.error("Error saving to Drive:", error);
      alert(`Erro ao salvar no Google Drive: ${error.message}`);
      return null;
    } finally {
      setIsUploading(false);
    }
  };

  const loadPDFLogo = async (): Promise<HTMLImageElement | null> => {
    if (!settings.showLogo) return null;
    try {
      return await new Promise<HTMLImageElement | null>((resolve) => {
        const img = new Image();
        img.crossOrigin = "Anonymous";
        img.onload = () => resolve(img);
        img.onerror = () => {
          console.warn("Could not load PDF logo, continuing without logo");
          resolve(null);
        };
        img.src = settings.logoUrl || UNI_LOGO;
      });
    } catch (e) {
      console.error("Error loading PDF logo", e);
      return null;
    }
  };

  const renderModernPDFHeader = (
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
    const pageWidth = doc.internal.pageSize.getWidth();
    const bannerHeight = options.height || 36;
    
    // 1. Sleek corporate navy banner
    doc.setFillColor(26, 54, 138);
    doc.rect(0, 0, pageWidth, bannerHeight, 'F');
    
    // 2. Modern vibrant accent stripe (#3B82F6)
    doc.setFillColor(59, 130, 246);
    doc.rect(0, bannerHeight - 1.2, pageWidth, 1.2, 'F');

    // 3. Logo Placement (aspect ratio preserved, never distorted)
    const logoX = 14;
    let logoW = 0;
    if (options.loadedImg && settings.showLogo) {
      try {
        const maxH = bannerHeight - 14;
        const maxW = 32;
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
        
        const logoY = 6 + (maxH - targetH) / 2;
        doc.addImage(options.loadedImg, 'PNG', logoX, logoY, targetW, targetH);
        logoW = targetW;
      } catch (e) {
        console.error("Error drawing logo in header", e);
      }
    }

    // 4. Left-to-center Text Block (Starts after the logo with clean breathing margin)
    const textStartX = logoW > 0 ? (logoX + logoW + 6) : 14;
    const rightMarginX = pageWidth - 14;
    const reservedRightWidth = 58;
    const availableTitleWidth = rightMarginX - textStartX - reservedRightWidth;
    
    // Organization / System Eyebrow
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.setTextColor(191, 219, 254);
    const companyTag = `${(settings.companyName || "LOGIFLEET").toUpperCase()} • GESTÃO DE FROTAS`;
    doc.text(companyTag, textStartX, 12);

    // Main Title (responsive auto-fit so it never touches the right-side metadata)
    doc.setFont("helvetica", "bold");
    doc.setTextColor(255, 255, 255);
    let titleFontSize = 14;
    doc.setFontSize(titleFontSize);
    while (doc.getTextWidth(options.title) > availableTitleWidth && titleFontSize > 9) {
      titleFontSize -= 0.5;
      doc.setFontSize(titleFontSize);
    }
    doc.text(options.title, textStartX, 20.5);

    // Subtitle / Scope
    if (options.subtitle) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(226, 232, 240);
      let sub = options.subtitle;
      if (doc.getTextWidth(sub) > availableTitleWidth + 20) {
        while (doc.getTextWidth(sub + "...") > (availableTitleWidth + 20) && sub.length > 10) {
          sub = sub.slice(0, -1);
        }
        sub += "...";
      }
      doc.text(sub, textStartX, 27.5);
    }

    // 5. Right-aligned Metadata Block
    // Pill Badge
    const badge = options.badgeText || "RELATÓRIO OFICIAL";
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    const badgeTextW = doc.getTextWidth(badge);
    const badgeW = Math.max(36, badgeTextW + 10);
    const badgeH = 5.5;
    doc.setFillColor(37, 99, 235);
    doc.roundedRect(rightMarginX - badgeW, 7, badgeW, badgeH, 1.5, 1.5, 'F');
    doc.setTextColor(255, 255, 255);
    doc.text(badge, rightMarginX - (badgeW / 2), 10.8, { align: "center" });

    // Date & Time of Generation
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(219, 234, 254);
    doc.text(`Emissão: ${format(new Date(), "dd/MM/yyyy HH:mm")}`, rightMarginX, 20.5, { align: "right" });

    // Secondary Right Metadata
    if (options.rightMetaText) {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      doc.setTextColor(255, 255, 255);
      doc.text(options.rightMetaText, rightMarginX, 27.5, { align: "right" });
    }
  };

  const generateBoardReportDoc = async () => {
    const doc = new jsPDF({ orientation: 'portrait' });
    
    const baseFleet = activeDashboardSubTab === "licencas" 
      ? filteredDashboardLicFleet 
      : filteredDashboardDocFleet;
    
    const loadedImg = await loadPDFLogo();

    renderModernPDFHeader(doc, {
      title: "RELATÓRIO EXECUTIVO DE FROTA",
      subtitle: `${settings.companyName} | Conformidade Operacional e Prazos`,
      badgeText: "DIRETORIA EXECUTIVA",
      rightMetaText: `Total Veículos: ${stats.totalVehicles}`,
      loadedImg,
      height: 36
    });

    // Summary Section
    doc.setTextColor(26, 54, 138);
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text("Resumo Executivo", 20, 50);
    
    doc.setDrawColor(226, 232, 240);
    doc.line(20, 58, 190, 58);

    doc.setFontSize(11);
    doc.setTextColor(71, 85, 105);
    doc.setFont("helvetica", "normal");
    doc.text(`Data do Relatório: ${format(getAdjustedDate(), "dd/MM/yyyy HH:mm")}`, 20, 68);
    doc.text(`Total de Veículos em Operação: ${stats.totalVehicles}`, 20, 75);
    doc.text(`Operações Ativas Monitoradas: ${stats.activeOperations}`, 20, 82);

    // Legend
    doc.setFontSize(9);
    doc.setTextColor(100, 116, 139);
    doc.text("Legenda de Status:", 130, 68);
    doc.text("• 30 dias = Atenção", 130, 73);
    doc.text("• 7 dias = Crítico", 130, 78);
    doc.text("• 0 dias = Vencido", 130, 83);

    // KPI Cards
    let distStartY = 135;
    let distTableStartY = 140;

    if (includePdfSummaries) {
      doc.setFillColor(248, 250, 252);
      doc.roundedRect(20, 90, 80, 30, 3, 3, 'F');
      doc.setTextColor(30, 64, 175);
      doc.setFont("helvetica", "bold");
      doc.text("DOCUMENTOS OK", 60, 100, { align: "center" });
      doc.setFontSize(18);
      doc.text(`${baseFleet.filter(v => v.overallStatus === 'ok').length}`, 60, 112, { align: "center" });

      doc.setFillColor(254, 242, 242);
      doc.roundedRect(110, 90, 80, 30, 3, 3, 'F');
      doc.setTextColor(220, 38, 38);
      doc.setFontSize(11);
      doc.text("VENCIDOS / CRÍTICOS", 150, 100, { align: "center" });
      doc.setFontSize(18);
      doc.text(`${stats.expiredDocs + stats.expiringDocs}`, 150, 112, { align: "center" });
    } else {
      distStartY = 94;
      distTableStartY = 100;
    }

    // Distribution Table
    doc.setTextColor(30, 64, 175);
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text("Distribuição por Operação", 20, distStartY);

    const opData = operations.map(op => [
      op === "DOC_SISTEMA" ? "GLOBUS" : op,
      baseFleet.filter(v => v.operation === op).length,
      baseFleet.filter(v => v.operation === op && v.overallStatus === 'ok').length,
      baseFleet.filter(v => v.operation === op && (v.overallStatus === 'vencido' || v.overallStatus === 'critico')).length
    ]).filter(row => (row[1] as number) > 0);

    autoTable(doc, {
      head: [["Operação", "Total", "Regular", "Irregular"]],
      body: opData,
      startY: distTableStartY,
      theme: 'striped',
      headStyles: { fillColor: [30, 64, 175] },
      styles: { fontSize: 10 }
    });

    // Critical List (Vencidos e Críticos)
    const criticalVehicles = baseFleet
      .filter(v => v.overallStatus === 'vencido' || v.overallStatus === 'critico')
      .map(v => {
        // Find the most critical document
        const criticalDocs = v.documents.filter(d => d.status === 'vencido' || d.status === 'critico');
        const worstDoc = criticalDocs.sort((a, b) => a.daysRemaining - b.daysRemaining)[0];
        
        const earliestDate = worstDoc ? worstDoc.expiryDate : "-";
        const docType = worstDoc ? worstDoc.type : "-";
        const deadline = worstDoc 
          ? (worstDoc.daysRemaining < 0 ? `Vencido (${Math.abs(worstDoc.daysRemaining)}d)` : `${worstDoc.daysRemaining} dias`) 
          : "-";
          
        return [v.plate, v.fleet, v.operation === "DOC_SISTEMA" ? "GLOBUS" : v.operation, docType, earliestDate, deadline, v.overallStatus.toUpperCase()];
      });

    if (criticalVehicles.length > 0) {
      doc.addPage();
      doc.setTextColor(220, 38, 38);
      doc.setFontSize(14);
      doc.setFont("helvetica", "bold");
      doc.text("Veículos com Pendências Críticas e Vencidas", 20, 20);

      autoTable(doc, {
        head: [["Placa", "Frota", "Operação", "Documento", "Vencimento", "Prazo", "Status"]],
        body: criticalVehicles,
        startY: 25,
        headStyles: { fillColor: [220, 38, 38] },
        styles: { fontSize: 8 },
        margin: { bottom: 20 }
      });
    }

    // Attention List
    const attentionVehicles = baseFleet
      .filter(v => v.overallStatus === 'atencao')
      .map(v => {
        const attentionDocs = v.documents.filter(d => d.status === 'atencao');
        const worstDoc = attentionDocs.sort((a, b) => a.daysRemaining - b.daysRemaining)[0];
        
        const earliestDate = worstDoc ? worstDoc.expiryDate : "-";
        const docType = worstDoc ? worstDoc.type : "-";
        const deadline = worstDoc ? `${worstDoc.daysRemaining} dias` : "-";
        
        return [v.plate, v.fleet, v.operation === "DOC_SISTEMA" ? "GLOBUS" : v.operation, docType, earliestDate, deadline, v.overallStatus.toUpperCase()];
      });

    if (attentionVehicles.length > 0) {
      doc.addPage();
      doc.setTextColor(245, 158, 11); // Amber-500
      doc.setFontSize(14);
      doc.setFont("helvetica", "bold");
      doc.text("Veículos em Estado de Atenção", 20, 20);

      autoTable(doc, {
        head: [["Placa", "Frota", "Operação", "Documento", "Vencimento", "Prazo", "Status"]],
        body: attentionVehicles,
        startY: 25,
        headStyles: { fillColor: [245, 158, 11] },
        styles: { fontSize: 8 },
        margin: { bottom: 20 }
      });
    }

    // Footer on all pages
    const pageCount = (doc as any).internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.setTextColor(148, 163, 184);
      doc.text(`LogiFleet - Relatório de Diretoria | Página ${i} de ${pageCount}`, 105, 285, { align: "center" });
    }

    return doc;
  };

  const exportToExcel = () => {
    if (activeTab === "financeiro_licencas" && finLicencasSubTab === "resumo") {
      const resumoExport = filteredResumoList.map(item => ({
        "Documento": item.docType,
        "Operação": item.operation,
        "Placa": item.plate,
        "Frota": item.fleet,
        "Frequência de Renovação": item.frequencia,
        "Valor": item.valorFormatted,
        "Status": item.statusLabel,
        "Prazo": item.prazo,
        "Vencimento": item.vencimento,
        "Motorista": item.driver
      }));
      const worksheet = XLSX.utils.json_to_sheet(resumoExport);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Alertas_Licencas");
      XLSX.writeFile(workbook, `Relatorio_Alertas_Licencas_${format(new Date(), "dd-MM-yyyy")}.xlsx`);
      return;
    }

    const dataToExport = filteredFleet.map(v => {
      if (activeTab === "licencas_documentos" || activeTab === "financeiro_docs") {
        const row: any = {};
        
        // Include Frota and Placa explicitly
        row["Frota"] = v.fleet || "-";
        row["Placa"] = v.plate || "-";

        DOC_SISTEMA_COLUMNS.forEach(col => {
          // Skip Razão Social as requested, but KEEP Pedido in Excel as per request 5
          if (col === "Razão Social" || col === "Frota" || col === "Placa") return;

          let val = v.extraData?.[col];
          if (val === undefined || val === null || val === "") {
            const normalizedCol = col.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
            const foundKey = Object.keys(v.extraData || {}).find(k => 
              k.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim() === normalizedCol
            );
            if (foundKey) val = v.extraData[foundKey];
          }

          // Format dates for Excel too
          if (col === "Vencimento" || col === "Pagamento") {
            val = formatBRDate(val || "-");
          }

          // Summarize Observations
          if (col === "Observações" && val && val.length > 50) {
            val = val.substring(0, 47) + "...";
          }

          row[col] = val || "-";
        });
        return row;
      }

      const row: any = {
        "Frota": v.fleet,
        "Placa": v.plate,
        "Operação": v.operation,
        "Motorista": v.driver,
        "Banheiro": v.hasBathroom || "N/A"
      };
      
      if (activeTab === "licencas_detalhadas") {
        interleavedDetailedColumns.forEach(col => {
          if (col.type === "document") {
            const doc = v.documents.find(d => d.type === col.name);
            row[`${col.name} - Vencimento`] = doc ? doc.expiryDate : "-";
            row[`${col.name} - Status`] = doc ? doc.status.toUpperCase() : "-";
          } else {
            row[col.name] = v.extraData?.[col.name] || "-";
          }
        });
      } else {
        v.documents.forEach(doc => {
          row[`${doc.type} - Vencimento`] = doc.expiryDate;
          row[`${doc.type} - Dias`] = doc.daysRemaining === 999 ? "N/A" : doc.daysRemaining;
          row[`${doc.type} - Status`] = doc.status.toUpperCase();
        });
      }

      row["Cidade/Base"] = v.cityBase;
      row["Status"] = v.status;
      
      return row;
    });

    const worksheet = XLSX.utils.json_to_sheet(dataToExport);
    const workbook = XLSX.utils.book_new();
    const sheetName = activeTab === "licencas_documentos" ? "Documentação" : (activeTab === "financeiro_licencas" ? "Financeiro_Licencas" : "Frota");
    XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
    XLSX.writeFile(workbook, `Relatorio_${sheetName}_${format(new Date(), "dd-MM-yyyy")}.xlsx`);
  };

  const exportToPDF = async (customIncludeSummaries?: boolean) => {
    const shouldIncludeSummaries = customIncludeSummaries !== undefined ? customIncludeSummaries : includePdfSummaries;
    const doc = new jsPDF({ orientation: 'landscape' });
    const pageWidth = doc.internal.pageSize.getWidth();
    
    const loadedImg = await loadPDFLogo();

    const drawHeader = (partTitle?: string) => {
      let title = activeTab === "licencas_documentos" ? "Relatório de Documentação do Sistema" : "Relatório Gerencial de Frota e Documentação";
      if (partTitle) {
        title += ` - ${partTitle}`;
      }
      renderModernPDFHeader(doc, {
        title,
        subtitle: `${settings.companyName} | Monitoramento Operacional de Frota e Conformidade`,
        badgeText: "RELATÓRIO GERENCIAL",
        rightMetaText: partTitle || "DOCUMENTO OFICIAL",
        loadedImg,
        height: 32
      });
    };

    if (activeTab === "financeiro_licencas" && finLicencasSubTab === "resumo") {
      const totalValSum = filteredResumoList.reduce((acc, curr) => acc + curr.valor, 0);

      renderModernPDFHeader(doc, {
        title: "RELATÓRIO DE ALERTAS E VALORES - LICENÇAS",
        subtitle: `Empresa: ${settings.companyName} | Total Alertas: ${filteredResumoList.length} | Valor Total: ${formatCurrencyBR(totalValSum)}`,
        badgeText: "RESUMO FINANCEIRO",
        rightMetaText: `Valor Total: ${formatCurrencyBR(totalValSum)}`,
        loadedImg,
        height: 32
      });

      let nextY = 34;

      if (shouldIncludeSummaries) {
        doc.setFillColor(248, 250, 252);
        doc.roundedRect(14, 34, pageWidth - 28, 20, 3, 3, 'F');

        const totalAlerts = filteredResumoList.length;
        const vCount = filteredResumoList.filter(i => i.status === 'vencido').length;
        const cCount = filteredResumoList.filter(i => i.status === 'critico').length;
        const aCount = filteredResumoList.filter(i => i.status === 'atencao').length;
        const oCount = filteredResumoList.filter(i => i.status === 'ok').length;

        const summaryItems = [
          { label: "Total Alertas", value: totalAlerts.toString(), color: [30, 64, 175] },
          { label: "Vencidos", value: vCount.toString(), color: [220, 38, 38] },
          { label: "Críticos (até 7d)", value: cCount.toString(), color: [234, 88, 12] },
          { label: "Em Atenção (até 30d)", value: aCount.toString(), color: [202, 138, 4] },
          { label: "Regulares / OK", value: oCount.toString(), color: [22, 163, 74] },
          { label: "Valor Total", value: formatCurrencyBR(totalValSum), color: [15, 23, 42] }
        ];

        const step = (pageWidth - 40) / 6;
        summaryItems.forEach((item, index) => {
          const x = 18 + (index * step);
          doc.setFontSize(8);
          doc.setTextColor(100, 116, 139);
          doc.text(item.label, x, 40);
          doc.setFontSize(10);
          doc.setTextColor(item.color[0], item.color[1], item.color[2]);
          doc.text(item.value, x, 47);
        });

        nextY = 56;
      }

      const despInfo = getBayerGoDespachanteInfo(filteredFleet);
      const opLabel = (despInfo.operationName || "BAYER").toUpperCase();
      let tableStartY = shouldIncludeSummaries ? 56 : 36;
      if (despInfo.hasBayerGo || filteredResumoList.some(i => (i.operation || "").toUpperCase().includes("BAYER"))) {
        const despBoxY = shouldIncludeSummaries ? 53 : 34;
        doc.setFillColor(239, 246, 255);
        doc.setDrawColor(191, 219, 254);
        doc.roundedRect(14, despBoxY, pageWidth - 28, 7, 2, 2, 'FD');
        doc.setFont("helvetica", "bold");
        doc.setFontSize(8);
        doc.setTextColor(30, 64, 175);
        doc.text(`PARAMÊTRO OPERACIONAL - CUSTO DESPACHANTE = ${despInfo.formatted} (VALOR POR VEÍCULO)`, 18, despBoxY + 4.5);
        tableStartY = despBoxY + 10;
      }

      const headers = ["Documento", "Operação", "Placa", "Frota", "Frequência Renovação", "Valor", "Status", "Prazo", "Vencimento"];
      const tableData = filteredResumoList.map(item => [
        item.docType,
        item.operation,
        item.plate,
        item.fleet,
        item.frequencia,
        item.valorFormatted,
        item.statusLabel,
        item.prazo,
        item.vencimento
      ]);

      autoTable(doc, {
        head: [headers],
        body: tableData,
        startY: tableStartY,
        styles: { 
          fontSize: 8, 
          cellPadding: 2.5, 
          overflow: 'linebreak',
          valign: 'middle'
        },
        headStyles: { 
          fillColor: [30, 64, 175], 
          textColor: [255, 255, 255], 
          fontStyle: 'bold',
          halign: 'left',
          fontSize: 8.5,
          minCellHeight: 10
        },
        columnStyles: {
          0: { cellWidth: 40, fontStyle: 'bold' },
          1: { cellWidth: 46 },
          2: { cellWidth: 22, halign: 'center', fontStyle: 'bold' },
          3: { cellWidth: 18, halign: 'center', fontStyle: 'bold' },
          4: { cellWidth: 40, halign: 'center' },
          5: { cellWidth: 30, halign: 'right', fontStyle: 'bold' },
          6: { cellWidth: 22, halign: 'center', fontStyle: 'bold' },
          7: { cellWidth: 26, halign: 'center' },
          8: { cellWidth: 22, halign: 'center' }
        },
        alternateRowStyles: { fillColor: [248, 250, 252] },
        margin: { top: 56, left: 14, right: 14 },
        didParseCell: (data) => {
          if (data.section === 'body' && data.column.index === 6) {
            const val = String(data.cell.raw).trim();
            if (val === 'VENCIDO') data.cell.styles.textColor = [220, 38, 38];
            else if (val === 'CRITICO') data.cell.styles.textColor = [234, 88, 12];
            else if (val === 'ATENCAO') data.cell.styles.textColor = [202, 138, 4];
            else if (val === 'OK') data.cell.styles.textColor = [22, 163, 74];
            data.cell.styles.fontStyle = 'bold';
          }
        }
      });

      doc.save(`Relatorio_Alertas_Licencas_${format(new Date(), "dd-MM-yyyy")}.pdf`);
      return;
    }

    if (activeTab === "licencas_detalhadas") {
      // Chunk detailed columns to maintain pristine readability and prevent layout distortion
      const maxColsPerChunk = 4;
      const chunks: typeof interleavedDetailedColumns[] = [];
      for (let i = 0; i < interleavedDetailedColumns.length; i += maxColsPerChunk) {
        chunks.push(interleavedDetailedColumns.slice(i, i + maxColsPerChunk));
      }

      chunks.forEach((chunk, chunkIdx) => {
        if (chunkIdx > 0) {
          doc.addPage();
        }
        
        const partLabel = `Parte ${chunkIdx + 1} de ${chunks.length}`;
        drawHeader(partLabel);

        let startY = 35;
        if (chunkIdx === 0) {
          // Managerial Summary (only on the first page)
          doc.setFillColor(248, 250, 252);
          doc.roundedRect(14, 35, pageWidth - 28, 25, 3, 3, 'F');
          
          doc.setFont("helvetica", "bold");
          doc.setFontSize(10);
          doc.setTextColor(30, 64, 175);
          doc.text("RESUMO EXECUTIVO", 20, 42);
          
          const summaryItems = [
            { label: "Total Veículos", value: filteredFleet.length, color: [30, 64, 175] },
            { label: "Status OK", value: filteredFleet.filter(v => v.overallStatus === 'ok').length, color: [34, 197, 94] },
            { label: "Em Atenção", value: filteredFleet.filter(v => v.overallStatus === 'atencao').length, color: [245, 158, 11] },
            { label: "Críticos", value: filteredFleet.filter(v => v.overallStatus === 'critico').length, color: [249, 115, 22] },
            { label: "Vencidos", value: filteredFleet.filter(v => v.overallStatus === 'vencido').length, color: [239, 68, 68] }
          ];
          
          summaryItems.forEach((item, index) => {
            const x = 20 + (index * 55);
            doc.setFontSize(8);
            doc.setTextColor(100, 116, 139);
            doc.text(item.label, x, 48);
            doc.setFontSize(12);
            doc.setTextColor(item.color[0], item.color[1], item.color[2]);
            doc.text(item.value.toString(), x, 54);
          });
          
          startY = 65;
        }

        const tableHeaders = ["Frota", "Placa", "Operação", "Motorista", "Banheiro", "Status"];
        const chunkHeaders = chunk.map(col => {
          if (col.type === "document") {
            return col.name;
          } else {
            return `${col.name} ($)`;
          }
        });
        const headers = [...tableHeaders, ...chunkHeaders];

        const tableData = filteredFleet.map(v => {
          const row = [v.fleet, v.plate, v.operation === "DOC_SISTEMA" ? "GLOBUS" : v.operation, v.driver, v.hasBathroom || "-", v.overallStatus.toUpperCase()];
          chunk.forEach(col => {
            if (col.type === "document") {
              const d = v.documents.find(doc => doc.type === col.name);
              row.push(d ? d.expiryDate : "-");
            } else {
              row.push(v.extraData?.[col.name] || "-");
            }
          });
          return row;
        });

        const columnStyles: any = {
          0: { cellWidth: 15 }, // Frota
          1: { cellWidth: 18 }, // Placa
          2: { cellWidth: 30 }, // Operação
          3: { cellWidth: 35 }, // Motorista
          4: { cellWidth: 18, halign: 'center' }, // Banheiro
          5: { cellWidth: 18, halign: 'center' }  // Status
        };

        for (let i = 0; i < chunk.length; i++) {
          columnStyles[6 + i] = { cellWidth: 'auto', halign: 'center' };
        }

        autoTable(doc, {
          head: [headers],
          body: tableData,
          startY: startY,
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
            halign: 'center',
            fontSize: 7.5,
            minCellHeight: 10
          },
          columnStyles: columnStyles,
          alternateRowStyles: { fillColor: [248, 250, 252] },
          margin: { top: startY, left: 5, right: 5 },
          didParseCell: (data) => {
            if (data.section === 'body' && data.column.index === 5) {
              const val = data.cell.raw as string;
              if (val === 'OK') data.cell.styles.textColor = [34, 197, 94];
              if (val === 'ATENCAO') data.cell.styles.textColor = [245, 158, 11];
              if (val === 'CRITICO') data.cell.styles.textColor = [249, 115, 22];
              if (val === 'VENCIDO') data.cell.styles.textColor = [239, 68, 68];
              data.cell.styles.fontStyle = 'bold';
            }
            if (data.section === 'body' && data.column.index >= 6) {
              const chunkColIdx = data.column.index - 6;
              const colSpec = chunk[chunkColIdx];
              if (colSpec) {
                if (colSpec.type === 'financial') {
                  data.cell.styles.textColor = [16, 124, 65]; // Green for financial
                  data.cell.styles.fontStyle = 'bold';
                  data.cell.styles.halign = 'center';
                } else if (colSpec.type === 'document') {
                  const vehicleIdx = data.row.index;
                  const vehicle = filteredFleet[vehicleIdx];
                  if (vehicle) {
                    const docInfo = vehicle.documents.find(d => d.type === colSpec.name);
                    if (docInfo) {
                      if (docInfo.status === 'ok' || docInfo.status === 'pagos') data.cell.styles.textColor = [34, 197, 94];
                      if (docInfo.status === 'atencao') data.cell.styles.textColor = [245, 158, 11];
                      if (docInfo.status === 'critico') data.cell.styles.textColor = [249, 115, 22];
                      if (docInfo.status === 'vencido') data.cell.styles.textColor = [239, 68, 68];
                      data.cell.styles.fontStyle = 'bold';
                    }
                  }
                  data.cell.styles.halign = 'center';
                }
              }
            }
          }
        });
      });
    } else {
      drawHeader();

      // Managerial Summary
      doc.setFillColor(248, 250, 252);
      doc.roundedRect(14, 35, pageWidth - 28, 25, 3, 3, 'F');
      
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.setTextColor(30, 64, 175);
      doc.text("RESUMO EXECUTIVO", 20, 42);
      
      const summaryItems = [
        { label: "Total Veículos", value: filteredFleet.length, color: [30, 64, 175] },
        { label: "Status OK", value: filteredFleet.filter(v => v.overallStatus === 'ok').length, color: [34, 197, 94] },
        { label: "Em Atenção", value: filteredFleet.filter(v => v.overallStatus === 'atencao').length, color: [245, 158, 11] },
        { label: "Críticos", value: filteredFleet.filter(v => v.overallStatus === 'critico').length, color: [249, 115, 22] },
        { label: "Vencidos", value: filteredFleet.filter(v => v.overallStatus === 'vencido').length, color: [239, 68, 68] }
      ];
      
      summaryItems.forEach((item, index) => {
        const x = 20 + (index * 55);
        doc.setFontSize(8);
        doc.setTextColor(100, 116, 139);
        doc.text(item.label, x, 48);
        doc.setFontSize(12);
        doc.setTextColor(item.color[0], item.color[1], item.color[2]);
        doc.text(item.value.toString(), x, 54);
      });

      let headers: string[];
      let tableData: any[][];

      if (activeTab === "licencas_documentos") {
        headers = ["Frota", "Placa", "Vencimento", "Pagamento", "Descrição", "Documento", "Observações", "Parcela", "Valor"];
        tableData = filteredFleet.map(v => {
          const getVal = (col: string) => {
            let val = v.extraData?.[col];
            if (val === undefined || val === null || val === "") {
              const normalizedCol = col.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
              const foundKey = Object.keys(v.extraData || {}).find(k => 
                k.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim() === normalizedCol
              );
              if (foundKey) val = v.extraData[foundKey];
            }
            return val;
          };

          const extra = v.extraData || {};
          const obsRaw = String(getVal("Observações") || "").trim();
          const pedMatch = obsRaw.match(/PEDIDO\s*[:\-#]?\s*([0-9]{4,8})/i);
          const docRaw = String(getVal("Documento") || "").trim();
          const pedVal = String(extra["Pedido"] || (pedMatch ? pedMatch[1] : (/^[0-9]{4,8}$/.test(docRaw) ? docRaw : ""))).trim();

          const frota = String(v.fleet || (pedVal ? pedVal : "-"));
          const placa = String(v.plate || (pedVal ? `PED. ${pedVal}` : "-"));
          const venc = formatBRDate(getVal("Vencimento") || "-");
          const pag = formatBRDate(getVal("Pagamento") || "-");
          const desc = String(getVal("Descrição") || "-");
          const docName = String(getVal("Documento") || "-");
          const parcela = String(getVal("Parcela") || "-");
          const valor = String(getVal("Valor") || "-");
          
          let obs = String(getVal("Observações") || "-");
          if (obs && obs.length > 40) {
            obs = obs.substring(0, 37) + "...";
          }

          return [frota, placa, venc, pag, desc, docName, obs, parcela, valor];
        });
      } else {
        const tableHeaders = ["Frota", "Placa", "Operação", "Motorista", "Banheiro", "Status"];
        const docTypes = visibleDocumentTypes.map(d => d.type);
        headers = [...tableHeaders, ...docTypes];

        tableData = filteredFleet.map(v => {
          const row = [v.fleet, v.plate, v.operation, v.driver, v.hasBathroom || "-", v.overallStatus.toUpperCase()];
          docTypes.forEach(type => {
            const d = v.documents.find(doc => doc.type === type);
            row.push(d ? d.expiryDate : "-");
          });
          return row;
        });
      }

      autoTable(doc, {
        head: [headers],
        body: tableData,
        startY: 65,
        styles: { 
          fontSize: headers.length > 15 ? 4 : 6, 
          cellPadding: 1, 
          overflow: 'linebreak',
          valign: 'middle'
        },
        headStyles: { 
          fillColor: [30, 64, 175], 
          textColor: [255, 255, 255], 
          fontStyle: 'bold',
          halign: 'center',
          fontSize: headers.length > 15 ? 4 : 6,
          minCellHeight: 10
        },
        columnStyles: activeTab === "licencas_documentos" ? {
          0: { cellWidth: 12 }, // Frota
          1: { cellWidth: 15 }, // Placa
          2: { cellWidth: 20 }, // Vencimento
          3: { cellWidth: 20 }, // Pagamento
          4: { cellWidth: 35 }, // Descrição
          5: { cellWidth: 15 }, // Documento
          6: { cellWidth: 'auto' }, // Observações
          7: { cellWidth: 12 }, // Parcela
          8: { cellWidth: 15 }  // Valor
        } : {
          0: { cellWidth: 12 }, // Frota
          1: { cellWidth: 18 }, // Placa
          2: { cellWidth: 25 }, // Operação
          3: { cellWidth: 35 }, // Motorista
          4: { cellWidth: 15, halign: 'center' }, // Banheiro
          5: { cellWidth: 15, halign: 'center' }  // Status
        },
        alternateRowStyles: { fillColor: [248, 250, 252] },
        margin: { top: 65, left: 5, right: 5 },
        didParseCell: (data) => {
          if (!activeTab.includes("docs") && data.section === 'body' && data.column.index === 5) {
            const val = data.cell.raw as string;
            if (val === 'OK') data.cell.styles.textColor = [34, 197, 94];
            if (val === 'ATENCAO') data.cell.styles.textColor = [245, 158, 11];
            if (val === 'CRITICO') data.cell.styles.textColor = [249, 115, 22];
            if (val === 'VENCIDO') data.cell.styles.textColor = [239, 68, 68];
            data.cell.styles.fontStyle = 'bold';
          }
        }
      });
    }

    doc.save(`Relatorio_${activeTab === "licencas_documentos" ? "Documentacao" : "Frota"}_${format(new Date(), "dd-MM-yyyy")}.pdf`);
  };

  const exportBoardReport = async () => {
    const doc = await generateBoardReportDoc();
    doc.save(`Relatorio_Diretoria_${format(new Date(), "dd-MM-yyyy")}.pdf`);
  };

  const exportFinancialExecutivePDFReport = async () => {
    const doc = new jsPDF({ orientation: 'landscape' });
    const pageWidth = doc.internal.pageSize.getWidth();

    const loadedImg = await loadPDFLogo();

    renderModernPDFHeader(doc, {
      title: `${settings.companyName} - RELATÓRIO EXECUTIVO FINANCEIRO DE ${activeTab === "financeiro_licencas" ? "LICENÇAS" : "DOCUMENTAÇÃO"}`,
      subtitle: `Apresentação para Gerência e Diretoria | Monitoramento de ${activeTab === "financeiro_licencas" ? "Licenciamento" : "Documentação"} (Pagos, Em Aberto e Vencidos)`,
      badgeText: "DIRETORIA FINANCEIRA",
      rightMetaText: `Registros: ${financialStats.totalCount}`,
      loadedImg,
      height: 34
    });

    // 2. Executive Summary Metrics Box (KPIs)
    const totalValue = financialStats.totalVal;
    const paidValue = financialStats.paidVal;
    const openValue = financialStats.openVal;
    const expiredValue = financialStats.expiredVal;

    const totalCount = financialStats.totalCount;
    const paidCount = financialStats.paidCount;
    const openCount = financialStats.openCount;
    const expiredCount = financialStats.expiredCount;

    // Draw KPI Container
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(226, 232, 240);
    doc.roundedRect(14, 38, pageWidth - 28, 28, 3, 3, 'FD');

    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(30, 64, 175);
    doc.text("RESUMO EXECUTIVO DE COMPROMETIMENTO FINANCEIRO", 20, 45);

    const kpiBoxWidth = (pageWidth - 48) / 4;
    const kpiItems = [
      { label: "Total Comprometido", value: formatCurrencyBR(totalValue), sub: `${totalCount} documentos`, color: [30, 64, 175] },
      { label: "Pagos (Quitados)", value: formatCurrencyBR(paidValue), sub: `${paidCount} documentos (${totalValue ? ((paidValue/totalValue)*100).toFixed(1) : 0}%)`, color: [16, 185, 129] },
      { label: "Em Aberto (Ano)", value: formatCurrencyBR(openValue), sub: `${openCount} documentos (${totalValue ? ((openValue/totalValue)*100).toFixed(1) : 0}%)`, color: [37, 99, 235] },
      { label: "Vencidos (Inadimplência)", value: formatCurrencyBR(expiredValue), sub: `${expiredCount} documentos (${totalValue ? ((expiredValue/totalValue)*100).toFixed(1) : 0}%)`, color: [225, 29, 72] }
    ];

    kpiItems.forEach((item, idx) => {
      const x = 20 + (idx * kpiBoxWidth);
      doc.setFontSize(7.5);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(100, 116, 139);
      doc.text(item.label, x, 52);

      doc.setFontSize(11);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(item.color[0], item.color[1], item.color[2]);
      doc.text(item.value, x, 58);

      doc.setFontSize(7);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(148, 163, 184);
      doc.text(item.sub, x, 63);
    });

    const despInfo = getBayerGoDespachanteInfo(filteredFleet);
    const opLabel = (despInfo.operationName || "BAYER").toUpperCase();
    let execTableStartY = 72;
    if (activeTab === "financeiro_licencas" && (despInfo.hasBayerGo || filteredFleet.some(v => (v.operation || "").toUpperCase().includes("BAYER")))) {
      doc.setFillColor(239, 246, 255);
      doc.setDrawColor(191, 219, 254);
      doc.roundedRect(14, 68, pageWidth - 28, 7, 2, 2, 'FD');
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      doc.setTextColor(30, 64, 175);
      doc.text(`PARAMÊTRO OPERACIONAL - CUSTO DESPACHANTE = ${despInfo.formatted} (VALOR POR VEÍCULO)`, 18, 72.5);
      execTableStartY = 78;
    }

    // 3. Consolidated Summary Table
    const statusSummaryHeaders = ["Status Financeiro", "Quantidade de Documentos", "Valor Total (R$)", "% do Comprometido", "Situação Gerencial"];
    const statusSummaryBody = [
      ["PAGO", `${paidCount} documentos`, formatCurrencyBR(paidValue), `${totalValue ? ((paidValue/totalValue)*100).toFixed(1) : 0}%`, "Quitado / Regulamentado"],
      ["EM ABERTO", `${openCount} documentos`, formatCurrencyBR(openValue), `${totalValue ? ((openValue/totalValue)*100).toFixed(1) : 0}%`, "Pendente de Pagamento (No Prazo)"],
      ["VENCIDO", `${expiredCount} documentos`, formatCurrencyBR(expiredValue), `${totalValue ? ((expiredValue/totalValue)*100).toFixed(1) : 0}%`, "Urgente / Risco Operacional"],
      ["TOTAL CONSOLIDADO", `${totalCount} documentos`, formatCurrencyBR(totalValue), "100.0%", "Comprometimento Total"]
    ];

    autoTable(doc, {
      head: [statusSummaryHeaders],
      body: statusSummaryBody,
      startY: execTableStartY,
      styles: { fontSize: 8, cellPadding: 2.5, valign: 'middle' },
      headStyles: { fillColor: [30, 41, 59], textColor: [255, 255, 255], fontStyle: 'bold', halign: 'center' },
      columnStyles: {
        0: { fontStyle: 'bold', cellWidth: 40 },
        1: { halign: 'center', cellWidth: 40 },
        2: { halign: 'right', fontStyle: 'bold', cellWidth: 50 },
        3: { halign: 'center', cellWidth: 40 },
        4: { cellWidth: 'auto' }
      },
      didParseCell: (data) => {
        if (data.row.index === 3 && data.section === 'body') {
          data.cell.styles.fontStyle = 'bold';
          data.cell.styles.fillColor = [241, 245, 249];
        }
        if (data.section === 'body' && data.column.index === 0) {
          if (data.cell.raw === 'PAGO') data.cell.styles.textColor = [16, 185, 129];
          if (data.cell.raw === 'EM ABERTO') data.cell.styles.textColor = [37, 99, 235];
          if (data.cell.raw === 'VENCIDO') data.cell.styles.textColor = [225, 29, 72];
        }
      },
      margin: { left: 14, right: 14 }
    });

    const statusLastY = (doc as any).lastAutoTable ? (doc as any).lastAutoTable.finalY + 8 : 115;

    // 3b. Document Type Summary Table
    const docMapPdf: Record<string, { docName: string; total: number; pago: number; emAberto: number; vencido: number; count: number }> = {};

    filteredFleet.forEach(v => {
      const val = parseCurrencyVal(v.extraData?.["Valor"] || v.extraData?.["VALOR"]);
      let dName = v.extraData?.["Descrição"];
      if (dName === undefined || dName === null || dName === "") {
        const foundKey = Object.keys(v.extraData || {}).find(k => {
          const norm = k.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
          return norm === "descricao" || norm === "documento";
        });
        if (foundKey) dName = v.extraData[foundKey];
      }
      const docTitle = String(dName || "Outros Documentos").trim();

      if (!docMapPdf[docTitle]) {
        docMapPdf[docTitle] = { docName: docTitle, total: 0, pago: 0, emAberto: 0, vencido: 0, count: 0 };
      }
      docMapPdf[docTitle].total += val;
      docMapPdf[docTitle].count += 1;

      if (v.overallStatus === 'pagos') {
        docMapPdf[docTitle].pago += val;
      } else if (v.overallStatus === 'vencido') {
        docMapPdf[docTitle].vencido += val;
      } else {
        docMapPdf[docTitle].emAberto += val;
      }
    });

    const docListPdf = Object.values(docMapPdf).sort((a, b) => b.total - a.total);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(30, 64, 175);
    doc.text("RESUMO FINANCEIRO CONSOLIDADO POR TIPO DE DOCUMENTO", 14, statusLastY);

    const docHeaders = ["Tipo de Documento", "Qtd. Documentos", "Valor Total (R$)", "% Comprometido", "Pago (R$)", "Em Aberto (R$)", "Vencido (R$)"];
    const docBody = docListPdf.map(item => [
      item.docName,
      `${item.count} doc(s)`,
      formatCurrencyBR(item.total),
      `${totalValue ? ((item.total / totalValue) * 100).toFixed(1) : 0}%`,
      formatCurrencyBR(item.pago),
      formatCurrencyBR(item.emAberto),
      formatCurrencyBR(item.vencido)
    ]);

    docBody.push([
      "TOTAL CONSOLIDADO",
      `${totalCount} doc(s)`,
      formatCurrencyBR(totalValue),
      "100.0%",
      formatCurrencyBR(paidValue),
      formatCurrencyBR(openValue),
      formatCurrencyBR(expiredValue)
    ]);

    autoTable(doc, {
      head: [docHeaders],
      body: docBody,
      startY: statusLastY + 4,
      styles: { fontSize: 7.5, cellPadding: 2, valign: 'middle' },
      headStyles: { fillColor: [30, 64, 175], textColor: [255, 255, 255], fontStyle: 'bold', halign: 'center' },
      columnStyles: {
        0: { fontStyle: 'bold', cellWidth: 55 },
        1: { halign: 'center', cellWidth: 25 },
        2: { halign: 'right', fontStyle: 'bold', cellWidth: 35 },
        3: { halign: 'center', cellWidth: 30 },
        4: { halign: 'right', textColor: [16, 185, 129], cellWidth: 35 },
        5: { halign: 'right', textColor: [37, 99, 235], cellWidth: 35 },
        6: { halign: 'right', textColor: [225, 29, 72], fontStyle: 'bold', cellWidth: 'auto' }
      },
      didParseCell: (data) => {
        if (data.row.index === docBody.length - 1 && data.section === 'body') {
          data.cell.styles.fontStyle = 'bold';
          data.cell.styles.fillColor = [241, 245, 249];
        }
      },
      margin: { left: 14, right: 14 }
    });

    const docLastY = (doc as any).lastAutoTable ? (doc as any).lastAutoTable.finalY + 8 : statusLastY + 40;

    // 3c. Monthly Consolidated Table (Values & Plates)
    const monthlyMapPdf: Record<string, {
      key: string;
      label: string;
      sortKey: number;
      totalValue: number;
      paidValue: number;
      openValue: number;
      expiredValue: number;
      platesSet: Set<string>;
      titlesCount: number;
    }> = {};

    filteredFleet.forEach(v => {
      const val = parseCurrencyVal(v.extraData?.["Valor"] || v.extraData?.["VALOR"]);
      const vencStr = v.extraData?.["Vencimento"] || v.extraData?.["VENCIMENTO"] || (v.documents && v.documents[0]?.rawExpiryDate);
      const pagStr = v.extraData?.["Pagamento"] || v.extraData?.["PAGAMENTO"];

      const mInfo = getMonthYearInfo(vencStr || pagStr);
      const mKey = mInfo.key;

      if (!monthlyMapPdf[mKey]) {
        monthlyMapPdf[mKey] = {
          key: mKey,
          label: mInfo.label,
          sortKey: mInfo.sortKey,
          totalValue: 0,
          paidValue: 0,
          openValue: 0,
          expiredValue: 0,
          platesSet: new Set<string>(),
          titlesCount: 0
        };
      }

      monthlyMapPdf[mKey].totalValue += val;
      monthlyMapPdf[mKey].titlesCount += 1;

      const plateOrFleet = (v.plate && v.plate.trim() !== "" && v.plate !== "Vázio") ? v.plate.trim() : (v.fleet ? `Frota ${v.fleet}` : `ID-${v.id}`);
      monthlyMapPdf[mKey].platesSet.add(plateOrFleet);

      if (v.overallStatus === 'pagos' || isPagoDoc(v)) {
        monthlyMapPdf[mKey].paidValue += val;
      } else if (v.overallStatus === 'vencido' || isVencidoDoc(v)) {
        monthlyMapPdf[mKey].expiredValue += val;
      } else {
        monthlyMapPdf[mKey].openValue += val;
      }
    });

    const monthlyListPdf = Object.values(monthlyMapPdf)
      .sort((a, b) => a.sortKey - b.sortKey)
      .map(m => ({
        ...m,
        platesCount: m.platesSet.size > 0 ? m.platesSet.size : m.titlesCount
      }));

    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(30, 64, 175);
    doc.text("DEMONSTRATIVO CONSOLIDADO POR MÊS/ANO (VALORES E DOCUMENTOS)", 14, docLastY);

    const monthlyHeaders = showPlatesCol
      ? ["Mês/Ano", "Qtd. Documentos", "Qtd. Placas/Frotas", "Valor Total (R$)", "Pago (R$)", "Em Aberto (R$)", "Vencido (R$)", "% Comprometido"]
      : ["Mês/Ano", "Qtd. Documentos", "Valor Total (R$)", "Pago (R$)", "Em Aberto (R$)", "Vencido (R$)", "% Comprometido"];

    const monthlyBody = monthlyListPdf.map(item => {
      const row = [
        item.label,
        `${item.titlesCount} doc(s)`
      ];
      if (showPlatesCol) {
        row.push(`${item.platesCount} placas`);
      }
      row.push(
        formatCurrencyBR(item.totalValue),
        formatCurrencyBR(item.paidValue),
        formatCurrencyBR(item.openValue),
        formatCurrencyBR(item.expiredValue),
        `${totalValue ? ((item.totalValue / totalValue) * 100).toFixed(1) : 0}%`
      );
      return row;
    });

    const totalPlatesConsolidated = new Set(filteredFleet.map(v => (v.plate && v.plate.trim() !== "" && v.plate !== "Vázio") ? v.plate.trim() : (v.fleet ? `Frota ${v.fleet}` : `ID-${v.id}`))).size;

    const totalRow = [
      "TOTAL CONSOLIDADO",
      `${filteredFleet.length} doc(s)`
    ];
    if (showPlatesCol) {
      totalRow.push(`${totalPlatesConsolidated} placas`);
    }
    totalRow.push(
      formatCurrencyBR(totalValue),
      formatCurrencyBR(paidValue),
      formatCurrencyBR(openValue),
      formatCurrencyBR(expiredValue),
      "100.0%"
    );

    monthlyBody.push(totalRow);

    const columnStylesMap: any = showPlatesCol ? {
      0: { fontStyle: 'bold', cellWidth: 28, halign: 'center' },
      1: { halign: 'center', cellWidth: 30 },
      2: { halign: 'center', cellWidth: 32 },
      3: { halign: 'right', fontStyle: 'bold', cellWidth: 36 },
      4: { halign: 'right', textColor: [16, 185, 129], cellWidth: 32 },
      5: { halign: 'right', textColor: [37, 99, 235], cellWidth: 32 },
      6: { halign: 'right', textColor: [225, 29, 72], cellWidth: 32 },
      7: { halign: 'center', cellWidth: 'auto' }
    } : {
      0: { fontStyle: 'bold', cellWidth: 35, halign: 'center' },
      1: { halign: 'center', cellWidth: 35 },
      2: { halign: 'right', fontStyle: 'bold', cellWidth: 40 },
      3: { halign: 'right', textColor: [16, 185, 129], cellWidth: 35 },
      4: { halign: 'right', textColor: [37, 99, 235], cellWidth: 35 },
      5: { halign: 'right', textColor: [225, 29, 72], cellWidth: 35 },
      6: { halign: 'center', cellWidth: 'auto' }
    };

    autoTable(doc, {
      head: [monthlyHeaders],
      body: monthlyBody,
      startY: docLastY + 4,
      styles: { fontSize: 7.5, cellPadding: 2, valign: 'middle' },
      headStyles: { fillColor: [30, 64, 175], textColor: [255, 255, 255], fontStyle: 'bold', halign: 'center' },
      columnStyles: columnStylesMap,
      didParseCell: (data) => {
        if (data.row.index === monthlyBody.length - 1 && data.section === 'body') {
          data.cell.styles.fontStyle = 'bold';
          data.cell.styles.fillColor = [241, 245, 249];
        }
      },
      margin: { left: 14, right: 14 }
    });

    let currentY = (doc as any).lastAutoTable ? (doc as any).lastAutoTable.finalY + 8 : docLastY + 40;

    // 3d. Native Graphical Charts in PDF (when includeChartsInPDF is enabled)
    if (includeChartsInPDF && monthlyListPdf.length > 0) {
      const neededChartHeight = 22 + (monthlyListPdf.length * 10);
      if (currentY + neededChartHeight > doc.internal.pageSize.getHeight() - 15) {
        doc.addPage();
        currentY = 20;
      }

      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.setTextColor(30, 64, 175);
      doc.text("GRÁFICOS EXECUTIVOS - VALOR TOTAL E DOCUMENTOS POR MÊS/ANO", 14, currentY);
      currentY += 6;

      const colWidth = (pageWidth - 36) / 2;
      const leftX = 14;
      const rightX = 14 + colWidth + 8;
      const chartBoxHeight = 14 + (monthlyListPdf.length * 10);

      // Background cards
      doc.setFillColor(248, 250, 252);
      doc.setDrawColor(226, 232, 240);
      doc.roundedRect(leftX, currentY, colWidth, chartBoxHeight, 3, 3, 'FD');
      doc.roundedRect(rightX, currentY, colWidth, chartBoxHeight, 3, 3, 'FD');

      // Card Headers
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8.5);
      doc.setTextColor(30, 41, 59);
      doc.text("Valor Total por Mes/Ano", leftX + (colWidth / 2), currentY + 7, { align: 'center' });
      doc.text("Total Documentos por Mes/Ano", rightX + (colWidth / 2), currentY + 7, { align: 'center' });

      let rowY = currentY + 13;
      const maxVal = Math.max(...monthlyListPdf.map(m => m.totalValue), 1);
      const maxDocCount = Math.max(...monthlyListPdf.map(m => m.titlesCount), 1);
      const barMaxW = colWidth - 72;

      monthlyListPdf.forEach(m => {
        // Left Chart: Valor Total
        doc.setFont("helvetica", "bold");
        doc.setFontSize(7);
        doc.setTextColor(71, 85, 105);
        doc.text(m.label, leftX + 15, rowY + 4.5, { align: 'right' });

        doc.setFillColor(226, 232, 240);
        doc.roundedRect(leftX + 17, rowY, barMaxW, 6, 1, 1, 'F');

        const valW = Math.max((m.totalValue / maxVal) * barMaxW, 2);
        doc.setFillColor(139, 92, 246);
        doc.roundedRect(leftX + 17, rowY, valW, 6, 1, 1, 'F');

        const valBadgeText = formatCurrencyBR(m.totalValue);
        doc.setFillColor(243, 232, 255);
        doc.setDrawColor(216, 180, 254);
        doc.roundedRect(leftX + 19 + barMaxW, rowY, 32, 6, 1, 1, 'FD');
        doc.setFont("helvetica", "bold");
        doc.setFontSize(6.5);
        doc.setTextColor(107, 33, 168);
        doc.text(valBadgeText, leftX + 35 + barMaxW, rowY + 4.2, { align: 'center' });

        // Right Chart: Total Documentos
        doc.setFont("helvetica", "bold");
        doc.setFontSize(7);
        doc.setTextColor(71, 85, 105);
        doc.text(m.label, rightX + 15, rowY + 4.5, { align: 'right' });

        doc.setFillColor(226, 232, 240);
        doc.roundedRect(rightX + 17, rowY, barMaxW, 6, 1, 1, 'F');

        const docW = Math.max((m.titlesCount / maxDocCount) * barMaxW, 2);
        doc.setFillColor(139, 92, 246);
        doc.roundedRect(rightX + 17, rowY, docW, 6, 1, 1, 'F');

        const docBadgeText = `${m.titlesCount}`;
        doc.setFillColor(243, 232, 255);
        doc.setDrawColor(216, 180, 254);
        doc.roundedRect(rightX + 19 + barMaxW, rowY, 18, 6, 1, 1, 'FD');
        doc.setFont("helvetica", "bold");
        doc.setFontSize(7);
        doc.setTextColor(107, 33, 168);
        doc.text(docBadgeText, rightX + 28 + barMaxW, rowY + 4.2, { align: 'center' });

        rowY += 9;
      });

      currentY = rowY + 6;
    }

    const lastY = currentY;

    // 4. Detailed Financial Table
    if (activeTab === "financeiro_licencas") {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.setTextColor(30, 64, 175);
      doc.text("RELAÇÃO DETALHADA DE VALIDADE DE LICENÇAS E CUSTOS POR VEÍCULO", 14, lastY);

      const maxColsPerChunk = 6;
      const chunks: typeof interleavedDetailedColumns[] = [];
      if (interleavedDetailedColumns.length === 0) {
        chunks.push([]);
      } else {
        for (let i = 0; i < interleavedDetailedColumns.length; i += maxColsPerChunk) {
          chunks.push(interleavedDetailedColumns.slice(i, i + maxColsPerChunk));
        }
      }

      let currentStartY = lastY + 4;

      chunks.forEach((chunk, chunkIdx) => {
        if (chunkIdx > 0) {
          doc.addPage();
          currentStartY = 20;
          doc.setFont("helvetica", "bold");
          doc.setFontSize(10);
          doc.setTextColor(30, 64, 175);
          doc.text(`RELAÇÃO DETALHADA DE LICENÇAS E CUSTOS (Parte ${chunkIdx + 1} de ${chunks.length})`, 14, currentStartY);
          currentStartY += 6;
        }

        const tableHeaders = ["Frota", "Placa", "Operação", "Motorista", "Banheiro"];
        const chunkHeaders = chunk.map(col => {
          if (col.type === "document") {
            const valStr = getLegalValidityPeriod(col.name, col.validity);
            return `${col.name}\n(Val: ${valStr})`;
          } else {
            return col.name;
          }
        });
        const headers = [...tableHeaders, ...chunkHeaders];

        const tableBody = filteredFleet.map(v => {
          const row = [
            String(v.fleet || "-"),
            String(v.plate || "-"),
            String(v.operation === "DOC_SISTEMA" ? "GLOBUS" : (v.operation || "-")),
            String(v.driver || "-"),
            String(v.hasBathroom || "-")
          ];

          chunk.forEach(col => {
            if (col.type === "document") {
              const d = v.documents.find(doc => doc.type === col.name);
              row.push(d ? d.expiryDate : "-");
            } else {
              const rawVal = v.extraData?.[col.name];
              const numVal = parseCurrencyVal(rawVal);
              row.push(numVal > 0 ? formatCurrencyBR(numVal) : (rawVal || "-"));
            }
          });

          return row;
        });

        const columnStyles: any = {
          0: { cellWidth: 12, halign: 'center' },
          1: { cellWidth: 16, halign: 'center', fontStyle: 'bold' },
          2: { cellWidth: 22, halign: 'center' },
          3: { cellWidth: 30 },
          4: { cellWidth: 14, halign: 'center' }
        };

        for (let i = 0; i < chunk.length; i++) {
          const isDoc = chunk[i].type === "document";
          columnStyles[5 + i] = {
            cellWidth: 'auto',
            halign: 'center',
            fontStyle: isDoc ? 'normal' : 'bold'
          };
        }

        autoTable(doc, {
          head: [headers],
          body: tableBody,
          startY: currentStartY,
          styles: { fontSize: 6.5, cellPadding: 1.5, overflow: 'linebreak', valign: 'middle' },
          headStyles: { fillColor: [30, 64, 175], textColor: [255, 255, 255], fontStyle: 'bold', halign: 'center', minCellHeight: 8 },
          columnStyles: columnStyles,
          alternateRowStyles: { fillColor: [248, 250, 252] },
          margin: { left: 14, right: 14 },
          didParseCell: (data) => {
            if (data.section === 'body' && data.column.index >= 5) {
              const chunkColIdx = data.column.index - 5;
              const colSpec = chunk[chunkColIdx];
              if (colSpec) {
                if (colSpec.type === "document") {
                  const rawVal = data.cell.raw as string;
                  if (rawVal && rawVal !== "-") {
                    data.cell.styles.fontStyle = 'bold';
                    if (rawVal.includes('/')) {
                      data.cell.styles.textColor = [16, 185, 129];
                    }
                  }
                } else if (colSpec.type === "financial") {
                  const rawVal = data.cell.raw as string;
                  if (rawVal && rawVal !== "-") {
                    data.cell.styles.textColor = [5, 150, 105];
                    data.cell.styles.fontStyle = 'bold';
                  }
                }
              }
            }
          }
        });

        currentStartY = (doc as any).lastAutoTable ? (doc as any).lastAutoTable.finalY + 8 : currentStartY + 40;
      });
    } else {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.setTextColor(30, 64, 175);
      doc.text("RELAÇÃO DETALHADA DE DOCUMENTOS", 14, lastY);

      const detailHeaders = ["Frota", "Placa", "Pedido", "Documento", "Vencimento", "Pagamento", "Razão Social / Credor", "Descrição", "Parcela", "Valor (R$)", "Status"];
      
      const detailBody = filteredFleet.map(v => {
        const getVal = (col: string) => {
          let val = v.extraData?.[col];
          if (val === undefined || val === null || val === "") {
            const normalizedCol = col.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
            const foundKey = Object.keys(v.extraData || {}).find(k => 
              k.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim() === normalizedCol
            );
            if (foundKey) val = v.extraData[foundKey];
          }
          return val;
        };

        const frota = String(v.fleet || "-");
        const placa = String(v.plate || "-");
        const pedido = String(getVal("Pedido") || "-");
        const docNum = String(getVal("Documento") || getVal("Doc") || getVal("Nº Documento") || "-");
        const venc = formatBRDate(getVal("Vencimento") || "-");
        const pag = formatBRDate(getVal("Pagamento") || "-");
        const razao = String(getVal("Razão Social") || "-");
        let desc = String(getVal("Descrição") || "-");
        if (desc.length > 25) desc = desc.substring(0, 23) + "..";
        const parcela = String(getVal("Parcela") || "-");
        const valRaw = getVal("Valor");
        const valorNum = parseCurrencyVal(valRaw);
        const valorFormatted = valorNum > 0 ? formatCurrencyBR(valorNum) : String(valRaw || "-");

        let stText = "EM ABERTO";
        if (v.overallStatus === 'pagos') stText = "PAGO";
        else if (v.overallStatus === 'vencido') stText = "VENCIDO";
        else if (isEmAbertoDoc(v)) stText = "EM ABERTO";

        return [frota, placa, pedido, docNum, venc, pag, razao.length > 18 ? razao.substring(0, 16) + ".." : razao, desc, parcela, valorFormatted, stText];
      });

      autoTable(doc, {
        head: [detailHeaders],
        body: detailBody,
        startY: lastY + 4,
        styles: { fontSize: 6.5, cellPadding: 1.5, overflow: 'linebreak', valign: 'middle' },
        headStyles: { fillColor: [30, 64, 175], textColor: [255, 255, 255], fontStyle: 'bold', halign: 'center' },
        columnStyles: {
          0: { cellWidth: 12, halign: 'center' },
          1: { cellWidth: 15, halign: 'center' },
          2: { cellWidth: 15, halign: 'center' },
          3: { cellWidth: 16, halign: 'center' },
          4: { cellWidth: 16, halign: 'center' },
          5: { cellWidth: 16, halign: 'center' },
          6: { cellWidth: 32 },
          7: { cellWidth: 32 },
          8: { cellWidth: 12, halign: 'center' },
          9: { cellWidth: 22, halign: 'right', fontStyle: 'bold' },
          10: { cellWidth: 20, halign: 'center', fontStyle: 'bold' }
        },
        alternateRowStyles: { fillColor: [248, 250, 252] },
        margin: { left: 14, right: 14 },
        didParseCell: (data) => {
          if (data.section === 'body' && data.column.index === 10) {
            const val = data.cell.raw as string;
            if (val === 'PAGO') data.cell.styles.textColor = [16, 185, 129];
            if (val === 'EM ABERTO') data.cell.styles.textColor = [37, 99, 235];
            if (val === 'VENCIDO') data.cell.styles.textColor = [225, 29, 72];
          }
        }
      });
    }

    // 5. Page Numbers & Executive Signature Footer
    const pageCount = (doc as any).internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      
      if (i === pageCount) {
        // Add Signatures box on last page
        const finalY = doc.internal.pageSize.getHeight() - 18;
        doc.setFontSize(8);
        doc.setLineWidth(0.3);
        doc.setDrawColor(203, 213, 225);
        
        doc.line(30, finalY - 4, 110, finalY - 4);
        doc.text("Gerência de Operações & Frota", 70, finalY, { align: "center" });

        doc.line(pageWidth - 110, finalY - 4, pageWidth - 30, finalY - 4);
        doc.text("Diretoria Executiva / Financeira", pageWidth - 70, finalY, { align: "center" });
      }

      doc.setFontSize(8);
      doc.setTextColor(148, 163, 184);
      doc.text(`LogiFleet - Relatório Executivo Financeiro | Página ${i} de ${pageCount}`, pageWidth / 2, doc.internal.pageSize.getHeight() - 6, { align: "center" });
    }

    doc.save(`Relatorio_Financeiro_Diretoria_${format(new Date(), "dd-MM-yyyy")}.pdf`);
  };

  const exportAlertsPDF = async (sourceFilter?: "LICENCAS" | "DOCUMENTACAO", customIncludeSummaries?: boolean) => {
    const shouldIncludeSummaries = customIncludeSummaries !== undefined ? customIncludeSummaries : includePdfSummaries;
    const isDocReport = sourceFilter === "DOCUMENTACAO";
    const doc = new jsPDF({ orientation: 'landscape' });
    const pageWidth = doc.internal.pageSize.getWidth();

    const loadedImg = await loadPDFLogo();

    const title = sourceFilter === "LICENCAS" ? "RELATÓRIO DE ALERTAS - LICENÇAS" : 
                  sourceFilter === "DOCUMENTACAO" ? "RELATÓRIO DE ALERTAS - DOCUMENTAÇÃO" : 
                  "RELATÓRIO DE ALERTAS RECENTES";

    const subtitle = sourceFilter === "LICENCAS"
      ? "Monitoramento de Prazos Legais, Regularidade e Vencimentos de Licenças"
      : sourceFilter === "DOCUMENTACAO"
      ? "Monitoramento de Documentação Operacional, Vencimentos e Conformidade"
      : "Monitoramento Integrado de Conformidade e Prazos Operacionais da Frota";

    const baseFleet = sourceFilter === "DOCUMENTACAO" ? filteredDashboardDocFleet : 
                      sourceFilter === "LICENCAS" ? filteredDashboardLicFleet :
                      [...filteredDashboardLicFleet, ...filteredDashboardDocFleet];
    const alertsRaw = baseFleet
      .flatMap(v => v.documents.map(d => ({ ...d, vehicle: v })))
      .filter(d => d.status !== 'ok' && d.status !== 'pagos' && !isDespachanteType(d.type) && !d.type.toUpperCase().includes('TX INSP TACOGRAFO'))
      .sort((a, b) => {
        const priority = { vencido: 0, critico: 1, atencao: 2, ok: 3 };
        return priority[a.status] - priority[b.status] || a.daysRemaining - b.daysRemaining;
      });

    const formatAlertOp = (op?: string) => {
      if (!op) return "-";
      const trimmed = op.trim();
      if (trimmed === "DOC_SISTEMA") return "GLOBUS";
      const upper = trimmed.toUpperCase();
      if (upper === "CITROSUCO - SÃO PAULO" || upper === "CITROSUCO - SAO PAULO" || upper === "CITROSUCO-SP" || (upper.includes("CITROSUCO") && (upper.includes("SÃO PAULO") || upper.includes("SAO PAULO") || upper.endsWith("- SP") || upper.endsWith("-SP")))) {
        return "CITROSUCO-SP";
      }
      if (upper === "CITROSUCO - UBERLANDIA" || upper === "CITROSUCO - UBERLÂNDIA" || upper === "CITROSUCO-MG" || (upper.includes("CITROSUCO") && (upper.includes("UBERLANDIA") || upper.includes("UBERLÂNDIA") || upper.endsWith("- MG") || upper.endsWith("-MG")))) {
        return "CITROSUCO-MG";
      }
      return op;
    };

    const formatDocType = (type: string) => {
      if (!type) return "";
      const trimmed = type.trim();
      if (trimmed.toUpperCase() === "LICENCIAMENTOS DA FROTA" || trimmed.toUpperCase() === "LICENCIAMENTO DA FROTA") {
        return "LICENCIAMENTO";
      }
      return trimmed;
    };

    const alertsData = alertsRaw.map(alert => {
      const extra = alert.vehicle?.extraData || {};
      const obs = String(extra["Observações"] || extra["OBSERVACOES"] || extra["OBS"] || extra["Observação"] || "").trim();
      const pedMatch = obs.match(/PEDIDO\s*[:\-#]?\s*([0-9]{4,8})/i);
      const docVal = String(extra["Documento"] || extra["DOC"] || extra["Doc"] || "").trim();
      const pedido = String(extra["Pedido"] || (pedMatch ? pedMatch[1] : (/^[0-9]{4,8}$/.test(docVal) ? docVal : ""))).trim();

      let plate = alert.vehicle.plate || "";
      let fleet = alert.vehicle.fleet || "";

      // Quando no campo/coluna observações não localizar a frota/placa, inserir o pedido para não trazer o resultado em branco e facilitar a consulta
      if (!plate && !fleet && pedido) {
        plate = `PED. ${pedido}`;
        fleet = pedido;
      } else if (!plate && pedido) {
        plate = `PED. ${pedido}`;
      } else if (!fleet && pedido) {
        fleet = pedido;
      }

      const docType = isDocReport ? formatDocType(alert.type) : alert.type;

      if (isDocReport) {
        let obsTrunc = obs;
        if (obsTrunc.length > 140) {
          obsTrunc = obsTrunc.substring(0, 137) + "...";
        }
        return [
          docType,
          plate || (pedido ? `PED. ${pedido}` : "-"),
          fleet || (pedido ? pedido : "-"),
          alert.status.toUpperCase(),
          alert.daysRemaining === 999 ? "N/A" : (alert.daysRemaining < 0 ? `Há ${Math.abs(alert.daysRemaining)} dias` : `Em ${alert.daysRemaining} dias`),
          alert.expiryDate,
          obsTrunc || "-"
        ];
      }

      return [
        docType,
        formatAlertOp(alert.vehicle.operation),
        plate || (pedido ? `PED. ${pedido}` : "-"),
        fleet || (pedido ? pedido : "-"),
        alert.status.toUpperCase(),
        alert.daysRemaining === 999 ? "N/A" : (alert.daysRemaining < 0 ? `Há ${Math.abs(alert.daysRemaining)} dias` : `Em ${alert.daysRemaining} dias`),
        alert.expiryDate
      ];
    });

    // Render modern executive header on Page 1 (Never overlaps the logo)
    renderModernPDFHeader(doc, {
      title,
      subtitle,
      badgeText: "CONFORMIDADE & ALERTAS",
      rightMetaText: `Total de Alertas: ${alertsData.length}`,
      loadedImg,
      height: 36
    });

    const despInfo = getBayerGoDespachanteInfo(baseFleet);
    let alertsStartY = 40;
    if (sourceFilter !== "DOCUMENTACAO" && (despInfo.hasBayerGo || baseFleet.some(v => (v.operation || "").toUpperCase().includes("BAYER")))) {
      doc.setFillColor(239, 246, 255);
      doc.setDrawColor(191, 219, 254);
      doc.roundedRect(14, 39, pageWidth - 28, 6.5, 2, 2, 'FD');
      doc.setFont("helvetica", "bold");
      doc.setFontSize(7.5);
      doc.setTextColor(26, 54, 138);
      doc.text(`PARAMÊTRO OPERACIONAL - CUSTO DESPACHANTE = ${despInfo.formatted} (VALOR POR VEÍCULO)`, 18, 43.5);
      alertsStartY = 48;
    }

    let tableStartY = alertsStartY + 2;

    if (shouldIncludeSummaries) {
      // 1. Resumo Visual de Status (Vencidos, Críticos, Em Atenção, Total)
      const vencidosCount = alertsRaw.filter(a => a.status === 'vencido').length;
      const criticosCount = alertsRaw.filter(a => a.status === 'critico').length;
      const atencaoCount = alertsRaw.filter(a => a.status === 'atencao').length;
      const totalCount = alertsRaw.length;

      const startX = 14;
      const availableWidth = pageWidth - 28;
      const cardGap = 3;
      const cardW = (availableWidth - (3 * cardGap)) / 4;
      const statusCards = [
        { label: "VENCIDOS", count: vencidosCount, color: [220, 38, 38], bg: [254, 242, 242], border: [254, 202, 202] },
        { label: "CRÍTICOS (ATÉ 7D)", count: criticosCount, color: [234, 88, 12], bg: [255, 247, 237], border: [254, 215, 170] },
        { label: "EM ATENÇÃO (ATÉ 30D)", count: atencaoCount, color: [202, 138, 4], bg: [254, 252, 232], border: [254, 240, 138] },
        { label: "TOTAL PENDENTE", count: totalCount, color: [26, 54, 138], bg: [239, 246, 255], border: [191, 219, 254] }
      ];

      statusCards.forEach((c, idx) => {
        const cx = startX + idx * (cardW + cardGap);
        doc.setFillColor(c.bg[0], c.bg[1], c.bg[2]);
        doc.setDrawColor(c.border[0], c.border[1], c.border[2]);
        doc.roundedRect(cx, alertsStartY, cardW, 13.5, 2, 2, 'FD');
        
        doc.setFont("helvetica", "bold");
        doc.setFontSize(13);
        doc.setTextColor(c.color[0], c.color[1], c.color[2]);
        doc.text(String(c.count), cx + cardW / 2, alertsStartY + 6, { align: "center" });

        doc.setFontSize(6.5);
        doc.text(c.label, cx + cardW / 2, alertsStartY + 11, { align: "center" });
      });

      // 2. Resumo Visual por Tipo de Licença / Documento e Quantidades
      const typeCountMap: Record<string, number> = {};
      alertsRaw.forEach(a => {
        const displayType = isDocReport ? formatDocType(a.type) : a.type;
        typeCountMap[displayType] = (typeCountMap[displayType] || 0) + 1;
      });
      const sortedTypes = Object.entries(typeCountMap).sort((a, b) => b[1] - a[1]);

      let curX = startX;
      let curY = alertsStartY + 18.5;
      const chipH = 6;
      const chipGap = 2.5;

      doc.setFont("helvetica", "bold");
      doc.setFontSize(7);
      doc.setTextColor(71, 85, 105);
      const typeSectionTitle = sourceFilter === "LICENCAS" ? "QUANTIDADE POR TIPO DE LICENÇA:" : "QUANTIDADE POR TIPO DE DOCUMENTO:";
      doc.text(typeSectionTitle, startX, curY - 2);

      sortedTypes.forEach(([typeName, count]) => {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(7);
        const text = `${typeName}: `;
        const textW = doc.getTextWidth(text);
        
        doc.setFont("helvetica", "bold");
        const countStr = String(count);
        const countW = doc.getTextWidth(countStr);
        
        const chipW = textW + countW + 6;
        if (curX + chipW > startX + availableWidth) {
          curX = startX;
          curY += chipH + 2;
        }

        doc.setFillColor(241, 245, 249);
        doc.setDrawColor(203, 213, 225);
        doc.roundedRect(curX, curY, chipW, chipH, 1.5, 1.5, 'FD');

        doc.setFont("helvetica", "normal");
        doc.setFontSize(7);
        doc.setTextColor(51, 65, 85);
        doc.text(text, curX + 2.5, curY + 4.2);

        doc.setFont("helvetica", "bold");
        doc.setTextColor(26, 54, 138);
        doc.text(countStr, curX + 2.5 + textW, curY + 4.2);

        curX += chipW + chipGap;
      });

      tableStartY = curY + chipH + 4;
    }

    const docHead = [["Documento", "Placa", "Frota", "Status", "Prazo", "Vencimento", "Observações"]];
    const defaultHead = [["Documento", "Operação", "Placa", "Frota", "Status", "Prazo", "Vencimento"]];

    autoTable(doc, {
      head: isDocReport ? docHead : defaultHead,
      body: alertsData,
      startY: tableStartY,
      theme: 'grid',
      headStyles: { fillColor: [26, 54, 138], textColor: [255, 255, 255], fontStyle: 'bold' },
      styles: { fontSize: isDocReport ? 7.5 : 8, cellPadding: 2 },
      margin: { left: 14, right: 14 },
      columnStyles: isDocReport ? {
        0: { cellWidth: 38 }, // Documento
        1: { cellWidth: 26 }, // Placa
        2: { cellWidth: 20 }, // Frota
        3: { cellWidth: 24 }, // Status
        4: { cellWidth: 26 }, // Prazo
        5: { cellWidth: 26 }, // Vencimento
        6: { cellWidth: 'auto' } // Observações
      } : {
        0: { cellWidth: 50 }, // Documento
        1: { cellWidth: 38 }, // Operação
        2: { cellWidth: 32 }, // Placa
        3: { cellWidth: 24 }, // Frota
        4: { cellWidth: 30 }, // Status
        5: { cellWidth: 45 }, // Prazo
        6: { cellWidth: 50 }  // Vencimento
      },
      didParseCell: (data) => {
        const statusColIdx = isDocReport ? 3 : 4;
        if (data.section === 'body' && data.column.index === statusColIdx) {
          const status = data.cell.raw as string;
          if (status === 'VENCIDO') data.cell.styles.textColor = [239, 68, 68];
          if (status === 'CRITICO') data.cell.styles.textColor = [249, 115, 22];
          if (status === 'ATENCAO') data.cell.styles.textColor = [245, 158, 11];
        }
      }
    });

    if (sourceFilter === "LICENCAS") {
      doc.addPage();
      
      const financialRows: any[][] = [];
      const baseFleetLic = filteredDashboardLicFleet;
      
      const licAlerts = baseFleetLic
        .flatMap(v => v.documents.map(d => ({ ...d, vehicle: v })))
        .filter(d => d.status !== 'ok' && d.status !== 'pagos' && !isDespachanteType(d.type) && !d.type.toUpperCase().includes('TX INSP TACOGRAFO'))
        .sort((a, b) => {
          const priority = { vencido: 0, critico: 1, atencao: 2, ok: 3 };
          return priority[a.status] - priority[b.status] || a.daysRemaining - b.daysRemaining;
        });

      licAlerts.forEach(alert => {
        const associatedFinCols = getAssociatedFinancials(alert.type, financialColumns)
          .filter(c => !isDespachanteType(c) && !c.toUpperCase().includes('TX INSP TACOGRAFO'));
        
        if (associatedFinCols.length === 0) {
          financialRows.push([
            alert.type,
            formatAlertOp(alert.vehicle.operation),
            alert.vehicle.plate,
            alert.vehicle.fleet,
            alert.status.toUpperCase(),
            "Sem item financeiro vinculado",
            "-"
          ]);
        } else {
          associatedFinCols.forEach(finCol => {
            const rawValue = alert.vehicle.extraData?.[finCol];
            const hasCost = rawValue !== undefined && rawValue !== null && String(rawValue).trim() !== "" && String(rawValue).trim() !== "-";
            const displayValue = hasCost ? String(rawValue).trim() : "-";
            const displayFinCol = hasCost ? finCol : " - ";
            
            financialRows.push([
              alert.type,
              formatAlertOp(alert.vehicle.operation),
              alert.vehicle.plate,
              alert.vehicle.fleet,
              alert.status.toUpperCase(),
              displayFinCol,
              displayValue
            ]);
          });
        }
      });

      // Render modern executive header on Page 2
      renderModernPDFHeader(doc, {
        title: "CUSTOS E TAXAS DE LICENÇAS PENDENTES",
        subtitle: "Detalhamento Financeiro de Taxas, Custos e Regularização",
        badgeText: "GESTÃO FINANCEIRA",
        rightMetaText: `Total de Itens: ${financialRows.length}`,
        loadedImg,
        height: 36
      });

      let p2TableStartY = 42;

      if (shouldIncludeSummaries) {
        // 1. Resumo Visual Financeiro (Valores por Status)
        let totalFinancialVal = 0;
        let vencidoFinancialVal = 0;
        let criticoFinancialVal = 0;
        let atencaoFinancialVal = 0;
        const typeFinMap: Record<string, { totalVal: number; count: number }> = {};

        financialRows.forEach(r => {
          const num = parseCurrencyVal(r[6]);
          const st = String(r[4]).toUpperCase();
          const type = String(r[0]);

          if (num > 0) {
            totalFinancialVal += num;
            if (st === 'VENCIDO') vencidoFinancialVal += num;
            else if (st === 'CRITICO') criticoFinancialVal += num;
            else if (st === 'ATENCAO') atencaoFinancialVal += num;
          }

          if (!typeFinMap[type]) {
            typeFinMap[type] = { totalVal: 0, count: 0 };
          }
          typeFinMap[type].count += 1;
          if (num > 0) {
            typeFinMap[type].totalVal += num;
          }
        });
        const sortedTypeFin = Object.entries(typeFinMap).sort((a, b) => b[1].totalVal - a[1].totalVal || b[1].count - a[1].count);

        const p2StartX = 14;
        const p2AvailableWidth = pageWidth - 28;
        const p2CardGap = 3;
        const p2CardW = (p2AvailableWidth - (3 * p2CardGap)) / 4;
        const p2CardsY = 39;

        const p2FinCards = [
          { label: "VALOR TOTAL PENDENTE", value: formatCurrencyBR(totalFinancialVal), color: [26, 54, 138], bg: [239, 246, 255], border: [191, 219, 254] },
          { label: "VALOR VENCIDOS", value: formatCurrencyBR(vencidoFinancialVal), color: [220, 38, 38], bg: [254, 242, 242], border: [254, 202, 202] },
          { label: "VALOR CRÍTICOS (ATÉ 7D)", value: formatCurrencyBR(criticoFinancialVal), color: [234, 88, 12], bg: [255, 247, 237], border: [254, 215, 170] },
          { label: "VALOR EM ATENÇÃO", value: formatCurrencyBR(atencaoFinancialVal), color: [202, 138, 4], bg: [254, 252, 232], border: [254, 240, 138] }
        ];

        p2FinCards.forEach((c, idx) => {
          const cx = p2StartX + idx * (p2CardW + p2CardGap);
          doc.setFillColor(c.bg[0], c.bg[1], c.bg[2]);
          doc.setDrawColor(c.border[0], c.border[1], c.border[2]);
          doc.roundedRect(cx, p2CardsY, p2CardW, 13.5, 2, 2, 'FD');

          doc.setFont("helvetica", "bold");
          doc.setFontSize(9.5);
          doc.setTextColor(c.color[0], c.color[1], c.color[2]);
          doc.text(c.value, cx + p2CardW / 2, p2CardsY + 6, { align: "center" });

          doc.setFontSize(6.5);
          doc.text(c.label, cx + p2CardW / 2, p2CardsY + 11, { align: "center" });
        });

        // 2. Resumo Visual Financeiro por Tipo de Licença
        let p2CurX = p2StartX;
        let p2CurY = p2CardsY + 18.5;
        const p2ChipH = 6;
        const p2ChipGap = 2.5;

        doc.setFont("helvetica", "bold");
        doc.setFontSize(7);
        doc.setTextColor(71, 85, 105);
        doc.text("VALORES E QUANTIDADES POR TIPO DE LICENÇA:", p2StartX, p2CurY - 2);

        sortedTypeFin.forEach(([typeName, data]) => {
          doc.setFont("helvetica", "normal");
          doc.setFontSize(7);
          const text = `${typeName}: `;
          const textW = doc.getTextWidth(text);

          doc.setFont("helvetica", "bold");
          const valStr = data.totalVal > 0 ? `${formatCurrencyBR(data.totalVal)} (${data.count})` : `- (${data.count})`;
          const valW = doc.getTextWidth(valStr);

          const chipW = textW + valW + 6;
          if (p2CurX + chipW > p2StartX + p2AvailableWidth) {
            p2CurX = p2StartX;
            p2CurY += p2ChipH + 2;
          }

          doc.setFillColor(241, 245, 249);
          doc.setDrawColor(203, 213, 225);
          doc.roundedRect(p2CurX, p2CurY, chipW, p2ChipH, 1.5, 1.5, 'FD');

          doc.setFont("helvetica", "normal");
          doc.setFontSize(7);
          doc.setTextColor(51, 65, 85);
          doc.text(text, p2CurX + 2.5, p2CurY + 4.2);

          doc.setFont("helvetica", "bold");
          doc.setTextColor(16, 124, 65);
          doc.text(valStr, p2CurX + 2.5 + textW, p2CurY + 4.2);

          p2CurX += chipW + p2ChipGap;
        });

        p2TableStartY = p2CurY + p2ChipH + 4;
      }

      autoTable(doc, {
        head: [["Documento", "Operação", "Placa", "Frota", "Status", "Item Financeiro", "Valor / Custo"]],
        body: financialRows,
        startY: p2TableStartY,
        theme: 'grid',
        headStyles: { fillColor: [26, 54, 138], textColor: [255, 255, 255], fontStyle: 'bold' },
        styles: { fontSize: 8, cellPadding: 2 },
        margin: { left: 14, right: 14 },
        columnStyles: {
          0: { cellWidth: 50 }, // Documento
          1: { cellWidth: 38 }, // Operação
          2: { cellWidth: 32 }, // Placa
          3: { cellWidth: 24 }, // Frota
          4: { cellWidth: 30 }, // Status
          5: { cellWidth: 55 }, // Item Financeiro
          6: { cellWidth: 40 }  // Valor / Custo
        },
        didParseCell: (data) => {
          if (data.section === 'body' && data.column.index === 4) {
            const status = data.cell.raw as string;
            if (status === 'VENCIDO') data.cell.styles.textColor = [239, 68, 68];
            if (status === 'CRITICO') data.cell.styles.textColor = [249, 115, 22];
            if (status === 'ATENCAO') data.cell.styles.textColor = [245, 158, 11];
          }
          if (data.section === 'body' && data.column.index === 6) {
            data.cell.styles.fontStyle = 'bold';
            data.cell.styles.textColor = [16, 124, 65]; // Green for financial values
          }
        }
      });
    }

    const pageCount = (doc.internal as any).getNumberOfPages ? (doc.internal as any).getNumberOfPages() : doc.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      const pW = doc.internal.pageSize.getWidth();
      const pH = doc.internal.pageSize.getHeight();
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(148, 163, 184);
      doc.text(`LogiFleet - ${title} | Página ${i} de ${pageCount}`, pW / 2, pH - 6, { align: "center" });
    }

    return doc;
  };

  const handleExportAlerts = async (sourceFilter?: "LICENCAS" | "DOCUMENTACAO", customIncludeSummaries?: boolean) => {
    const doc = await exportAlertsPDF(sourceFilter, customIncludeSummaries);
    const fileName = sourceFilter === "LICENCAS" ? "Alertas_Licencas" : 
                     sourceFilter === "DOCUMENTACAO" ? "Alertas_Documentacao" : "Alertas_Recentes";
    doc.save(`${fileName}_${format(new Date(), "dd-MM-yyyy")}.pdf`);
  };

  const handlePrintAlerts = async (sourceFilter?: "LICENCAS" | "DOCUMENTACAO", customIncludeSummaries?: boolean) => {
    const doc = await exportAlertsPDF(sourceFilter, customIncludeSummaries);
    doc.autoPrint();
    window.open(doc.output('bloburl'), '_blank');
  };

  const handlePrint = () => {
    window.print();
  };

  const handleShareEmail = async (driveLink?: string) => {
    if (!settings.notifications.email) {
      return;
    }

    // If we have a PDF and SendGrid is configured, we can send it via API
    try {
      const doc = await generateBoardReportDoc();
      const pdfBase64 = doc.output('datauristring');
      const fileName = `Relatorio_Diretoria_${format(new Date(), "dd-MM-yyyy")}.pdf`;

      const response = await fetch("/api/send-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pdfBase64,
          fileName,
          recipients: settings.notificationEmails,
          driveLink
        })
      });

      const contentType = response.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) {
        throw new Error("O servidor ainda está iniciando.");
      }

      if (response.ok) {
        alert("E-mail enviado com sucesso via SendGrid!");
        return;
      }
    } catch (error) {
      console.error("Error sending via SendGrid, falling back to mailto:", error);
    }

    // Fallback to mailto if SendGrid fails or isn't configured
    const subject = encodeURIComponent(`Relatório Executivo de Frota - ${settings.companyName}`);
    const body = encodeURIComponent(`Olá,\n\nSegue o relatório executivo da frota e conformidade atualizado em ${format(getAdjustedDate(), "dd/MM/yyyy HH:mm")}.${driveLink ? `\n\nLink do Google Drive: ${driveLink}` : ''}\n\nResumo:\n- Total Veículos: ${stats.totalVehicles}\n- Pendências Críticas/Vencidas: ${stats.expiredDocs + stats.expiringDocs}\n\nAtenciosamente,\nEquipe de Gestão de Frota`);
    
    const emails = settings.notificationEmails?.join(',') || '';
    window.location.href = `mailto:${emails}?subject=${subject}&body=${body}`;
  };

  const handleShareWhatsApp = (driveLink?: string) => {
    if (!settings.notifications.whatsapp) {
      return;
    }
    const text = encodeURIComponent(`*Relatório Executivo de Frota - ${settings.companyName}*\n\nData: ${format(getAdjustedDate(), "dd/MM/yyyy HH:mm")}\n\n*Resumo:*\n- Total Veículos: ${stats.totalVehicles}\n- Pendências Críticas/Vencidas: ${stats.expiredDocs + stats.expiringDocs}\n\n${driveLink ? `*Link do Relatório:* ${driveLink}\n\n` : ''}_Gerado pelo sistema LogiFleet_`);
    
    const firstWhatsapp = settings.notificationWhatsapps?.[0] || '';
    window.open(`https://wa.me/${firstWhatsapp}?text=${text}`, '_blank');
    
    if (settings.notificationWhatsapps?.length > 1) {
      alert(`O resumo foi preparado para o primeiro contato. Para os outros ${settings.notificationWhatsapps.length - 1} contatos, utilize o disparo manual.`);
    }
  };

  const handleManualTrigger = (driveLink?: string) => {
    if (!settings.notifications.email && !settings.notifications.whatsapp) {
      return;
    }

    if (settings.notifications.email) {
      handleShareEmail(driveLink);
    }
    
    if (settings.notifications.whatsapp) {
      settings.notificationWhatsapps?.forEach((num, index) => {
        setTimeout(() => {
          const text = encodeURIComponent(`*Relatório Executivo de Frota - ${settings.companyName}*\n\nData: ${format(getAdjustedDate(), "dd/MM/yyyy HH:mm")}\n\n*Resumo:*\n- Total Veículos: ${stats.totalVehicles}\n- Pendências Críticas/Vencidas: ${stats.expiredDocs + stats.expiringDocs}\n\n${driveLink ? `*Link do Relatório:* ${driveLink}\n\n` : ''}_Gerado pelo sistema LogiFleet_`);
          window.open(`https://wa.me/${num}?text=${text}`, '_blank');
        }, (index + 1) * 1000);
      });
    }
  };

  const handleAutoSendPDF = async () => {
    // 1. Generate PDF and Upload to Drive if connected
    let driveLink = undefined;
    if (isGoogleConnected) {
      driveLink = await saveToGoogleDrive();
    } else {
      // Just download if not connected to drive
      exportBoardReport();
    }
    
    // 2. Trigger sharing logic with the link
    setTimeout(() => {
      handleManualTrigger(driveLink);
      setSettings(s => ({ ...s, lastSentDate: new Date().toISOString() }));
    }, 2000);
  };

  // Documentação specific memos - Dynamic based on other filters
  const docBaseFleet = useMemo(() => {
    let base: Vehicle[] = fleet.filter(v => v.source === "DOCUMENTACAO").map(v => {
      let extra = { ...v.extraData };
      if (extra?.["Descrição"]) {
        const d = String(extra["Descrição"]);
        if (d.toUpperCase().includes("SERVIÇO DE MONITORAMENTO") || d.toUpperCase().includes("SERVICO DE MONITORAMENTO")) {
          extra["Descrição"] = d.replace(/SERVIÇO DE MONITORAMENTO/gi, "SERV. MONITORAMENTO")
                               .replace(/SERVICO DE MONITORAMENTO/gi, "SERV. MONITORAMENTO");
        }
      }
      const obs = String(extra?.["Observações"] || extra?.["OBSERVACOES"] || extra?.["OBS"] || "").trim();
      const docVal = String(extra?.["Documento"] || extra?.["DOC"] || "").trim();
      const pedMatch = obs.match(/PEDIDO\s*[:\-#]?\s*([0-9]{4,8})/i) || docVal.match(/^([0-9]{4,8})$/);
      const ped = String(extra?.["Pedido"] || (pedMatch ? pedMatch[1] : (/^[0-9]{4,8}$/.test(docVal) ? docVal : ""))).trim();
      if (ped && !extra["Pedido"]) extra["Pedido"] = ped;

      const isSeguro = (extra?.["Descrição"] || "").toUpperCase().includes("SEGURO") || 
                       (extra?.["Documento"] || "").toUpperCase().includes("SEGURO");
      if (isSeguro) {
        return { 
          ...v, 
          fleet: ped || v.fleet || "", 
          plate: ped ? (v.plate || `PED. ${ped}`) : v.plate || "", 
          extraData: extra 
        };
      }

      // Quando no campo/coluna observações não localizar a frota/placa, inserir o pedido para não trazer o resultado em branco e facilitar a consulta
      if (!v.plate && !v.fleet && ped) {
        return {
          ...v,
          fleet: ped,
          plate: `PED. ${ped}`,
          extraData: extra
        };
      } else if (!v.plate && ped) {
        return {
          ...v,
          plate: `PED. ${ped}`,
          extraData: extra
        };
      } else if (!v.fleet && ped) {
        return {
          ...v,
          fleet: ped,
          extraData: extra
        };
      }

      return { ...v, extraData: extra };
    });

    if (isParcelaUnica) {
      const uniqueDocs: Record<string, Vehicle> = {};
      base.forEach(v => {
        const plate = v.plate || "NO_PLATE";
        const desc = v.extraData?.["Descrição"] || "NO_DESC";
        const key = `${plate}-${desc}`;
        
        if (!uniqueDocs[key]) {
          uniqueDocs[key] = v;
        } else {
          const currentDoc = v.documents[0];
          const existingDoc = uniqueDocs[key].documents[0];
          
          if (currentDoc && existingDoc) {
            const parseDate = (d: string) => {
              const parts = d.split('/');
              if (parts.length === 3) return new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
              return new Date(0);
            };
            
            if (parseDate(currentDoc.expiryDate) > parseDate(existingDoc.expiryDate)) {
              uniqueDocs[key] = v;
            }
          }
        }
      });
      base = Object.values(uniqueDocs);
    }

    return base;
  }, [fleet, isParcelaUnica]);

  const baseLicFleet = useMemo(() => fleet.filter(v => v.source === "LICENCAS"), [fleet]);

  const activeOps = useMemo(() => selectedOperation.length > 0 ? selectedOperation : selectedOperationsLic, [selectedOperation, selectedOperationsLic]);
  const activeCities = useMemo(() => selectedCity.length > 0 ? selectedCity : selectedCitiesLic, [selectedCity, selectedCitiesLic]);
  const activeStatus = useMemo(() => selectedStatus.length > 0 ? selectedStatus : selectedStatusLic, [selectedStatus, selectedStatusLic]);

  const matchesLicOp = useCallback((v: Vehicle) => activeOps.length === 0 || activeOps.includes(v.operation), [activeOps]);
  const matchesLicCity = useCallback((v: Vehicle) => activeCities.length === 0 || activeCities.includes(v.cityBase), [activeCities]);
  const matchesLicDriver = useCallback((v: Vehicle) => selectedDriver.length === 0 || selectedDriver.includes(v.driver), [selectedDriver]);
  const matchesLicStatus = useCallback((v: Vehicle) => {
    if (activeStatus.length === 0) return true;
    return activeStatus.includes(v.overallStatus) ||
      (activeStatus.includes('em_aberto') && isEmAbertoDoc(v)) ||
      (activeStatus.includes('pagos') && isPagoDoc(v)) ||
      (activeStatus.includes('vencido') && isVencidoDoc(v)) ||
      (activeStatus.includes('ok') && v.overallStatus === 'ok') ||
      (activeStatus.includes('atencao') && v.overallStatus === 'atencao') ||
      (activeStatus.includes('critico') && v.overallStatus === 'critico');
  }, [activeStatus]);

  const matchesLicPlate = useCallback((v: Vehicle) => {
    if (selectedPlatesLic.length > 0 && !selectedPlatesLic.includes(v.plate)) return false;
    if (selectedPlateDoc.length > 0 && !selectedPlateDoc.includes(v.plate || "Vázio")) return false;
    return true;
  }, [selectedPlatesLic, selectedPlateDoc]);

  const matchesLicFleet = useCallback((v: Vehicle) => {
    if (selectedFleetDoc.length > 0 && !selectedFleetDoc.includes(v.fleet || "Vázio")) return false;
    if (selectedFleetStatusLic.length > 0 && !selectedFleetStatusLic.includes(v.status)) return false;
    return true;
  }, [selectedFleetDoc, selectedFleetStatusLic]);

  const matchesLicDocType = useCallback((v: Vehicle) => {
    if (selectedDocTypesLic.length === 0) return true;
    return !!(v.documents && v.documents.some(d => selectedDocTypesLic.includes(d.type)));
  }, [selectedDocTypesLic]);

  const matchesLicFrequency = useCallback((v: Vehicle) => {
    if (selectedFrequencyLic.length === 0) return true;
    return !!(v.documents && v.documents.some(d => {
      let freq = d.validityPeriod?.trim();
      if (!freq) {
        const model = LICENSE_MODELS_CATALOG.find(m => 
          m.type.toUpperCase().trim() === d.type.toUpperCase().trim() ||
          d.type.toUpperCase().includes(m.type.toUpperCase()) ||
          m.type.toUpperCase().includes(d.type.toUpperCase())
        );
        freq = model?.frequency || model?.validity || getLegalValidityPeriod(d.type);
      }
      const norm = normalizeFrequencyString(freq || "");
      return selectedFrequencyLic.includes(norm);
    }));
  }, [selectedFrequencyLic]);

  const MONTH_MAP: Record<string, string[]> = useMemo(() => ({
    "Janeiro": ["jan", "1", "01", "janeiro"],
    "Fevereiro": ["fev", "2", "02", "fevereiro"],
    "Março": ["mar", "3", "03", "marco", "março"],
    "Abril": ["abr", "4", "04", "abril"],
    "Maio": ["mai", "5", "05", "maio"],
    "Junho": ["jun", "6", "06", "junho"],
    "Julho": ["jul", "7", "07", "julho"],
    "Agosto": ["ago", "8", "08", "agosto"],
    "Setembro": ["set", "9", "09", "setembro"],
    "Outubro": ["out", "10", "outubro"],
    "Novembro": ["nov", "11", "novembro"],
    "Dezembro": ["dez", "12", "dezembro"]
  }), []);

  const getDocMonthYearInfo = useCallback((d?: any, v?: any) => {
    const vencStr = d?.rawExpiryDate || d?.expiryDate || v?.extraData?.[`Vencimento_${d?.type}`] || v?.extraData?.["Vencimento"] || v?.extraData?.["VENCIMENTO"];
    const pagStr = v?.extraData?.[`Pagamento_${d?.type}`] || v?.extraData?.["Pagamento"] || v?.extraData?.["PAGAMENTO"];
    return getMonthYearInfo(vencStr || pagStr);
  }, []);

  const matchesDocLicYear = useCallback((d: any, v: any) => {
    if (selectedYearLic.length === 0) return true;
    const mInfo = getDocMonthYearInfo(d, v);
    return selectedYearLic.includes(String(mInfo.year));
  }, [selectedYearLic, getDocMonthYearInfo]);

  const matchesDocLicMonth = useCallback((d: any, v: any) => {
    if (selectedMonthLic.length === 0) return true;
    const mInfo = getDocMonthYearInfo(d, v);
    return selectedMonthLic.some(selMonth => {
      const keywords = MONTH_MAP[selMonth] || [selMonth.toLowerCase()];
      return keywords.includes(mInfo.monthName.toLowerCase()) || 
             keywords.includes(String(mInfo.sortKey % 100)) ||
             keywords.includes(String(mInfo.sortKey % 100).padStart(2, '0'));
    });
  }, [selectedMonthLic, MONTH_MAP, getDocMonthYearInfo]);

  const matchesDocLicYearAndMonth = useCallback((d: any, v: any) => {
    return matchesDocLicYear(d, v) && matchesDocLicMonth(d, v);
  }, [matchesDocLicYear, matchesDocLicMonth]);

  const matchesLicYearAndMonth = useCallback((v: Vehicle) => {
    if (selectedYearLic.length === 0 && selectedMonthLic.length === 0) return true;
    if (v.documents && v.documents.length > 0) {
      return v.documents.some(d => matchesDocLicYearAndMonth(d, v));
    }
    return matchesDocLicYearAndMonth(undefined, v);
  }, [selectedYearLic, selectedMonthLic, matchesDocLicYearAndMonth]);

  const yearsLic = useMemo(() => {
    const set = new Set<string>();
    fleet.forEach(v => {
      if (v.source === "LICENCAS") {
        if (v.documents && v.documents.length > 0) {
          v.documents.forEach(d => {
            const mInfo = getDocMonthYearInfo(d, v);
            if (mInfo.year && mInfo.year !== 9999) {
              set.add(String(mInfo.year));
            }
          });
        } else {
          const mInfo = getDocMonthYearInfo(undefined, v);
          if (mInfo.year && mInfo.year !== 9999) {
            set.add(String(mInfo.year));
          }
        }
      }
    });
    if (set.size === 0) {
      const currentY = new Date().getFullYear();
      [currentY - 1, currentY, currentY + 1].forEach(y => set.add(String(y)));
    }
    return Array.from(set).sort((a, b) => b.localeCompare(a));
  }, [fleet, getDocMonthYearInfo]);

  const monthsLic = useMemo(() => {
    return ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
  }, []);

  const platesLicOpts = useMemo(() => {
    const filtered = baseLicFleet.filter(v => 
      matchesLicOp(v) && matchesLicCity(v) && matchesLicDriver(v) && matchesLicStatus(v) && matchesLicFleet(v) && matchesLicDocType(v) && matchesLicFrequency(v) && matchesLicYearAndMonth(v)
    );
    return Array.from(new Set(filtered.map(v => v.plate))).filter(Boolean).sort();
  }, [baseLicFleet, matchesLicOp, matchesLicCity, matchesLicDriver, matchesLicStatus, matchesLicFleet, matchesLicDocType, matchesLicFrequency, matchesLicYearAndMonth]);

  const statusFrotaLicOpts = useMemo(() => {
    const filtered = baseLicFleet.filter(v => 
      matchesLicOp(v) && matchesLicCity(v) && matchesLicDriver(v) && matchesLicStatus(v) && matchesLicPlate(v) && matchesLicDocType(v) && matchesLicFrequency(v) && matchesLicYearAndMonth(v)
    );
    return Array.from(new Set(filtered.map(v => v.status))).filter(Boolean).sort();
  }, [baseLicFleet, matchesLicOp, matchesLicCity, matchesLicDriver, matchesLicStatus, matchesLicPlate, matchesLicDocType, matchesLicFrequency, matchesLicYearAndMonth]);

  const platesDocDash = useMemo(() => {
    const filtered = docBaseFleet.filter(v => {
      if (!exibirDocsSemPlaca && (!v.plate || v.plate.trim() === "" || v.plate === "Vázio")) return false;
      const matchesStatus = selectedStatusDocDash.length === 0 || selectedStatusDocDash.includes(v.overallStatus) || (selectedStatusDocDash.includes('em_aberto') && isEmAbertoDoc(v));
      const matchesFleetStatus = selectedFleetStatusDocDash.length === 0 || selectedFleetStatusDocDash.includes(v.status);
      const matchesFleet = selectedFleetDocDash.length === 0 || selectedFleetDocDash.includes(v.fleet || "Vázio");
      const matchesDesc = selectedDescDocDash.length === 0 || selectedDescDocDash.includes(v.extraData?.["Descrição"]);
      return matchesStatus && matchesFleetStatus && matchesFleet && matchesDesc;
    });
    return Array.from(new Set(filtered.map(v => v.plate || "Vázio"))).sort();
  }, [docBaseFleet, selectedStatusDocDash, selectedFleetStatusDocDash, selectedFleetDocDash, selectedDescDocDash, exibirDocsSemPlaca]);

  const statusFrotaDashOpts = useMemo(() => {
    const filtered = docBaseFleet.filter(v => {
      if (!exibirDocsSemPlaca && (!v.plate || v.plate.trim() === "" || v.plate === "Vázio")) return false;
      const matchesPlate = selectedPlatesDocDash.length === 0 || selectedPlatesDocDash.includes(v.plate || "Vázio");
      const matchesStatus = selectedStatusDocDash.length === 0 || selectedStatusDocDash.includes(v.overallStatus) || (selectedStatusDocDash.includes('em_aberto') && isEmAbertoDoc(v));
      const matchesFleet = selectedFleetDocDash.length === 0 || selectedFleetDocDash.includes(v.fleet || "Vázio");
      const matchesDesc = selectedDescDocDash.length === 0 || selectedDescDocDash.includes(v.extraData?.["Descrição"]);
      return matchesPlate && matchesStatus && matchesFleet && matchesDesc;
    });
    return Array.from(new Set(filtered.map(v => v.status))).filter(Boolean).sort();
  }, [docBaseFleet, selectedPlatesDocDash, selectedStatusDocDash, selectedFleetStatusDocDash, selectedFleetDocDash, exibirDocsSemPlaca]);

  const fleetDocDashOpts = useMemo(() => {
    const filtered = docBaseFleet.filter(v => {
      if (!exibirDocsSemPlaca && (!v.plate || v.plate.trim() === "" || v.plate === "Vázio")) return false;
      const matchesPlate = selectedPlatesDocDash.length === 0 || selectedPlatesDocDash.includes(v.plate || "Vázio");
      const matchesStatus = selectedStatusDocDash.length === 0 || selectedStatusDocDash.includes(v.overallStatus) || (selectedStatusDocDash.includes('em_aberto') && isEmAbertoDoc(v));
      const matchesFleetStatus = selectedFleetStatusDocDash.length === 0 || selectedFleetStatusDocDash.includes(v.status);
      const matchesDesc = selectedDescDocDash.length === 0 || selectedDescDocDash.includes(v.extraData?.["Descrição"]);
      return matchesPlate && matchesStatus && matchesFleetStatus && matchesDesc;
    });
    return Array.from(new Set(filtered.map(v => v.fleet || "Vázio"))).sort();
  }, [docBaseFleet, selectedPlatesDocDash, selectedStatusDocDash, selectedFleetStatusDocDash, selectedDescDocDash, exibirDocsSemPlaca]);

  const descDocDashOpts = useMemo(() => {
    const filtered = docBaseFleet.filter(v => {
      if (!exibirDocsSemPlaca && (!v.plate || v.plate.trim() === "" || v.plate === "Vázio")) return false;
      const matchesPlate = selectedPlatesDocDash.length === 0 || selectedPlatesDocDash.includes(v.plate || "Vázio");
      const matchesStatus = selectedStatusDocDash.length === 0 || selectedStatusDocDash.includes(v.overallStatus) || (selectedStatusDocDash.includes('em_aberto') && isEmAbertoDoc(v));
      const matchesFleetStatus = selectedFleetStatusDocDash.length === 0 || selectedFleetStatusDocDash.includes(v.status);
      const matchesFleet = selectedFleetDocDash.length === 0 || selectedFleetDocDash.includes(v.fleet || "Vázio");
      return matchesPlate && matchesStatus && matchesFleetStatus && matchesFleet;
    });
    return Array.from(new Set(filtered.map(v => v.extraData?.["Descrição"]))).filter(Boolean).sort();
  }, [docBaseFleet, selectedPlatesDocDash, selectedStatusDocDash, selectedFleetStatusDocDash, selectedFleetDocDash, exibirDocsSemPlaca]);

  const statusDocDashOpts = ['em_aberto', 'vencido', 'critico', 'atencao', 'ok', 'pagos'];

  const filteredDashboardLicFleet = useMemo(() => {
    let base = fleet.filter(v => v.source === "LICENCAS");

    return base.filter(v => {
      const matchesSearch = !searchTerm ? true : (
        (v.plate || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
        (v.driver || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
        (v.operation || "").toLowerCase().includes(searchTerm.toLowerCase())
      );

      const matchesPlate = selectedPlatesLic.length === 0 || selectedPlatesLic.includes(v.plate);
      const matchesStatus = selectedStatusLic.length === 0 || selectedStatusLic.includes(v.overallStatus);
      const matchesFleetStatus = selectedFleetStatusLic.length === 0 || selectedFleetStatusLic.includes(v.status);
      const matchesOperation = selectedOperationsLic.length === 0 || selectedOperationsLic.includes(v.operation);
      const matchesCity = selectedCitiesLic.length === 0 || selectedCitiesLic.includes(v.cityBase);

      return matchesSearch && matchesPlate && matchesStatus && matchesFleetStatus && matchesOperation && matchesCity;
    });
  }, [fleet, searchTerm, selectedPlatesLic, selectedStatusLic, selectedFleetStatusLic, selectedOperationsLic, selectedCitiesLic]);

  const filteredLicenseModels = useMemo(() => {
    return LICENSE_MODELS_CATALOG.filter(item => {
      if (modelosCategory !== 'todos' && item.category !== modelosCategory) {
        return false;
      }
      if (modelosSearch.trim() !== '') {
        const q = modelosSearch.toLowerCase().trim();
        const matchTitle = item.title.toLowerCase().includes(q);
        const matchType = item.type.toLowerCase().includes(q);
        const matchBody = item.issuingBody.toLowerCase().includes(q);
        const matchValidity = item.validity.toLowerCase().includes(q);
        const matchDesc = item.description.toLowerCase().includes(q);
        return matchTitle || matchType || matchBody || matchValidity || matchDesc;
      }
      return true;
    });
  }, [modelosSearch, modelosCategory]);

  const filteredDashboardDocFleet = useMemo(() => {
    let base = [...docBaseFleet];

    if (!exibirDocsSemPlaca) {
      base = base.filter(v => v.plate && v.plate.trim() !== "" && v.plate !== "Vázio");
    }

    return base.filter(v => {
      const matchesSearch = !searchTerm ? true : (
        (v.plate || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
        (v.extraData?.["Descrição"] || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
        (v.extraData?.["Pedido"] || "").toLowerCase().includes(searchTerm.toLowerCase())
      );

      const matchesPlate = selectedPlatesDocDash.length === 0 || selectedPlatesDocDash.includes(v.plate || "Vázio");
      const matchesStatus = selectedStatusDocDash.length === 0 || selectedStatusDocDash.includes(v.overallStatus) || (selectedStatusDocDash.includes('em_aberto') && isEmAbertoDoc(v));
      const matchesFleetStatus = selectedFleetStatusDocDash.length === 0 || selectedFleetStatusDocDash.includes(v.status);
      const matchesFleet = selectedFleetDocDash.length === 0 || selectedFleetDocDash.includes(v.fleet || "Vázio");
      const matchesDesc = selectedDescDocDash.length === 0 || selectedDescDocDash.includes(v.extraData?.["Descrição"]);

      return matchesSearch && matchesPlate && matchesStatus && matchesFleetStatus && matchesFleet && matchesDesc;
    });
  }, [docBaseFleet, searchTerm, selectedPlatesDocDash, selectedStatusDocDash, selectedFleetStatusDocDash, selectedFleetDocDash, selectedDescDocDash, exibirDocsSemPlaca]);

  const operations = useMemo(() => {
    const filtered = baseLicFleet.filter(v => 
      matchesLicCity(v) && matchesLicDriver(v) && matchesLicStatus(v) && matchesLicPlate(v) && matchesLicFleet(v) && matchesLicDocType(v) && matchesLicFrequency(v) && matchesLicYearAndMonth(v)
    );
    const result = Array.from(new Set(filtered.map(v => v.operation))).filter(Boolean).sort();
    return result.length > 0 ? result : Array.from(new Set(baseLicFleet.map(v => v.operation))).filter(Boolean).sort();
  }, [baseLicFleet, matchesLicCity, matchesLicDriver, matchesLicStatus, matchesLicPlate, matchesLicFleet, matchesLicDocType, matchesLicFrequency, matchesLicYearAndMonth]);

  const cities = useMemo(() => {
    const filtered = baseLicFleet.filter(v => 
      matchesLicOp(v) && matchesLicDriver(v) && matchesLicStatus(v) && matchesLicPlate(v) && matchesLicFleet(v) && matchesLicDocType(v) && matchesLicFrequency(v) && matchesLicYearAndMonth(v)
    );
    const set = new Set<string>();
    filtered.forEach(v => {
      if (v.cityBase && v.cityBase.trim()) {
        set.add(v.cityBase.trim());
      }
    });
    set.add("Ribeirão Preto");
    return Array.from(set).sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [baseLicFleet, matchesLicOp, matchesLicDriver, matchesLicStatus, matchesLicPlate, matchesLicFleet, matchesLicDocType, matchesLicFrequency, matchesLicYearAndMonth]);

  // Dedicated operations for Map: ensures all fleet operations are always selectable
  const mapOperations = useMemo(() => {
    const set = new Set<string>();
    fleet.forEach(v => {
      if (v.operation && v.operation.trim()) {
        set.add(v.operation.trim());
      }
    });
    ["BAYER MT", "BAYER GO", "CITROSUCO - UBERLANDIA", "CITROSUCO - SÃO PAULO"].forEach(op => set.add(op));
    return Array.from(set).sort();
  }, [fleet]);

  // Dedicated cities for Map: includes Ribeirão Preto (Garagem), default operation bases, and dynamically extracts all cities from spreadsheets
  const mapCities = useMemo(() => {
    const set = new Set<string>();
    set.add("Ribeirão Preto");
    // Localizações padrão das 4 operações caso não preenchidas na planilha
    set.add("Uberlândia");
    set.add("São Paulo");
    set.add("Rio Verde");
    set.add("Lucas do Rio Verde");
    fleet.forEach(v => {
      if (v.cityBase && v.cityBase.trim()) {
        set.add(v.cityBase.trim());
      }
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [fleet]);

  // Dedicated drivers for Map: all available drivers from fleet
  const mapDrivers = useMemo(() => {
    const set = new Set<string>();
    fleet.forEach(v => {
      if (v.driver && v.driver.trim()) {
        const d = v.driver.trim();
        if (d.toUpperCase() !== "DEFENIR" && d.toUpperCase() !== "DEFINIR" && d !== "-") {
          set.add(d);
        }
      }
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [fleet]);

  const drivers = useMemo(() => {
    const filtered = baseLicFleet.filter(v => 
      matchesLicOp(v) && matchesLicCity(v) && matchesLicStatus(v) && matchesLicPlate(v) && matchesLicFleet(v) && matchesLicDocType(v) && matchesLicFrequency(v) && matchesLicYearAndMonth(v)
    );
    return Array.from(new Set(filtered.map(v => v.driver))).filter(Boolean).sort();
  }, [baseLicFleet, matchesLicOp, matchesLicCity, matchesLicStatus, matchesLicPlate, matchesLicFleet, matchesLicDocType, matchesLicFrequency, matchesLicYearAndMonth]);

  const documentTypesLic = useMemo(() => {
    const filtered = baseLicFleet.filter(v => 
      matchesLicOp(v) && matchesLicCity(v) && matchesLicDriver(v) && matchesLicStatus(v) && matchesLicPlate(v) && matchesLicFleet(v) && matchesLicFrequency(v) && matchesLicYearAndMonth(v)
    );
    const set = new Set<string>();
    filtered.forEach(v => {
      v.documents?.forEach(d => {
        if (!matchesDocLicYearAndMonth(d, v)) return;
        if (d.type) {
          if (selectedFrequencyLic.length > 0) {
            let freq = d.validityPeriod?.trim();
            if (!freq) {
              const model = LICENSE_MODELS_CATALOG.find(m => 
                m.type.toUpperCase().trim() === d.type.toUpperCase().trim() ||
                d.type.toUpperCase().includes(m.type.toUpperCase()) ||
                m.type.toUpperCase().includes(d.type.toUpperCase())
              );
              freq = model?.frequency || model?.validity || getLegalValidityPeriod(d.type);
            }
            const norm = normalizeFrequencyString(freq || "");
            if (selectedFrequencyLic.includes(norm)) {
              set.add(d.type);
            }
          } else {
            set.add(d.type);
          }
        }
      });
    });
    return Array.from(set).sort();
  }, [baseLicFleet, matchesLicOp, matchesLicCity, matchesLicDriver, matchesLicStatus, matchesLicPlate, matchesLicFleet, matchesLicFrequency, matchesLicYearAndMonth, selectedFrequencyLic, matchesDocLicYearAndMonth]);

  const frequenciesLic = useMemo(() => {
    const filtered = baseLicFleet.filter(v => 
      matchesLicOp(v) && matchesLicCity(v) && matchesLicDriver(v) && matchesLicStatus(v) && matchesLicPlate(v) && matchesLicFleet(v) && matchesLicDocType(v) && matchesLicYearAndMonth(v)
    );
    const set = new Set<string>();
    filtered.forEach(v => {
      v.documents?.forEach(d => {
        if (!matchesDocLicYearAndMonth(d, v)) return;
        if (selectedDocTypesLic.length > 0 && !selectedDocTypesLic.includes(d.type)) {
          return;
        }
        let freq = d.validityPeriod?.trim();
        if (!freq) {
          const model = LICENSE_MODELS_CATALOG.find(m => 
            m.type.toUpperCase().trim() === d.type.toUpperCase().trim() ||
            d.type.toUpperCase().includes(m.type.toUpperCase()) ||
            m.type.toUpperCase().includes(d.type.toUpperCase())
          );
          freq = model?.frequency || model?.validity || getLegalValidityPeriod(d.type);
        }
        if (freq) {
          const normalized = normalizeFrequencyString(freq);
          if (normalized && normalized !== "-") set.add(normalized);
        }
      });
    });
    return Array.from(set).sort();
  }, [baseLicFleet, matchesLicOp, matchesLicCity, matchesLicDriver, matchesLicStatus, matchesLicPlate, matchesLicFleet, matchesLicDocType, matchesLicYearAndMonth, selectedDocTypesLic, matchesDocLicYearAndMonth]);

  const empresas = useMemo(() => Array.from(new Set(docBaseFleet.map(v => v.extraData?.["Empresa"]))).filter(Boolean).sort(), [docBaseFleet]);
  const filiais = useMemo(() => Array.from(new Set(docBaseFleet.map(v => v.extraData?.["Filial"]))).filter(Boolean).sort(), [docBaseFleet]);
  const razoesSociais = useMemo(() => Array.from(new Set(docBaseFleet.map(v => v.extraData?.["Razão Social"]))).filter(Boolean).sort(), [docBaseFleet]);
  const estados = useMemo(() => Array.from(new Set(docBaseFleet.map(v => v.extraData?.["Estado"]))).filter(Boolean).sort(), [docBaseFleet]);

  const targetDocArray = useMemo(() => {
    if (activeTab === "financeiro_licencas" || activeTab === "licencas_detalhadas") {
      return fleet.filter(v => v.source === "LICENCAS");
    }
    return docBaseFleet;
  }, [activeTab, fleet, docBaseFleet]);

  const frotasDoc = useMemo(() => {
    const filtered = targetDocArray.filter(v => {
      if (!exibirDocsSemPlaca) {
        if (!v.plate || v.plate.trim() === "" || v.plate === "Vázio") return false;
      }
      const matchesPlate = selectedPlateDoc.length === 0 || selectedPlateDoc.includes(v.plate || "Vázio");
      const matchesDesc = selectedDescDoc.length === 0 || selectedDescDoc.includes(v.extraData?.["Descrição"]) || (v.documents && v.documents.some(doc => selectedDescDoc.includes(doc.type)));
      const matchesObs = selectedObsDoc.length === 0 || selectedObsDoc.includes(v.extraData?.["Observações"]);
      const matchesVenc = selectedVencimentoDoc.length === 0 || selectedVencimentoDoc.includes(v.extraData?.["Vencimento"] ? formatBRDate(v.extraData?.["Vencimento"]) : "Vázio");
      const matchesPag = selectedPagamentoDoc.length === 0 || selectedPagamentoDoc.includes(v.extraData?.["Pagamento"] ? formatBRDate(v.extraData?.["Pagamento"]) : "Vázio");
      const matchesPar = selectedParcelaDoc.length === 0 || selectedParcelaDoc.includes(v.extraData?.["Parcela"]);
      const matchesStatus = selectedStatusDoc.length === 0 || selectedStatusDoc.includes(v.overallStatus) || (selectedStatusDoc.includes('em_aberto') && isEmAbertoDoc(v));
      return matchesPlate && matchesDesc && matchesObs && matchesVenc && matchesPag && matchesPar && matchesStatus;
    });
    const opts = Array.from(new Set(filtered.map(v => v.fleet || "Vázio"))).sort((a: any, b: any) => {
      if (a === "Vázio") return -1;
      if (b === "Vázio") return 1;
      return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' });
    });
    return opts;
  }, [targetDocArray, selectedPlateDoc, selectedDescDoc, selectedObsDoc, selectedVencimentoDoc, selectedPagamentoDoc, selectedParcelaDoc, selectedStatusDoc, exibirDocsSemPlaca]);

  const placasDoc = useMemo(() => {
    const filtered = targetDocArray.filter(v => {
      if (!exibirDocsSemPlaca) {
        if (!v.plate || v.plate.trim() === "" || v.plate === "Vázio") return false;
      }
      const matchesFleet = selectedFleetDoc.length === 0 || selectedFleetDoc.includes(v.fleet || "Vázio");
      const matchesDesc = selectedDescDoc.length === 0 || selectedDescDoc.includes(v.extraData?.["Descrição"]) || (v.documents && v.documents.some(doc => selectedDescDoc.includes(doc.type)));
      const matchesObs = selectedObsDoc.length === 0 || selectedObsDoc.includes(v.extraData?.["Observações"]);
      const matchesVenc = selectedVencimentoDoc.length === 0 || selectedVencimentoDoc.includes(v.extraData?.["Vencimento"] ? formatBRDate(v.extraData?.["Vencimento"]) : "Vázio");
      const matchesPag = selectedPagamentoDoc.length === 0 || selectedPagamentoDoc.includes(v.extraData?.["Pagamento"] ? formatBRDate(v.extraData?.["Pagamento"]) : "Vázio");
      const matchesPar = selectedParcelaDoc.length === 0 || selectedParcelaDoc.includes(v.extraData?.["Parcela"]);
      const matchesStatus = selectedStatusDoc.length === 0 || selectedStatusDoc.includes(v.overallStatus) || (selectedStatusDoc.includes('em_aberto') && isEmAbertoDoc(v));
      return matchesFleet && matchesDesc && matchesObs && matchesVenc && matchesPag && matchesPar && matchesStatus;
    });
    const opts = Array.from(new Set(filtered.map(v => v.plate || "Vázio"))).sort((a, b) => {
      if (a === "Vázio") return -1;
      if (b === "Vázio") return 1;
      return String(a).localeCompare(String(b));
    });
    return opts;
  }, [targetDocArray, selectedFleetDoc, selectedDescDoc, selectedObsDoc, selectedVencimentoDoc, selectedPagamentoDoc, selectedParcelaDoc, selectedStatusDoc, exibirDocsSemPlaca]);

  const descricoesDoc = useMemo(() => {
    const filtered = targetDocArray.filter(v => {
      if (!exibirDocsSemPlaca) {
        if (!v.plate || v.plate.trim() === "" || v.plate === "Vázio") return false;
      }
      const matchesFleet = selectedFleetDoc.length === 0 || selectedFleetDoc.includes(v.fleet || "Vázio");
      const matchesPlate = selectedPlateDoc.length === 0 || selectedPlateDoc.includes(v.plate || "Vázio");
      const matchesObs = selectedObsDoc.length === 0 || selectedObsDoc.includes(v.extraData?.["Observações"]);
      const matchesVenc = selectedVencimentoDoc.length === 0 || selectedVencimentoDoc.includes(v.extraData?.["Vencimento"]);
      const matchesPag = selectedPagamentoDoc.length === 0 || selectedPagamentoDoc.includes(v.extraData?.["Pagamento"]);
      const matchesPar = selectedParcelaDoc.length === 0 || selectedParcelaDoc.includes(v.extraData?.["Parcela"]);
      const matchesStatus = selectedStatusDoc.length === 0 || selectedStatusDoc.includes(v.overallStatus) || (selectedStatusDoc.includes('em_aberto') && isEmAbertoDoc(v));
      return matchesFleet && matchesPlate && matchesObs && matchesVenc && matchesPag && matchesPar && matchesStatus;
    });
    const list = new Set<string>();
    filtered.forEach(v => {
      if (v.extraData?.["Descrição"]) list.add(v.extraData["Descrição"]);
      if (v.documents) v.documents.forEach(d => list.add(d.type));
    });
    return Array.from(list).filter(Boolean).sort();
  }, [targetDocArray, selectedFleetDoc, selectedPlateDoc, selectedObsDoc, selectedVencimentoDoc, selectedPagamentoDoc, selectedParcelaDoc, selectedStatusDoc, exibirDocsSemPlaca]);

  const observacoesDoc = useMemo(() => {
    const filtered = targetDocArray.filter(v => {
      if (!exibirDocsSemPlaca) {
        if (!v.plate || v.plate.trim() === "" || v.plate === "Vázio") return false;
      }
      const matchesFleet = selectedFleetDoc.length === 0 || selectedFleetDoc.includes(v.fleet || "Vázio");
      const matchesPlate = selectedPlateDoc.length === 0 || selectedPlateDoc.includes(v.plate || "Vázio");
      const matchesDesc = selectedDescDoc.length === 0 || selectedDescDoc.includes(v.extraData?.["Descrição"]) || (v.documents && v.documents.some(doc => selectedDescDoc.includes(doc.type)));
      const matchesVenc = selectedVencimentoDoc.length === 0 || selectedVencimentoDoc.includes(v.extraData?.["Vencimento"]);
      const matchesPag = selectedPagamentoDoc.length === 0 || selectedPagamentoDoc.includes(v.extraData?.["Pagamento"]);
      const matchesPar = selectedParcelaDoc.length === 0 || selectedParcelaDoc.includes(v.extraData?.["Parcela"]);
      const matchesStatus = selectedStatusDoc.length === 0 || selectedStatusDoc.includes(v.overallStatus) || (selectedStatusDoc.includes('em_aberto') && isEmAbertoDoc(v));
      return matchesFleet && matchesPlate && matchesDesc && matchesVenc && matchesPag && matchesPar && matchesStatus;
    });
    return Array.from(new Set(filtered.map(v => v.extraData?.["Observações"]))).filter(Boolean).sort();
  }, [targetDocArray, selectedFleetDoc, selectedPlateDoc, selectedDescDoc, selectedVencimentoDoc, selectedPagamentoDoc, selectedParcelaDoc, selectedStatusDoc, exibirDocsSemPlaca]);

  const vencimentosDoc = useMemo(() => {
    const filtered = targetDocArray.filter(v => {
      if (!exibirDocsSemPlaca) {
        if (!v.plate || v.plate.trim() === "" || v.plate === "Vázio") return false;
      }
      const matchesFleet = selectedFleetDoc.length === 0 || selectedFleetDoc.includes(v.fleet || "Vázio");
      const matchesPlate = selectedPlateDoc.length === 0 || selectedPlateDoc.includes(v.plate || "Vázio");
      const matchesDesc = selectedDescDoc.length === 0 || selectedDescDoc.includes(v.extraData?.["Descrição"]) || (v.documents && v.documents.some(doc => selectedDescDoc.includes(doc.type)));
      const matchesObs = selectedObsDoc.length === 0 || selectedObsDoc.includes(v.extraData?.["Observações"]);
      const matchesPag = selectedPagamentoDoc.length === 0 || selectedPagamentoDoc.includes(v.extraData?.["Pagamento"] ? formatBRDate(v.extraData?.["Pagamento"]) : "Vázio");
      const matchesPar = selectedParcelaDoc.length === 0 || selectedParcelaDoc.includes(v.extraData?.["Parcela"]);
      const matchesStatus = selectedStatusDoc.length === 0 || selectedStatusDoc.includes(v.overallStatus) || (selectedStatusDoc.includes('em_aberto') && isEmAbertoDoc(v));
      return matchesFleet && matchesPlate && matchesDesc && matchesObs && matchesPag && matchesPar && matchesStatus;
    });
    const opts = Array.from(new Set(filtered.map(v => {
      const val = v.extraData?.["Vencimento"] || v.extraData?.["VENCIMENTO"];
      return val ? formatBRDate(val) : "Vázio";
    }))).sort((a, b) => {
      if (a === "Vázio") return -1;
      if (b === "Vázio") return 1;

      // Parse dates to compare (assuming DD/MM/YYYY after normalization)
      const parseDate = (dStr: string) => {
        const parts = dStr.split("/");
        if (parts.length === 3) {
          const d = parseInt(parts[0]);
          const m = parseInt(parts[1]) - 1;
          const y = parseInt(parts[2]);
          return new Date(y, m, d).getTime();
        }
        return 0;
      };

      const timeA = parseDate(String(a));
      const timeB = parseDate(String(b));
      
      if (timeA !== timeB) return timeA - timeB;
      return String(a).localeCompare(String(b));
    });
    return opts;
  }, [targetDocArray, selectedFleetDoc, selectedPlateDoc, selectedDescDoc, selectedObsDoc, selectedPagamentoDoc, selectedParcelaDoc, selectedStatusDoc, exibirDocsSemPlaca]);

  const pagamentosDoc = useMemo(() => {
    const filtered = targetDocArray.filter(v => {
      if (!exibirDocsSemPlaca) {
        if (!v.plate || v.plate.trim() === "" || v.plate === "Vázio") return false;
      }
      const matchesFleet = selectedFleetDoc.length === 0 || selectedFleetDoc.includes(v.fleet || "Vázio");
      const matchesPlate = selectedPlateDoc.length === 0 || selectedPlateDoc.includes(v.plate || "Vázio");
      const matchesDesc = selectedDescDoc.length === 0 || selectedDescDoc.includes(v.extraData?.["Descrição"]) || (v.documents && v.documents.some(doc => selectedDescDoc.includes(doc.type)));
      const matchesObs = selectedObsDoc.length === 0 || selectedObsDoc.includes(v.extraData?.["Observações"]);
      const matchesVenc = selectedVencimentoDoc.length === 0 || selectedVencimentoDoc.includes(v.extraData?.["Vencimento"] ? formatBRDate(v.extraData?.["Vencimento"]) : "Vázio");
      const matchesPar = selectedParcelaDoc.length === 0 || selectedParcelaDoc.includes(v.extraData?.["Parcela"]);
      const matchesStatus = selectedStatusDoc.length === 0 || selectedStatusDoc.includes(v.overallStatus) || (selectedStatusDoc.includes('em_aberto') && isEmAbertoDoc(v));
      return matchesFleet && matchesPlate && matchesDesc && matchesObs && matchesVenc && matchesPar && matchesStatus;
    });

    const opts = Array.from(new Set(filtered.map(v => {
      const val = v.extraData?.["Pagamento"] || v.extraData?.["PAGAMENTO"];
      return val ? formatBRDate(val) : "Vázio";
    }))).sort((a, b) => {
      if (a === "Vázio") return -1;
      if (b === "Vázio") return 1;

      // Parse dates to compare (assuming DD/MM/YYYY after normalization)
      const parseDate = (dStr: string) => {
        const parts = dStr.split("/");
        if (parts.length === 3) {
          const d = parseInt(parts[0]);
          const m = parseInt(parts[1]) - 1;
          const y = parseInt(parts[2]);
          return new Date(y, m, d).getTime();
        }
        return 0;
      };

      const timeA = parseDate(String(a));
      const timeB = parseDate(String(b));
      
      if (timeA !== timeB) return timeA - timeB;
      return String(a).localeCompare(String(b));
    });
    return opts;
  }, [targetDocArray, selectedFleetDoc, selectedPlateDoc, selectedDescDoc, selectedObsDoc, selectedVencimentoDoc, selectedParcelaDoc, selectedStatusDoc, exibirDocsSemPlaca]);

  const parcelasDoc = useMemo(() => {
    const filtered = targetDocArray.filter(v => {
      if (!exibirDocsSemPlaca) {
        if (!v.plate || v.plate.trim() === "" || v.plate === "Vázio") return false;
      }
      const matchesFleet = selectedFleetDoc.length === 0 || selectedFleetDoc.includes(v.fleet || "Vázio");
      const matchesPlate = selectedPlateDoc.length === 0 || selectedPlateDoc.includes(v.plate || "Vázio");
      const matchesDesc = selectedDescDoc.length === 0 || selectedDescDoc.includes(v.extraData?.["Descrição"]) || (v.documents && v.documents.some(doc => selectedDescDoc.includes(doc.type)));
      const matchesObs = selectedObsDoc.length === 0 || selectedObsDoc.includes(v.extraData?.["Observações"]);
      const matchesVenc = selectedVencimentoDoc.length === 0 || selectedVencimentoDoc.includes(v.extraData?.["Vencimento"]);
      const matchesPag = selectedPagamentoDoc.length === 0 || selectedPagamentoDoc.includes(v.extraData?.["Pagamento"]);
      const matchesStatus = selectedStatusDoc.length === 0 || selectedStatusDoc.includes(v.overallStatus) || (selectedStatusDoc.includes('em_aberto') && isEmAbertoDoc(v));
      return matchesFleet && matchesPlate && matchesDesc && matchesObs && matchesVenc && matchesPag && matchesStatus;
    });
    return Array.from(new Set(filtered.map(v => {
      const p = v.extraData?.["Parcela"];
      if (!p) return "";
      return String(p).replace(".0", "").replace(/\.0$/, "").trim();
    }))).filter(Boolean).sort((a: any, b: any) => {
      const aVal = parseInt(String(a).split('/')[0]);
      const bVal = parseInt(String(b).split('/')[0]);
      return aVal - bVal;
    });
  }, [docBaseFleet, selectedFleetDoc, selectedPlateDoc, selectedDescDoc, selectedObsDoc, selectedVencimentoDoc, selectedPagamentoDoc, selectedStatusDoc, exibirDocsSemPlaca]);

  const filteredFleet = useMemo(() => {
    let base = (activeTab === "licencas_documentos" || activeTab === "financeiro_docs") ? [...docBaseFleet] : [...fleet];
    
    // Sort Documentação by Payment Date ascending as requested
    if (activeTab === "licencas_documentos" || activeTab === "financeiro_docs") {
      base.sort((a, b) => {
        const parseDate = (val: any) => {
          if (!val) return 0;
          const s = String(val).trim();
          if (s === "-" || s === "") return 0;
          
          const parts = s.split("/");
          if (parts.length === 3) {
            return new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0])).getTime();
          }
          
          const t = Date.parse(s);
          return isNaN(t) ? 0 : t;
        };

        const dateA = parseDate(a.extraData?.["Pagamento"]);
        const dateB = parseDate(b.extraData?.["Pagamento"]);
        
        if (dateA !== dateB) return dateA - dateB;
        
        // Secondary sort by Vencimento then Fleet
        const vencA = parseDate(a.extraData?.["Vencimento"]);
        const vencB = parseDate(b.extraData?.["Vencimento"]);
        if (vencA !== vencB) return vencA - vencB;
        
        return (a.fleet || "").localeCompare(b.fleet || "");
      });
    }

    // High-performance precomputation: avoid O(N^2) inner array scans and repeated string allocations
    const lowerSearch = searchTerm ? searchTerm.toLowerCase().trim() : "";

    let allPaidGroupsMap: Map<string, boolean> | null = null;
    if (isPagos100) {
      allPaidGroupsMap = new Map();
      for (let i = 0; i < docBaseFleet.length; i++) {
        const item = docBaseFleet[i];
        const key = `${item.plate || ""}#${item.extraData?.["Descrição"] || ""}`;
        const pag = (item.extraData?.["Pagamento"] || "").toString().trim();
        const isPaid = pag !== "" && pag !== "-" && !pag.toUpperCase().includes("NAO") && !pag.toUpperCase().includes("NÃO");
        if (allPaidGroupsMap.has(key)) {
          if (!isPaid) allPaidGroupsMap.set(key, false);
        } else {
          allPaidGroupsMap.set(key, isPaid);
        }
      }
    }

    const opSet = selectedOperation.length > 0 ? new Set(selectedOperation) : null;
    const citySet = selectedCity.length > 0 ? new Set(selectedCity) : null;
    const driverSet = selectedDriver.length > 0 ? new Set(selectedDriver) : null;
    const fleetDocSet = selectedFleetDoc.length > 0 ? new Set(selectedFleetDoc) : null;
    const plateDocSet = selectedPlateDoc.length > 0 ? new Set(selectedPlateDoc) : null;
    const descDocSet = selectedDescDoc.length > 0 ? new Set(selectedDescDoc) : null;
    const obsDocSet = selectedObsDoc.length > 0 ? new Set(selectedObsDoc) : null;
    const vencDocSet = selectedVencimentoDoc.length > 0 ? new Set(selectedVencimentoDoc) : null;
    const pagDocSet = selectedPagamentoDoc.length > 0 ? new Set(selectedPagamentoDoc) : null;
    const parDocSet = selectedParcelaDoc.length > 0 ? new Set(selectedParcelaDoc) : null;
    const statusDocSet = selectedStatusDoc.length > 0 ? new Set(selectedStatusDoc) : null;
    const docTypesLicSet = selectedDocTypesLic.length > 0 ? new Set(selectedDocTypesLic) : null;
    const combinedStatusList = [...selectedStatus, ...selectedStatusDoc];
    const combinedStatusSet = combinedStatusList.length > 0 ? new Set(combinedStatusList) : null;
    const statusSet = selectedStatus.length > 0 ? new Set(selectedStatus) : null;

    return base.filter(v => {
      // Filter by source based on active tab
      if ((activeTab === "licencas_detalhadas" || activeTab === "financeiro_licencas") && v.source !== "LICENCAS") return false;
      if ((activeTab === "licencas_documentos" || activeTab === "financeiro_docs") && v.source !== "DOCUMENTACAO") return false;
      if (activeTab === "dashboard" || activeTab === "map") {
        if (activeDashboardSubTab === "licencas" && v.source !== "LICENCAS") return false;
        if (activeDashboardSubTab === "documentacao" && v.source !== "DOCUMENTACAO") return false;
      }

      if (v.source === "DOCUMENTACAO" && !exibirDocsSemPlaca) {
        if (!v.plate || v.plate.trim() === "" || v.plate === "Vázio") return false;
      }

      const matchesSearch = !lowerSearch ||
        (v.plate && v.plate.toLowerCase().includes(lowerSearch)) ||
        (v.driver && v.driver.toLowerCase().includes(lowerSearch)) ||
        (v.operation && v.operation.toLowerCase().includes(lowerSearch)) ||
        (v.extraData?.["Razão Social"] && String(v.extraData["Razão Social"]).toLowerCase().includes(lowerSearch)) ||
        (v.extraData?.["Descrição"] && String(v.extraData["Descrição"]).toLowerCase().includes(lowerSearch)) ||
        (v.extraData?.["Pedido"] && String(v.extraData["Pedido"]).toLowerCase().includes(lowerSearch));
      
      if (!matchesSearch) return false;

      if (activeTab === "financeiro_licencas") {
        const matchesOperation = !opSet || opSet.has(v.operation);
        const matchesCity = !citySet || citySet.has(v.cityBase);
        const matchesDriver = !driverSet || driverSet.has(v.driver);

        const matchesFleet = !fleetDocSet || fleetDocSet.has(v.fleet || "Vázio");
        const matchesPlate = !plateDocSet || plateDocSet.has(v.plate || "Vázio");
        const matchesDesc = !descDocSet || descDocSet.has(v.extraData?.["Descrição"]) || (v.documents && v.documents.some(doc => descDocSet.has(doc.type)));
        
        const matchesDocType = !docTypesLicSet || (v.documents && v.documents.some(doc => docTypesLicSet.has(doc.type)));

        const matchesFrequency = selectedFrequencyLic.length === 0 || (v.documents && v.documents.some(doc => {
          let freq = doc.validityPeriod?.trim();
          if (!freq) {
            const model = LICENSE_MODELS_CATALOG.find(m => 
              m.type.toUpperCase().trim() === doc.type.toUpperCase().trim() ||
              doc.type.toUpperCase().includes(m.type.toUpperCase()) ||
              m.type.toUpperCase().includes(doc.type.toUpperCase())
            );
            freq = model?.frequency || model?.validity || getLegalValidityPeriod(doc.type);
          }
          return selectedFrequencyLic.includes(normalizeFrequencyString(freq || ""));
        }));

        const matchesStatus = !combinedStatusSet || 
          combinedStatusSet.has(v.overallStatus) || 
          (combinedStatusSet.has('em_aberto') && isEmAbertoDoc(v)) ||
          (combinedStatusSet.has('pagos') && isPagoDoc(v)) ||
          (combinedStatusSet.has('vencido') && isVencidoDoc(v)) ||
          (combinedStatusSet.has('ok') && v.overallStatus === 'ok') ||
          (combinedStatusSet.has('atencao') && v.overallStatus === 'atencao') ||
          (combinedStatusSet.has('critico') && v.overallStatus === 'critico');

        const matchesYearAndMonth = matchesLicYearAndMonth(v);

        return matchesOperation && matchesCity && matchesDriver && matchesFleet && matchesPlate && matchesDesc && matchesDocType && matchesFrequency && matchesStatus && matchesYearAndMonth;
      }

      if (activeTab === "licencas_documentos" || activeTab === "financeiro_docs" || (activeTab === "dashboard" && activeDashboardSubTab === "documentacao")) {
        const matchesFleet = !fleetDocSet || fleetDocSet.has(v.fleet || "Vázio");
        const matchesPlate = !plateDocSet || plateDocSet.has(v.plate || "Vázio");
        const matchesDesc = !descDocSet || descDocSet.has(v.extraData?.["Descrição"]) || (v.documents && v.documents.some(doc => descDocSet.has(doc.type)));
        const matchesObs = !obsDocSet || obsDocSet.has(v.extraData?.["Observações"]);
        const matchesVenc = !vencDocSet || vencDocSet.has(v.extraData?.["Vencimento"] ? formatBRDate(v.extraData?.["Vencimento"]) : "Vázio");
        const matchesPag = !pagDocSet || pagDocSet.has(v.extraData?.["Pagamento"] ? formatBRDate(v.extraData?.["Pagamento"]) : "Vázio");
        const matchesPar = !parDocSet || parDocSet.has(v.extraData?.["Parcela"]);
        const matchesStatus = !statusDocSet || 
          statusDocSet.has(v.overallStatus) || 
          (statusDocSet.has('em_aberto') && isEmAbertoDoc(v)) ||
          (statusDocSet.has('pagos') && isPagoDoc(v)) ||
          (statusDocSet.has('vencido') && isVencidoDoc(v));
        
        let matchesPago100 = true;
        if (isPagos100 && allPaidGroupsMap) {
          const key = `${v.plate || ""}#${v.extraData?.["Descrição"] || ""}`;
          matchesPago100 = allPaidGroupsMap.get(key) ?? false;
        }
        
        return matchesFleet && matchesPlate && matchesDesc && matchesObs && matchesVenc && matchesPag && matchesPar && matchesStatus && matchesPago100;
      }

      const matchesOperation = !opSet || opSet.has(v.operation);
      const matchesStatus = !statusSet || 
        statusSet.has(v.overallStatus) ||
        (statusSet.has('em_aberto') && isEmAbertoDoc(v)) ||
        (statusSet.has('pagos') && isPagoDoc(v)) ||
        (statusSet.has('vencido') && isVencidoDoc(v)) ||
        (statusSet.has('ok') && v.overallStatus === 'ok') ||
        (statusSet.has('atencao') && v.overallStatus === 'atencao') ||
        (statusSet.has('critico') && v.overallStatus === 'critico');
      const matchesCity = !citySet || citySet.has(v.cityBase);
      const matchesDriver = !driverSet || driverSet.has(v.driver);
      
      return matchesOperation && matchesStatus && matchesCity && matchesDriver;
    });
  }, [fleet, docBaseFleet, searchTerm, selectedOperation, selectedStatus, selectedCity, selectedDriver, selectedDocTypesLic, selectedFrequencyLic, selectedEmpresa, selectedRazaoSocial, selectedEstado, selectedFleetDoc, selectedPlateDoc, selectedDescDoc, selectedObsDoc, selectedVencimentoDoc, selectedPagamentoDoc, selectedParcelaDoc, selectedStatusDoc, isPagos100, activeTab, activeDashboardSubTab, exibirDocsSemPlaca, matchesLicYearAndMonth]);

  const stats = useMemo<FleetStats>(() => {
    let expiring = 0;
    let expired = 0;
    let ok = 0;
    let atencao = 0;
    let critico = 0;
    let vencido = 0;
    const operationsSet = new Set();
    const expiredDocuments: { plate: string, type: string, expiryDate: string, driver: string }[] = [];

    const isDocMode = (activeTab === "dashboard" && activeDashboardSubTab === "documentacao") || 
                      (activeTab === "licencas_documentos") ||
                      (activeTab === "financeiro_docs") ||
                      (activeTab === "map" && activeDashboardSubTab === "documentacao");

    let relevantFleet = [];
    if (activeTab === "dashboard") {
      if (activeDashboardSubTab === "licencas") {
        relevantFleet = filteredDashboardLicFleet;
      } else {
        relevantFleet = filteredDashboardDocFleet;
      }
    } else if (activeTab === "licencas_detalhadas" || activeTab === "financeiro_licencas") {
      relevantFleet = filteredFleet.filter(v => v.source === "LICENCAS");
    } else if (activeTab === "licencas_documentos" || activeTab === "financeiro_docs") {
      relevantFleet = filteredFleet.filter(v => v.source === "DOCUMENTACAO");
    } else if (activeTab === "map") {
      if (activeDashboardSubTab === "licencas") {
        relevantFleet = fleet.filter(v => v.source === "LICENCAS");
      } else {
        relevantFleet = docBaseFleet;
      }
    } else {
      relevantFleet = fleet;
    }

    let totalDocuments = 0;

    relevantFleet.forEach(v => {
      operationsSet.add(v.operation);
      totalDocuments += v.documents.length;
      
      if (v.overallStatus === 'ok' || v.overallStatus === 'pagos') ok++;
      else if (v.overallStatus === 'atencao') atencao++;
      else if (v.overallStatus === 'critico') critico++;
      else if (v.overallStatus === 'vencido') vencido++;

      v.documents.forEach(doc => {
        if (doc.status === 'vencido') {
          expired++;
          expiredDocuments.push({
            plate: v.plate,
            type: doc.type,
            expiryDate: doc.expiryDate,
            driver: v.driver
          });
        } else if (doc.status === 'critico' || doc.status === 'atencao') {
          expiring++;
        }
      });
    });

    return {
      totalVehicles: isDocMode
        ? new Set(relevantFleet.map(v => v.plate).filter(Boolean)).size
        : relevantFleet.length,
      totalDocuments,
      activeOperations: operationsSet.size,
      expiringDocs: expiring,
      expiredDocs: expired,
      ok,
      atencao,
      critico,
      vencido,
      expiredDocuments
    };
  }, [fleet, activeTab, activeDashboardSubTab, docBaseFleet, filteredDashboardLicFleet, filteredDashboardDocFleet, filteredFleet]);

  const financialStats = useMemo(() => {
    let totalVal = 0;
    let paidVal = 0;
    let openVal = 0;
    let expiredVal = 0;

    let totalCount = 0;
    let paidCount = 0;
    let openCount = 0;
    let expiredCount = 0;

    const monthlyData = [
      { month: "Jan", Pago: 0, "Em Aberto": 0, Vencido: 0 },
      { month: "Fev", Pago: 0, "Em Aberto": 0, Vencido: 0 },
      { month: "Mar", Pago: 0, "Em Aberto": 0, Vencido: 0 },
      { month: "Abr", Pago: 0, "Em Aberto": 0, Vencido: 0 },
      { month: "Mai", Pago: 0, "Em Aberto": 0, Vencido: 0 },
      { month: "Jun", Pago: 0, "Em Aberto": 0, Vencido: 0 },
      { month: "Jul", Pago: 0, "Em Aberto": 0, Vencido: 0 },
      { month: "Ago", Pago: 0, "Em Aberto": 0, Vencido: 0 },
      { month: "Set", Pago: 0, "Em Aberto": 0, Vencido: 0 },
      { month: "Out", Pago: 0, "Em Aberto": 0, Vencido: 0 },
      { month: "Nov", Pago: 0, "Em Aberto": 0, Vencido: 0 },
      { month: "Dez", Pago: 0, "Em Aberto": 0, Vencido: 0 }
    ];

    const fleetMap: Record<string, { fleet: string; total: number; pago: number; emAberto: number; vencido: number }> = {};
    const docMap: Record<string, { docName: string; total: number; pago: number; emAberto: number; vencido: number; count: number; paidCount: number; openCount: number; expiredCount: number }> = {};
    const monthlyMap: Record<string, {
      key: string;
      label: string;
      sortKey: number;
      totalValue: number;
      paidValue: number;
      openValue: number;
      expiredValue: number;
      platesSet: Set<string>;
      titlesCount: number;
    }> = {};

    filteredFleet.forEach(v => {
      if (v.source === "LICENCAS" && v.documents && v.documents.length > 0) {
        v.documents.forEach(d => {
          const dtNorm = d.type.toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
          if (dtNorm.includes("LIBERACAO")) return;
          if (selectedDocTypesLic.length > 0 && !selectedDocTypesLic.includes(d.type)) {
            return;
          }
          if (!matchesDocLicYearAndMonth(d, v)) return;
          totalCount++;

          const isZeroValDoc = dtNorm.includes("AUTORIZACAO") || dtNorm.includes("FRET") || dtNorm.includes("CADASTRAL") || dtNorm.includes("REGISTRO") || dtNorm.includes("EMPR");
          let val = 0;
          if (!isZeroValDoc) {
            const finCols = getAssociatedFinancials(d.type, Object.keys(v.extraData || {}), v.documents.map(doc => doc.type));
            if (finCols.length > 0) {
              finCols.forEach(fc => {
                val += parseCurrencyVal(v.extraData?.[fc]);
              });
            }
            if (val === 0) {
              const costKey = Object.keys(v.extraData || {}).find(k => {
                const uk = k.toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
                return (uk.includes("VALOR") || uk.includes("CUSTO") || uk.includes("TAXA") || uk.includes("PRECO")) && uk.includes(dtNorm);
              });
              if (costKey) {
                val = parseCurrencyVal(v.extraData?.[costKey]);
              }
              if (val === 0) {
                val = parseCurrencyVal((d as any).cost);
              }
            }
            if (val === 0 && parseCurrencyVal(v.extraData?.["Valor"] || v.extraData?.["VALOR"]) > 0) {
              const validPricedDocs = v.documents.filter((doc: any) => {
                const dn = doc.type.toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
                return !dn.includes("AUTORIZACAO") && !dn.includes("FRET") && !dn.includes("CADASTRAL") && !dn.includes("REGISTRO") && !dn.includes("EMPR") && !dn.includes("LIBERACAO");
              });
              if (validPricedDocs.length > 0) {
                val = parseCurrencyVal(v.extraData?.["Valor"] || v.extraData?.["VALOR"]) / validPricedDocs.length;
              }
            }
          }

          totalVal += val;

          let docTitle = String(d.type || "Outros Documentos").trim();
          if (docTitle.toUpperCase().includes("SERVIÇO DE MONITORAMENTO") || docTitle.toUpperCase().includes("SERVICO DE MONITORAMENTO")) {
            docTitle = docTitle.replace(/SERVIÇO DE MONITORAMENTO/gi, "SERV. MONITORAMENTO")
                               .replace(/SERVICO DE MONITORAMENTO/gi, "SERV. MONITORAMENTO");
          }

          if (!docMap[docTitle]) {
            docMap[docTitle] = { docName: docTitle, total: 0, pago: 0, emAberto: 0, vencido: 0, count: 0, paidCount: 0, openCount: 0, expiredCount: 0 };
          }
          docMap[docTitle].total += val;
          docMap[docTitle].count += 1;

          const flt = v.fleet || "S/ FROTA";
          if (!fleetMap[flt]) {
            fleetMap[flt] = { fleet: flt, total: 0, pago: 0, emAberto: 0, vencido: 0 };
          }
          fleetMap[flt].total += val;

          const vencStr = d.rawExpiryDate || d.expiryDate || v.extraData?.["Vencimento"] || v.extraData?.["VENCIMENTO"];
          const pagStr = v.extraData?.["Pagamento"] || v.extraData?.["PAGAMENTO"];

          let mIdx = getMonthFromDate(vencStr);
          const mInfo = getMonthYearInfo(vencStr || pagStr);
          const mKey = mInfo.key;

          if (!monthlyMap[mKey]) {
            monthlyMap[mKey] = {
              key: mKey,
              label: mInfo.label,
              sortKey: mInfo.sortKey,
              totalValue: 0,
              paidValue: 0,
              openValue: 0,
              expiredValue: 0,
              platesSet: new Set<string>(),
              titlesCount: 0
            };
          }

          monthlyMap[mKey].totalValue += val;
          monthlyMap[mKey].titlesCount += 1;

          const plateOrFleet = (v.plate && v.plate.trim() !== "" && v.plate !== "Vázio") ? v.plate.trim() : (v.fleet ? `Frota ${v.fleet}` : `ID-${v.id}`);
          monthlyMap[mKey].platesSet.add(plateOrFleet);

          let isPaid = false;
          let isExpired = false;

          if (v.source === "LICENCAS") {
            const rawDate = (d.rawExpiryDate || d.expiryDate || "").toString().trim();
            const hasValidDate = rawDate !== "" && rawDate !== "-" && !rawDate.toUpperCase().includes("DEFINIR") && !rawDate.toUpperCase().includes("VAZIO") && !rawDate.toUpperCase().includes("VÁZIO");
            const pagCol = v.extraData?.[`Pagamento_${d.type}`] || v.extraData?.[`PAGAMENTO_${d.type}`] || v.extraData?.["Pagamento"] || v.extraData?.["PAGAMENTO"];
            const isExplicitlyPaid = d.status === 'pagos' || (pagCol && pagCol.toString().trim() !== "" && pagCol.toString().trim() !== "-" && !pagCol.toString().toUpperCase().includes("DEFINIR") && !pagCol.toString().toUpperCase().includes("NAO") && !pagCol.toString().toUpperCase().includes("NÃO"));

            if (isExplicitlyPaid) {
              isPaid = true;
            } else if (hasValidDate) {
              const classification = clientClassifyDocument(rawDate);
              if (classification.status === 'vencido') {
                isExpired = true;
              } else if (classification.status === 'ok') {
                isPaid = true;
              }
            }
          } else {
            isPaid = d.status === 'pagos' || isPagoDoc(v);
            isExpired = !isPaid && (d.status === 'vencido' || isVencidoDoc(v));
          }

          if (isPaid) {
            if (pagStr) {
              const pIdx = getMonthFromDate(pagStr);
              if (pIdx >= 0 && pIdx < 12) mIdx = pIdx;
            }
            paidVal += val;
            paidCount++;
            fleetMap[flt].pago += val;
            docMap[docTitle].pago += val;
            docMap[docTitle].paidCount += 1;
            monthlyMap[mKey].paidValue += val;
            if (mIdx >= 0 && mIdx < 12) monthlyData[mIdx].Pago += val;
          } else if (isExpired) {
            expiredVal += val;
            expiredCount++;
            fleetMap[flt].vencido += val;
            docMap[docTitle].vencido += val;
            docMap[docTitle].expiredCount += 1;
            monthlyMap[mKey].expiredValue += val;
            if (mIdx >= 0 && mIdx < 12) monthlyData[mIdx].Vencido += val;
          } else {
            openVal += val;
            openCount++;
            fleetMap[flt].emAberto += val;
            docMap[docTitle].emAberto += val;
            docMap[docTitle].openCount += 1;
            monthlyMap[mKey].openValue += val;
            if (mIdx >= 0 && mIdx < 12) monthlyData[mIdx]["Em Aberto"] += val;
          }
        });
      } else {
        totalCount++;
        const val = parseCurrencyVal(v.extraData?.["Valor"] || v.extraData?.["VALOR"]);
        totalVal += val;

        let dName = v.extraData?.["Descrição"];
        if (dName === undefined || dName === null || dName === "") {
          const foundKey = Object.keys(v.extraData || {}).find(k => {
            const norm = k.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
            return norm === "descricao" || norm === "documento";
          });
          if (foundKey) dName = v.extraData[foundKey];
        }
        let docTitle = String(dName || "Outros Documentos").trim();
        if (docTitle.toUpperCase().includes("SERVIÇO DE MONITORAMENTO") || docTitle.toUpperCase().includes("SERVICO DE MONITORAMENTO")) {
          docTitle = docTitle.replace(/SERVIÇO DE MONITORAMENTO/gi, "SERV. MONITORAMENTO")
                             .replace(/SERVICO DE MONITORAMENTO/gi, "SERV. MONITORAMENTO");
        }

        if (!docMap[docTitle]) {
          docMap[docTitle] = { docName: docTitle, total: 0, pago: 0, emAberto: 0, vencido: 0, count: 0, paidCount: 0, openCount: 0, expiredCount: 0 };
        }
        docMap[docTitle].total += val;
        docMap[docTitle].count += 1;

        const flt = v.fleet || "S/ FROTA";
        if (!fleetMap[flt]) {
          fleetMap[flt] = { fleet: flt, total: 0, pago: 0, emAberto: 0, vencido: 0 };
        }
        fleetMap[flt].total += val;

        const vencStr = v.extraData?.["Vencimento"] || v.extraData?.["VENCIMENTO"] || (v.documents && v.documents[0]?.rawExpiryDate);
        const pagStr = v.extraData?.["Pagamento"] || v.extraData?.["PAGAMENTO"];

        let mIdx = getMonthFromDate(vencStr);

        const mInfo = getMonthYearInfo(vencStr || pagStr);
        const mKey = mInfo.key;

        if (!monthlyMap[mKey]) {
          monthlyMap[mKey] = {
            key: mKey,
            label: mInfo.label,
            sortKey: mInfo.sortKey,
            totalValue: 0,
            paidValue: 0,
            openValue: 0,
            expiredValue: 0,
            platesSet: new Set<string>(),
            titlesCount: 0
          };
        }

        monthlyMap[mKey].totalValue += val;
        monthlyMap[mKey].titlesCount += 1;

        const plateOrFleet = (v.plate && v.plate.trim() !== "" && v.plate !== "Vázio") ? v.plate.trim() : (v.fleet ? `Frota ${v.fleet}` : `ID-${v.id}`);
        monthlyMap[mKey].platesSet.add(plateOrFleet);

        const isPaid = isPagoDoc(v);
        const isExpired = !isPaid && isVencidoDoc(v);

        if (isPaid) {
          if (pagStr) {
            const pIdx = getMonthFromDate(pagStr);
            if (pIdx >= 0 && pIdx < 12) mIdx = pIdx;
          }
          paidVal += val;
          paidCount++;
          fleetMap[flt].pago += val;
          docMap[docTitle].pago += val;
          docMap[docTitle].paidCount += 1;
          monthlyMap[mKey].paidValue += val;
          if (mIdx >= 0 && mIdx < 12) monthlyData[mIdx].Pago += val;
        } else if (isExpired) {
          expiredVal += val;
          expiredCount++;
          fleetMap[flt].vencido += val;
          docMap[docTitle].vencido += val;
          docMap[docTitle].expiredCount += 1;
          monthlyMap[mKey].expiredValue += val;
          if (mIdx >= 0 && mIdx < 12) monthlyData[mIdx].Vencido += val;
        } else {
          openVal += val;
          openCount++;
          fleetMap[flt].emAberto += val;
          docMap[docTitle].emAberto += val;
          docMap[docTitle].openCount += 1;
          monthlyMap[mKey].openValue += val;
          if (mIdx >= 0 && mIdx < 12) monthlyData[mIdx]["Em Aberto"] += val;
        }
      }
    });

    monthlyData.forEach(m => {
      (m as any).Total = m.Pago + m["Em Aberto"] + m.Vencido;
    });

    const monthlyByMonthYear = Object.values(monthlyMap)
      .sort((a, b) => a.sortKey - b.sortKey)
      .map(m => ({
        ...m,
        platesCount: m.platesSet.size > 0 ? m.platesSet.size : m.titlesCount
      }));

    const maxMonthlyValue = Math.max(...monthlyByMonthYear.map(m => m.totalValue), 1);
    const maxMonthlyPlates = Math.max(...monthlyByMonthYear.map(m => m.platesCount), 1);
    const maxMonthlyTitles = Math.max(...monthlyByMonthYear.map(m => m.titlesCount), 1);

    const topFleets = Object.values(fleetMap)
      .sort((a, b) => b.total - a.total)
      .slice(0, 6);

    const allByDoc = Object.values(docMap).sort((a, b) => b.total - a.total);
    const nonZeroByDoc = allByDoc.filter(d => d.total > 0 && d.count > 0);
    const byDocument = nonZeroByDoc.length > 0 ? nonZeroByDoc : allByDoc.filter(d => d.count > 0 && d.total > 0);

    return {
      totalVal,
      paidVal,
      openVal,
      expiredVal,
      totalCount,
      paidCount,
      openCount,
      expiredCount,
      monthlyData,
      monthlyByMonthYear,
      maxMonthlyValue,
      maxMonthlyPlates,
      maxMonthlyTitles,
      topFleets,
      byDocument
    };
  }, [filteredFleet, selectedDocTypesLic, matchesDocLicYearAndMonth]);

  const visibleDocumentTypes = useMemo(() => {
    const types = new Map<string, string>();
    filteredFleet.forEach(v => {
      v.documents.forEach(d => {
        const dtNorm = d.type.toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        if (dtNorm.includes("LIBERACAO")) return;
        if (!matchesDocLicYearAndMonth(d, v)) return;
        if (!types.has(d.type) || (d.validityPeriod && !types.get(d.type))) {
          types.set(d.type, d.validityPeriod || "");
        }
      });
    });
    return Array.from(types.entries()).map(([type, validity]) => ({ type, validity }));
  }, [filteredFleet, matchesDocLicYearAndMonth]);

  const licenseAlertsList = useMemo(() => {
    const list: Array<{
      id: string;
      docType: string;
      operation: string;
      plate: string;
      fleet: string;
      frequencia: string;
      valor: number;
      valorFormatted: string;
      status: 'vencido' | 'critico' | 'atencao' | 'ok';
      statusLabel: string;
      prazo: string;
      daysRemaining: number;
      vencimento: string;
      driver: string;
      rawDate: string;
    }> = [];

    const licVehicles = filteredFleet.filter(v => 
      v.source === "LICENCAS" && 
      v.plate && 
      v.plate.trim() !== "" && 
      v.plate !== "-" && 
      v.plate !== "–" && 
      v.plate.toUpperCase() !== "NOPLATE"
    );

    licVehicles.forEach(v => {
      const opName = v.operation === "DOC_SISTEMA" ? "GLOBUS" : (v.operation || "-");
      const plate = v.plate || "-";
      const fleetNum = v.fleet || "-";

      if (v.documents && v.documents.length > 0) {
        v.documents.forEach((d, docIdx) => {
          const dtNorm = d.type.toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
          if (dtNorm.includes("LIBERACAO")) return; // Desconsiderar LIBERAÇÃO de relatórios e alertas

          if (selectedDocTypesLic.length > 0 && !selectedDocTypesLic.includes(d.type)) {
            return;
          }
          if (!matchesDocLicYearAndMonth(d, v)) return;
          const rawDate = (d.rawExpiryDate || d.expiryDate || "").toString().trim();
          const hasValidDate = rawDate !== "" && rawDate !== "-" && !rawDate.toUpperCase().includes("DEFINIR") && !rawDate.toUpperCase().includes("VAZIO") && !rawDate.toUpperCase().includes("VÁZIO");

          let status: 'vencido' | 'critico' | 'atencao' | 'ok' = 'ok';
          let daysRemaining = 999;
          let formattedVenc = "-";

          if (hasValidDate) {
            const classification = clientClassifyDocument(rawDate);
            status = classification.status;
            daysRemaining = classification.daysRemaining;
            formattedVenc = classification.formattedDate || d.expiryDate || "-";
          } else {
            formattedVenc = d.expiryDate || "-";
            if (d.status === 'vencido' || d.status === 'critico' || d.status === 'atencao' || d.status === 'ok') {
              status = d.status;
            } else if (d.status === 'pagos') {
              status = 'ok';
            }
          }

          let statusLabel = "OK";
          if (status === 'vencido') statusLabel = "VENCIDO";
          else if (status === 'critico') statusLabel = "CRITICO";
          else if (status === 'atencao') statusLabel = "ATENCAO";
          else if (status === 'ok') statusLabel = "OK";

          let prazoStr = "-";
          if (hasValidDate && daysRemaining !== 999) {
            if (daysRemaining < 0) {
              prazoStr = `Há ${Math.abs(daysRemaining)} dias`;
            } else if (daysRemaining === 0) {
              prazoStr = "Hoje";
            } else {
              prazoStr = `Em ${daysRemaining} dias`;
            }
          }

          // Calculate financial value for this document
          const isZeroValDoc = dtNorm.includes("AUTORIZACAO") || dtNorm.includes("FRET") || dtNorm.includes("CADASTRAL") || dtNorm.includes("REGISTRO") || dtNorm.includes("EMPR");
          let val = 0;
          if (!isZeroValDoc) {
            const finCols = getAssociatedFinancials(d.type, Object.keys(v.extraData || {}));
            if (finCols.length > 0) {
              finCols.forEach(fc => {
                val += parseCurrencyVal(v.extraData?.[fc]);
              });
            }
            if (val === 0) {
              const costKey = Object.keys(v.extraData || {}).find(k => {
                const uk = k.toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
                if (dtNorm.includes("TACO") && (dtNorm.includes("INSP") || dtNorm.includes("TX") || dtNorm.includes("TAXA"))) {
                  return (uk.includes("INSP") || uk.includes("TX") || uk.includes("TAXA")) && uk.includes("TACO");
                }
                return (uk.includes("VALOR") || uk.includes("CUSTO") || uk.includes("TAXA") || uk.includes("PRECO")) && uk.includes(dtNorm);
              });
              if (costKey) {
                val = parseCurrencyVal(v.extraData?.[costKey]);
              }
              if (val === 0) {
                val = parseCurrencyVal((d as any).cost || (d as any).valor) || DEFAULT_DOCUMENT_COST_MAP[d.type] || DEFAULT_DOCUMENT_COST_MAP[dtNorm] || 0;
              }
            }
            if (val === 0 && parseCurrencyVal(v.extraData?.["Valor"] || v.extraData?.["VALOR"]) > 0) {
              const validPricedDocs = v.documents.filter((doc: any) => {
                const dn = doc.type.toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
                return !dn.includes("AUTORIZACAO") && !dn.includes("FRET") && !dn.includes("CADASTRAL") && !dn.includes("REGISTRO") && !dn.includes("EMPR") && !dn.includes("LIBERACAO");
              });
              if (validPricedDocs.length > 0) {
                val = parseCurrencyVal(v.extraData?.["Valor"] || v.extraData?.["VALOR"]) / validPricedDocs.length;
              }
            }
          }
          const valorFormatted = val > 0 ? formatCurrencyBR(val) : "-";

          // Calculate renewal frequency for this document
          let frequencia = "-";
          const model = LICENSE_MODELS_CATALOG.find(m => 
            m.type.toUpperCase().trim() === d.type.toUpperCase().trim() ||
            d.type.toUpperCase().includes(m.type.toUpperCase()) ||
            m.type.toUpperCase().includes(d.type.toUpperCase())
          );

          if (d.validityPeriod && d.validityPeriod.trim() !== "") {
            frequencia = d.validityPeriod.trim();
          } else if (model && (model.frequency || model.validity)) {
            frequencia = model.frequency || model.validity;
          } else {
            frequencia = getLegalValidityPeriod(d.type);
          }
          frequencia = normalizeFrequencyString(frequencia);
          if (!frequencia || frequencia === "-") {
            frequencia = "01 ANO";
          }

          list.push({
            id: `${v.id}-${d.type}-${d.id || docIdx}`,
            docType: d.type,
            operation: opName,
            plate: plate,
            fleet: fleetNum,
            frequencia: frequencia,
            valor: val,
            valorFormatted: valorFormatted,
            status: status,
            statusLabel: statusLabel,
            prazo: prazoStr,
            daysRemaining: daysRemaining,
            vencimento: formattedVenc,
            driver: v.driver || "-",
            rawDate: rawDate
          });
        });
      }
    });

    // Normalize frequency labels and deduplicate list by vehicle + document type
    const alertMap = new Map<string, typeof list[0]>();

    list.forEach(item => {
      item.frequencia = normalizeFrequencyString(item.frequencia);

      const normDoc = normalizeDocTypeForDedup(item.docType);
      const vehicleKey = `${item.plate}_${item.fleet}_${normDoc}`;

      if (!alertMap.has(vehicleKey)) {
        alertMap.set(vehicleKey, item);
      } else {
        const existing = alertMap.get(vehicleKey)!;

        const scoreItem = (it: typeof list[0]) => {
          let score = 0;
          if (it.vencimento && it.vencimento !== "-" && it.daysRemaining !== 999) score += 20;
          if (it.frequencia && /\d+\s*(ANO|ANOS|MES|MÊS|MESES|MÊSES|DIA|DIAS)/i.test(it.frequencia)) score += 10;
          if (it.valor > 0) score += 5;
          return score;
        };

        const existingScore = scoreItem(existing);
        const itemScore = scoreItem(item);

        if (itemScore > existingScore) {
          if (item.valor === 0 && existing.valor > 0) {
            item.valor = existing.valor;
            item.valorFormatted = existing.valorFormatted;
          }
          if ((!item.vencimento || item.vencimento === "-") && existing.vencimento && existing.vencimento !== "-") {
            item.vencimento = existing.vencimento;
            item.prazo = existing.prazo;
            item.daysRemaining = existing.daysRemaining;
            item.status = existing.status;
            item.statusLabel = existing.statusLabel;
            item.rawDate = existing.rawDate;
          }
          alertMap.set(vehicleKey, item);
        } else {
          if (existing.valor === 0 && item.valor > 0) {
            existing.valor = item.valor;
            existing.valorFormatted = item.valorFormatted;
          }
          if ((!existing.vencimento || existing.vencimento === "-") && item.vencimento && item.vencimento !== "-") {
            existing.vencimento = item.vencimento;
            existing.prazo = item.prazo;
            existing.daysRemaining = item.daysRemaining;
            existing.status = item.status;
            existing.statusLabel = item.statusLabel;
            existing.rawDate = item.rawDate;
          }
        }
      }
    });

    const dedupedList = Array.from(alertMap.values());

    dedupedList.forEach(item => {
      if (item.valor === 0) {
        item.valorFormatted = "-";
      }
    });

    const statusPriority: Record<string, number> = {
      vencido: 1,
      critico: 2,
      atencao: 3,
      ok: 4
    };

    dedupedList.sort((a, b) => {
      const prioA = statusPriority[a.status] || 99;
      const prioB = statusPriority[b.status] || 99;
      if (prioA !== prioB) return prioA - prioB;
      return a.daysRemaining - b.daysRemaining;
    });

    return dedupedList;
  }, [filteredFleet, selectedDocTypesLic, matchesDocLicYearAndMonth]);

  const handleSortResumo = (key: 'docType' | 'operation' | 'plate' | 'fleet' | 'frequencia' | 'valor' | 'status' | 'prazo' | 'vencimento') => {
    if (resumoSortKey === key) {
      setResumoSortDir(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setResumoSortKey(key);
      setResumoSortDir('asc');
    }
  };

  const renderSortIcon = (key: string) => {
    if (resumoSortKey !== key) {
      return <ArrowUpDown size={12} className="opacity-50 group-hover:opacity-100 transition-opacity ml-1 inline shrink-0" />;
    }
    return resumoSortDir === 'asc' ? (
      <ArrowUp size={12} className="text-cyan-300 ml-1 inline shrink-0" />
    ) : (
      <ArrowDown size={12} className="text-cyan-300 ml-1 inline shrink-0" />
    );
  };

  const filteredResumoList = useMemo(() => {
    const list = licenseAlertsList.filter(item => {
      const matchesStatus = 
        resumoStatusFilter === 'todos' ? true :
        resumoStatusFilter === 'alertas' ? (item.status === 'vencido' || item.status === 'critico' || item.status === 'atencao') :
        item.status === resumoStatusFilter;

      const matchesDocType = selectedDocTypesLic.length === 0 || selectedDocTypesLic.includes(item.docType);
      const matchesFrequency = selectedFrequencyLic.length === 0 || selectedFrequencyLic.includes(item.frequencia);

      const query = (resumoSearchTerm || searchTerm).toLowerCase().trim();
      const matchesSearch = !query || 
        item.docType.toLowerCase().includes(query) ||
        item.operation.toLowerCase().includes(query) ||
        item.plate.toLowerCase().includes(query) ||
        item.fleet.toLowerCase().includes(query) ||
        item.driver.toLowerCase().includes(query) ||
        item.frequencia.toLowerCase().includes(query) ||
        item.valorFormatted.toLowerCase().includes(query) ||
        item.vencimento.toLowerCase().includes(query);

      return matchesStatus && matchesDocType && matchesFrequency && matchesSearch;
    });

    list.sort((a, b) => {
      let comp = 0;
      switch (resumoSortKey) {
        case 'docType':
          comp = a.docType.localeCompare(b.docType, 'pt-BR');
          break;
        case 'operation':
          comp = a.operation.localeCompare(b.operation, 'pt-BR');
          break;
        case 'plate':
          comp = a.plate.localeCompare(b.plate, 'pt-BR');
          break;
        case 'fleet': {
          const nA = parseInt(a.fleet, 10);
          const nB = parseInt(b.fleet, 10);
          if (!isNaN(nA) && !isNaN(nB)) {
            comp = nA - nB;
          } else {
            comp = a.fleet.localeCompare(b.fleet, 'pt-BR');
          }
          break;
        }
        case 'frequencia':
          comp = a.frequencia.localeCompare(b.frequencia, 'pt-BR');
          break;
        case 'valor':
          comp = a.valor - b.valor;
          break;
        case 'status': {
          const statusOrder: Record<string, number> = { vencido: 1, critico: 2, atencao: 3, ok: 4 };
          comp = (statusOrder[a.status] || 99) - (statusOrder[b.status] || 99);
          break;
        }
        case 'prazo':
          comp = a.daysRemaining - b.daysRemaining;
          break;
        case 'vencimento': {
          const tA = a.rawDate ? new Date(a.rawDate).getTime() : 9999999999999;
          const tB = b.rawDate ? new Date(b.rawDate).getTime() : 9999999999999;
          comp = tA - tB;
          break;
        }
      }
      return resumoSortDir === 'asc' ? comp : -comp;
    });

    return list;
  }, [licenseAlertsList, resumoStatusFilter, selectedDocTypesLic, selectedFrequencyLic, resumoSearchTerm, searchTerm, resumoSortKey, resumoSortDir]);

  const financialColumns = useMemo(() => {
    const cols = new Set<string>();
    filteredFleet.forEach(v => {
      if (v.extraData) {
        Object.keys(v.extraData).forEach(key => {
          const uk = key.toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
          const isBasic = ["PREFIXO", "PLACA", "CIDADE", "BANHEIRO", "MOTORISTA", "FROTA", "WC", "VEICULO", "ID", "OPERACAO", "CLIENT", "CITYBASE", "VEHICLETYPE", "STATUS", "HASBATHROOM", "ORIGIN", "SOURCE", "LASTUPDATE", "LAT", "LNG", "DOCUMENTS", "OVERALLSTATUS", "EXTRADATA", "_STATUS", "_DAYSREMAINING", "DATA ATUALIZACAO"].includes(uk);
          
          const isFinancial = uk.includes("CUSTO") || uk.includes("VALOR") || uk.includes("TAXA") || uk.includes("TX ") || uk.includes("CUSTA") || uk.includes("PAGO") || uk === "TACOGRAFO" || uk.includes("LICENCA AGR");
          
          if (!isBasic && isFinancial && key.trim()) {
            cols.add(key.trim());
          }
        });
      }
    });
    return Array.from(cols).sort((a, b) => a.localeCompare(b));
  }, [filteredFleet]);

  const interleavedDetailedColumns = useMemo(() => {
    const columns: Array<{ type: 'document' | 'financial'; name: string; validity?: string }> = [];
    const matchedFinCols = new Set<string>();
    
    visibleDocumentTypes.forEach(doc => {
      columns.push({ type: 'document', name: doc.type, validity: doc.validity });
      
      const associated = getAssociatedFinancials(doc.type, financialColumns);
      associated.forEach(finCol => {
        if (!matchedFinCols.has(finCol)) {
          columns.push({ type: 'financial', name: finCol });
          matchedFinCols.add(finCol);
        }
      });
    });
    
    financialColumns.forEach(finCol => {
      if (!matchedFinCols.has(finCol)) {
        columns.push({ type: 'financial', name: finCol });
      }
    });
    
    return columns;
  }, [visibleDocumentTypes, financialColumns]);

  return (
    <>
      {showCover && (
        <LandingCover 
          onStart={() => setShowCover(false)} 
          lastUpdated={lastUpdated} 
        />
      )}
      <div className={cn("flex h-screen font-sans overflow-hidden transition-colors duration-300", theme === "dark" ? "bg-slate-950 text-slate-100 dark" : "bg-slate-50 text-slate-900")}>
      {/* Sidebar */}
      <aside 
        translate="no"
        className={cn(
          "glass border-r border-slate-200/50 dark:border-slate-800 transition-all duration-500 ease-in-out z-30 flex flex-col relative shrink-0 notranslate",
          isSidebarOpen ? "w-[310px]" : "w-20"
        )}
      >
        <div className={cn(
          "flex items-center border-b border-slate-200/40 dark:border-slate-800/80 transition-all duration-300 shrink-0",
          isSidebarOpen ? "p-5 gap-3" : "py-5 px-0 justify-center"
        )}>
          {settings.showLogo ? (
            <img src={settings.logoUrl || UNI_LOGO} alt="UNI Logo" className="w-10 h-10 object-contain drop-shadow-sm shrink-0" referrerPolicy="no-referrer" />
          ) : (
            <div className="w-10 h-10 bg-blue-600 rounded-2xl flex items-center justify-center shadow-lg shadow-blue-500/20 shrink-0">
              <ShieldCheck className="text-white" size={24} />
            </div>
          )}
          {isSidebarOpen && (
            <motion.div
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              className="flex flex-col overflow-hidden notranslate"
              translate="no"
            >
              <span className="font-display text-xl font-black tracking-tight text-slate-900 dark:text-white leading-tight truncate">{settings.companyName}</span>
              <span className="text-[10px] font-bold text-blue-600 dark:text-blue-400 uppercase tracking-widest">Gestão de Documentos</span>
            </motion.div>
          )}
        </div>

        <div className="flex-1 relative min-h-0 flex flex-col overflow-hidden">
          {/* Indicador / Botão suave de rolar para cima (quando há conteúdo acima) */}
          <AnimatePresence>
            {sidebarCanScrollUp && (
              <motion.button
                type="button"
                translate="no"
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                onClick={() => sidebarNavRef.current?.scrollBy({ top: -140, behavior: 'smooth' })}
                title="Rolar menu para cima"
                aria-label="Rolar menu para cima"
                className={cn(
                  "absolute top-1 left-1/2 -translate-x-1/2 z-30 rounded-full bg-slate-900/95 text-cyan-400 border border-cyan-500/50 shadow-lg backdrop-blur-md cursor-pointer hover:bg-cyan-500/20 hover:scale-110 active:scale-95 transition-all notranslate",
                  isSidebarOpen ? "w-28 flex items-center justify-center gap-1.5 py-1 px-2 text-[10px] font-bold" : "w-7 h-7 flex items-center justify-center p-1"
                )}
              >
                <ChevronUp size={14} className="animate-pulse" />
                {isSidebarOpen && <span>Subir</span>}
              </motion.button>
            )}
          </AnimatePresence>

          <nav 
            ref={sidebarNavRef}
            translate="no"
            className={cn(
              "flex-1 overflow-y-auto overflow-x-hidden sidebar-scroll [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden transition-all duration-300 overscroll-contain notranslate",
              isSidebarOpen ? "p-3 space-y-2" : "py-4 px-2 space-y-2.5 flex flex-col items-center w-full min-h-0"
            )}
          >
            {/* Botões de Tema: CLARO e ESCURO (inseridos diretamente acima de Dashboard Licenças) */}
            <div className={cn("mb-3 transition-all duration-300 shrink-0 notranslate", !isSidebarOpen && "w-full flex justify-center")} translate="no">
              {isSidebarOpen ? (
                <div className="bg-slate-200/80 dark:bg-slate-800/90 p-1.5 rounded-2xl border border-slate-300/70 dark:border-slate-700/80 flex items-center gap-1 shadow-inner notranslate" translate="no">
                  <motion.button 
                    type="button"
                    translate="no"
                    whileTap={{ scale: 0.95, y: 1 }}
                    onClick={() => setTheme("light")}
                    className={cn(
                      "flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-xl text-xs font-black transition-all duration-300 cursor-pointer notranslate",
                      theme === "light" 
                        ? "bg-white text-blue-600 shadow-[inset_0_2px_4px_rgba(0,0,0,0.1),0_2px_4px_rgba(0,0,0,0.05)] border border-slate-200/80 scale-[1.02] translate-y-[1px]" 
                        : "text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                    )}
                  >
                    <Sun size={16} className={cn("transition-transform duration-300", theme === "light" && "text-amber-500 fill-amber-400 scale-110")} />
                    <span className="notranslate">CLARO</span>
                  </motion.button>
                  <motion.button 
                    type="button"
                    translate="no"
                    whileTap={{ scale: 0.95, y: 1 }}
                    onClick={() => setTheme("dark")}
                    className={cn(
                      "flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-xl text-xs font-black transition-all duration-300 cursor-pointer notranslate",
                      theme === "dark" 
                        ? "bg-slate-900 text-cyan-400 shadow-[inset_0_2px_6px_rgba(0,0,0,0.8),0_0_12px_rgba(6,182,212,0.3)] border border-slate-700 scale-[1.02] translate-y-[1px]" 
                        : "text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                    )}
                  >
                    <Moon size={16} className={cn("transition-transform duration-300", theme === "dark" && "text-cyan-400 fill-cyan-400/30 scale-110")} />
                    <span className="notranslate">ESCURO</span>
                  </motion.button>
                </div>
              ) : (
                <CollapsedThemeToggle theme={theme} setTheme={setTheme} />
              )}
            </div>

            <NavItem 
              icon={<Home size={22} />} 
              label="Página Inicial" 
              active={false} 
              onClick={() => {
                setShowCover(true);
                setActiveTab("dashboard");
                setActiveDashboardSubTab("licencas");
              }}
              collapsed={!isSidebarOpen}
            />
            <NavItem 
              icon={<LayoutDashboard size={22} />} 
              label="Dashboard Licenças" 
              active={activeTab === "dashboard" && activeDashboardSubTab === "licencas"} 
              onClick={() => {
                setActiveTab("dashboard");
                setActiveDashboardSubTab("licencas");
              }}
              collapsed={!isSidebarOpen}
            />
            <NavItem 
              icon={<BarChart3 size={22} />} 
              label="Dashboard Documentação" 
              active={activeTab === "dashboard" && activeDashboardSubTab === "documentacao"} 
              onClick={() => {
                setActiveTab("dashboard");
                setActiveDashboardSubTab("documentacao");
              }}
              collapsed={!isSidebarOpen}
            />
            <NavItem 
              icon={<Truck size={22} />} 
              label="Licenças Detalhadas" 
              active={activeTab === "licencas_detalhadas"} 
              onClick={() => setActiveTab("licencas_detalhadas")}
              collapsed={!isSidebarOpen}
            />
            <NavItem 
              icon={<DollarSign size={22} />} 
              label="Financeiro - Licenças" 
              active={activeTab === "financeiro_licencas"} 
              onClick={() => setActiveTab("financeiro_licencas")}
              collapsed={!isSidebarOpen}
            />
            <NavItem 
              icon={<FileText size={22} />} 
              label="Documentação Detalhada" 
              active={activeTab === "licencas_documentos"} 
              onClick={() => setActiveTab("licencas_documentos")}
              collapsed={!isSidebarOpen}
            />
            <NavItem 
              icon={<Receipt size={22} />} 
              label="Financeiro - Docs" 
              active={activeTab === "financeiro_docs"} 
              onClick={() => setActiveTab("financeiro_docs")}
              collapsed={!isSidebarOpen}
            />
            <NavItem 
              icon={<MapIcon size={22} />} 
              label="Mapas" 
              active={activeTab === "map"} 
              onClick={() => setActiveTab("map")}
              collapsed={!isSidebarOpen}
            />
            <NavItem 
              icon={<Settings size={22} />} 
              label="Configurações" 
              active={activeTab === "settings"} 
              onClick={() => setActiveTab("settings")}
              collapsed={!isSidebarOpen}
            />
            <NavItem 
              icon={<HelpCircle size={22} />} 
              label="Como Usar?" 
              active={activeTab === "tutorial"} 
              onClick={() => setActiveTab("tutorial")}
              collapsed={!isSidebarOpen}
            />
          </nav>

          {/* Indicador / Botão suave de rolar para baixo (quando há mais itens abaixo) */}
          <AnimatePresence>
            {sidebarCanScrollDown && (
              <motion.button
                type="button"
                translate="no"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 6 }}
                onClick={() => sidebarNavRef.current?.scrollBy({ top: 140, behavior: 'smooth' })}
                title="Rolar menu para baixo"
                aria-label="Rolar menu para baixo"
                className={cn(
                  "absolute bottom-1 left-1/2 -translate-x-1/2 z-30 rounded-full bg-slate-900/95 text-cyan-400 border border-cyan-500/50 shadow-lg backdrop-blur-md cursor-pointer hover:bg-cyan-500/20 hover:scale-110 active:scale-95 transition-all notranslate",
                  isSidebarOpen ? "w-28 flex items-center justify-center gap-1.5 py-1 px-2 text-[10px] font-bold" : "w-7 h-7 flex items-center justify-center p-1"
                )}
              >
                <ChevronDown size={14} className="animate-pulse" />
                {isSidebarOpen && <span className="notranslate">Descer</span>}
              </motion.button>
            )}
          </AnimatePresence>
        </div>

        {/* Indicador de Conexão Firebase */}
        <div className={cn(
          "border-t border-slate-200/40 dark:border-slate-800/80 transition-all duration-300 shrink-0",
          isSidebarOpen ? "p-3" : "py-3 px-2 flex justify-center"
        )}>
          <FirebaseStatusIndicator isSidebarOpen={isSidebarOpen} />
        </div>

        <div className={cn(
          "border-t border-slate-200/40 dark:border-slate-800/80 transition-all duration-300 shrink-0",
          isSidebarOpen ? "p-3" : "py-3 px-2 flex justify-center"
        )}>
          <SidebarToggleButton3D 
            isOpen={isSidebarOpen} 
            onToggle={() => setIsSidebarOpen(!isSidebarOpen)} 
          />
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col overflow-hidden relative">
        {/* Header */}
        <header className="glass border-b border-slate-200/40 dark:border-slate-800 h-20 flex items-center justify-between px-8 shrink-0 z-50">
          <div className="flex items-center gap-4 flex-1 max-w-xl">
            <div className="relative w-full group">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-blue-500 transition-colors" size={18} />
              <input 
                type="text" 
                placeholder="Buscar placa, motorista ou operação..." 
                className="w-full pl-12 pr-4 py-3 bg-white/50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/70 rounded-2xl text-sm focus:bg-white dark:focus:bg-slate-800 text-slate-900 dark:text-white focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all outline-none shadow-sm placeholder:text-slate-400"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>

          <div className="flex items-center gap-6">
            <div className="relative group/refresh flex flex-col items-center justify-center -my-1">
              <button 
                onClick={() => fetchFleet()}
                title="Forçar atualização manual dos dados"
                aria-label="Forçar atualização manual dos dados"
                className={cn(
                  "p-1.5 text-slate-500 dark:text-slate-400 hover:bg-white dark:hover:bg-slate-800 hover:text-blue-600 dark:hover:text-blue-400 hover:shadow-md rounded-xl transition-all",
                  loading && "animate-spin text-blue-600 dark:text-blue-400"
                )}
              >
                <RefreshCw size={18} />
              </button>

              {/* Data e horário da atualização embaixo do botão */}
              <div className="flex flex-col items-center text-center -mt-0.5 select-none leading-none">
                <span className="text-[9.5px] font-semibold text-slate-600 dark:text-slate-300 tracking-tight">
                  {format(lastUpdated, "dd/MM/yyyy")}
                </span>
                <span className={cn(
                  "text-[9px] font-bold tracking-wider mt-0.5",
                  loading ? "text-amber-500 dark:text-amber-400 animate-pulse" : "text-blue-600 dark:text-blue-400"
                )}>
                  {loading ? "Atualizando..." : format(lastUpdated, "HH:mm:ss")}
                </span>
              </div>

              {/* Tooltip flutuante explicativo */}
              <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 px-3 py-2 bg-slate-900/95 dark:bg-slate-800/95 backdrop-blur-sm text-white text-xs font-semibold rounded-xl shadow-2xl whitespace-nowrap opacity-0 translate-y-1 pointer-events-none group-hover/refresh:opacity-100 group-hover/refresh:translate-y-0 transition-all duration-200 z-50 flex flex-col items-center gap-1 border border-slate-700/60">
                <div className="flex items-center gap-2">
                  <RefreshCw size={13} className={cn("text-blue-400 shrink-0", loading && "animate-spin")} />
                  <span>Forçar atualização manual</span>
                </div>
                <div className="text-[10.5px] font-normal text-slate-300 border-t border-slate-700/60 pt-1 mt-0.5 w-full text-center">
                  Atualizado em: <strong className="text-white font-semibold">{format(lastUpdated, "dd/MM/yyyy 'às' HH:mm:ss")}</strong>
                </div>
                {/* Seta do tooltip */}
                <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-slate-900/95 dark:bg-slate-800/95 rotate-45 border-l border-t border-slate-700/60"></div>
              </div>
            </div>

            {/* Botão de Salvamento Manual de Dados e Justificativas */}
            <div className="relative group/save flex flex-col items-center justify-center -my-1">
              <button 
                type="button"
                onClick={() => handleManualSaveAll()}
                disabled={savingManual}
                title="Salvar dados e justificativas manualmente"
                aria-label="Salvar dados e justificativas manualmente"
                className={cn(
                  "p-1.5 text-slate-500 dark:text-slate-400 hover:bg-white dark:hover:bg-slate-800 hover:text-emerald-600 dark:hover:text-emerald-400 hover:shadow-md rounded-xl transition-all cursor-pointer relative",
                  savingManual && "animate-pulse text-amber-500 dark:text-amber-400",
                  saveSuccessNotice && "text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40"
                )}
              >
                {saveSuccessNotice ? (
                  <CheckCircle2 size={18} className="text-emerald-500 dark:text-emerald-400" />
                ) : (
                  <Save size={18} className={cn(savingManual && "animate-spin")} />
                )}
                {saveSuccessNotice && (
                  <span className="absolute -top-1 -right-1 flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                  </span>
                )}
              </button>

              {/* Data e horário do último salvamento embaixo do botão */}
              <div className="flex flex-col items-center text-center -mt-0.5 select-none leading-none">
                <span className="text-[9.5px] font-semibold text-slate-600 dark:text-slate-300 tracking-tight">
                  {format(lastSaved, "dd/MM/yyyy")}
                </span>
                <span className={cn(
                  "text-[9px] font-bold tracking-wider mt-0.5",
                  savingManual 
                    ? "text-amber-500 dark:text-amber-400 animate-pulse" 
                    : (saveSuccessNotice 
                        ? "text-emerald-600 dark:text-emerald-400 font-extrabold" 
                        : "text-emerald-600 dark:text-emerald-400")
                )}>
                  {savingManual ? "Salvando..." : format(lastSaved, "HH:mm:ss")}
                </span>
              </div>

              {/* Tooltip flutuante explicativo */}
              <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 px-3 py-2 bg-slate-900/95 dark:bg-slate-800/95 backdrop-blur-sm text-white text-xs font-semibold rounded-xl shadow-2xl whitespace-nowrap opacity-0 translate-y-1 pointer-events-none group-hover/save:opacity-100 group-hover/save:translate-y-0 transition-all duration-200 z-50 flex flex-col items-center gap-1 border border-slate-700/60">
                <div className="flex items-center gap-2">
                  <Save size={13} className="text-emerald-400 shrink-0" />
                  <span>Salvar Dados Manualmente</span>
                </div>
                <div className="text-[10.5px] font-normal text-slate-300 border-t border-slate-700/60 pt-1 mt-0.5 w-full text-center">
                  Último salvamento: <strong className="text-emerald-300 font-semibold">{format(lastSaved, "dd/MM/yyyy 'às' HH:mm:ss")}</strong>
                </div>
                <div className="text-[9.5px] font-normal text-slate-400">
                  Grava em cache local, servidor e Firestore
                </div>
                {/* Seta do tooltip */}
                <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-slate-900/95 dark:bg-slate-800/95 rotate-45 border-l border-t border-slate-700/60"></div>
              </div>
            </div>

            {/* Botão de Maximizar Tela / Modo Tela Cheia no Navegador */}
            <div className="relative group/fullscreen flex items-center justify-center">
              <button 
                type="button"
                onClick={toggleFullscreen}
                title={isFullscreen ? "Restaurar Tela (Sair de Tela Cheia)" : "Maximizar Tela (Tela Cheia)"}
                aria-label={isFullscreen ? "Restaurar Tela (Sair de Tela Cheia)" : "Maximizar Tela (Tela Cheia)"}
                className={cn(
                  "p-2.5 text-slate-500 dark:text-slate-400 hover:bg-white dark:hover:bg-slate-800 hover:text-blue-600 dark:hover:text-cyan-400 hover:shadow-md rounded-xl transition-all cursor-pointer border border-transparent hover:border-slate-200/60 dark:hover:border-slate-700/60",
                  isFullscreen && "bg-blue-50 dark:bg-cyan-950/40 text-blue-600 dark:text-cyan-400 border-blue-200 dark:border-cyan-800 shadow-sm"
                )}
              >
                {isFullscreen ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
              </button>

              {/* Tooltip flutuante informativo ao passar o mouse */}
              <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 px-3 py-2 bg-slate-900/95 dark:bg-slate-800/95 backdrop-blur-sm text-white text-xs font-semibold rounded-xl shadow-2xl whitespace-nowrap opacity-0 translate-y-1 pointer-events-none group-hover/fullscreen:opacity-100 group-hover/fullscreen:translate-y-0 transition-all duration-200 z-50 flex flex-col items-center gap-1 border border-slate-700/60">
                <div className="flex items-center gap-1.5">
                  {isFullscreen ? (
                    <Minimize2 size={13} className="text-cyan-400 shrink-0" />
                  ) : (
                    <Maximize2 size={13} className="text-blue-400 shrink-0" />
                  )}
                  <span>{isFullscreen ? "Restaurar Tela Normal" : "Maximizar Tela (Tela Cheia)"}</span>
                </div>
                <div className="text-[10px] font-normal text-slate-300 border-t border-slate-700/60 pt-1 mt-0.5 w-full text-center">
                  {isFullscreen ? "Pressione ESC ou clique para sair" : "Expande para tela inteira no navegador"}
                </div>
                {/* Seta do tooltip */}
                <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-slate-900/95 dark:bg-slate-800/95 rotate-45 border-l border-t border-slate-700/60"></div>
              </div>
            </div>

            <div className="relative">
              <button 
                onClick={() => setShowNotifications(!showNotifications)}
                className={cn(
                  "p-2.5 rounded-xl transition-all relative",
                  showNotifications ? "bg-blue-600 text-white shadow-lg shadow-blue-500/30" : "text-slate-500 dark:text-slate-400 hover:bg-white dark:hover:bg-slate-800 hover:text-blue-600 dark:hover:text-blue-400 hover:shadow-md"
                )}
              >
                <Bell size={20} />
                {stats.expiredDocs > 0 && (
                  <span className="absolute top-2 right-2 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-white dark:border-slate-900 animate-pulse"></span>
                )}
              </button>
              
              <AnimatePresence>
                {showNotifications && (
                  <NotificationPopover 
                    expiredDocs={stats.expiredDocuments} 
                    onClose={() => setShowNotifications(false)} 
                  />
                )}
              </AnimatePresence>
            </div>
            <div className="flex items-center gap-3 pl-4 border-l border-slate-200 dark:border-slate-800">
              <div className="flex flex-col items-end">
                <span className="text-xs font-bold text-slate-900 dark:text-white">Viação Uni</span>
                <span className="text-[10px] font-medium text-slate-500 dark:text-slate-400 uppercase">Administrador</span>
              </div>
              <div className="h-10 w-10 rounded-2xl bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center text-white font-black text-sm shadow-lg shadow-blue-500/20">
                VU
              </div>
            </div>
          </div>
        </header>

        {/* Notificação Toast Flutuante de Salvamento Manual */}
        <AnimatePresence>
          {saveSuccessNotice && (
            <motion.div
              initial={{ opacity: 0, y: -20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -20, scale: 0.95 }}
              transition={{ duration: 0.25 }}
              className="fixed top-24 right-8 z-[9999] flex items-center gap-2.5 px-4 py-2.5 bg-emerald-600/95 dark:bg-emerald-600/95 backdrop-blur-md text-white rounded-2xl shadow-2xl shadow-emerald-950/30 text-xs font-bold border border-emerald-400/40 pointer-events-none"
            >
              <CheckCircle2 size={16} className="text-white shrink-0" />
              <span>Salvamento manual realizado com sucesso ({format(lastSaved, "HH:mm:ss")})!</span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-8">
          {loading && fleet.length === 0 && activeTab !== "tutorial" && (
            <div className="h-full flex flex-col items-center justify-center text-slate-500 space-y-4">
              <RefreshCw className="animate-spin text-blue-600" size={48} />
              <div className="text-center">
                <h2 className="text-xl font-bold text-slate-900">
                  {serverStarting ? "Iniciando Servidor..." : "Carregando Dados..."}
                </h2>
                <p className="text-sm text-slate-500">
                  {serverStarting 
                    ? "O servidor está sendo preparado. Isso pode levar alguns segundos." 
                    : "Buscando informações da frota nas planilhas..."}
                </p>
              </div>
            </div>
          )}

          {!loading && fleet.length === 0 && !error && activeTab !== "tutorial" && (
            <div className="h-full flex flex-col items-center justify-center text-slate-500 space-y-4">
              <Truck className="text-slate-300" size={64} />
              <div className="text-center">
                <h2 className="text-xl font-bold text-slate-900">Nenhum veículo encontrado</h2>
                <p className="text-sm text-slate-500">Não foi possível encontrar dados nas planilhas configuradas.</p>
                <button 
                  onClick={() => fetchFleet()}
                  className="mt-4 px-6 py-2 bg-blue-600 text-white rounded-xl font-bold text-sm hover:bg-blue-700 transition-all"
                >
                  Tentar Novamente
                </button>
              </div>
            </div>
          )}

          {error && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl flex items-center gap-3 text-red-700">
              <AlertTriangle size={20} />
              <p className="text-sm font-medium">{error}</p>
              <button 
                onClick={() => fetchFleet()}
                className="ml-auto text-xs font-bold uppercase tracking-wider hover:underline"
              >
                Tentar novamente
              </button>
            </div>
          )}
          <AnimatePresence mode="wait">


            {activeTab === "dashboard" && fleet.length > 0 && (
              <motion.div 
                key="dashboard"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="space-y-8"
              >
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div className="flex items-center gap-6">
                    <div>
                      <h1 className="text-3xl md:text-4xl font-display font-black text-slate-900 dark:text-white tracking-tight">
                        {activeDashboardSubTab === "licencas" 
                          ? "Dashboard Licenças" 
                          : "Dashboard Docs"}
                      </h1>
                      <p className="text-sm text-slate-500 dark:text-slate-400 font-medium">Última atualização: {format(new Date(), "HH:mm:ss")}</p>
                    </div>


                  </div>

                  <div className="flex flex-wrap items-center gap-2.5">
                    {/* Seletor / Flag para incluir resumos e cards no relatório */}
                    <label 
                      className="flex items-center gap-2 cursor-pointer px-3.5 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700/80 transition-all shadow-sm select-none"
                      title="Ativar ou desativar inclusão de cards e resumos visuais nos relatórios PDF antes de salvar ou imprimir"
                    >
                      <input 
                        type="checkbox"
                        checked={includePdfSummaries}
                        onChange={(e) => toggleIncludePdfSummaries(e.target.checked)}
                        className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer accent-blue-600"
                      />
                      <span className="flex items-center gap-1.5">
                        <span className="hidden sm:inline">Cards/Resumo no Relatório:</span>
                        <span className="sm:hidden">Resumo PDF:</span>
                        <span className={cn(
                          "px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider transition-colors",
                          includePdfSummaries 
                            ? "bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800" 
                            : "bg-slate-150 dark:bg-slate-700 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-600"
                        )}>
                          {includePdfSummaries ? "SIM" : "NÃO"}
                        </span>
                      </span>
                    </label>

                    <button 
                      onClick={handlePrint}
                      className="flex items-center gap-2 px-5 py-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl text-sm font-bold text-slate-600 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition-all shadow-sm hover:shadow-md"
                    >
                      <Printer size={18} />
                      Imprimir
                    </button>
                    
                    <button 
                      onClick={exportBoardReport}
                      className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-sm font-black text-white hover:bg-blue-700 rounded-2xl transition-all shadow-md shadow-blue-600/20 cursor-pointer"
                      title="Baixar Relatório Executivo da Diretoria em PDF"
                    >
                      <Download size={18} />
                      <span>Relatório Diretoria</span>
                    </button>

                    <div className="flex items-center glass border border-white/40 rounded-2xl shadow-sm overflow-hidden">
                      <button 
                        onClick={() => handleShareEmail()}
                        className="p-2.5 text-slate-500 hover:bg-white hover:text-blue-600 transition-all border-l border-slate-100"
                        title="Compartilhar Resumo por E-mail"
                      >
                        <Mail size={18} />
                      </button>
                      <button 
                        onClick={() => handleShareWhatsApp()}
                        className="p-2.5 text-slate-500 hover:bg-white hover:text-green-600 transition-all border-l border-slate-100"
                        title="Compartilhar Resumo por WhatsApp"
                      >
                        <MessageSquare size={18} />
                      </button>
                      <button 
                        onClick={handleAutoSendPDF}
                        className="p-2.5 text-slate-500 hover:bg-white hover:text-blue-600 transition-all border-l border-slate-100"
                        title="Gerar PDF e Disparar (E-mail + WhatsApp)"
                      >
                        <Send size={18} />
                      </button>
                    </div>
                  </div>
                </div>

                {/* Dashboard Filters Toolbar */}
                <div className="flex flex-wrap items-center justify-between gap-4 bg-slate-50 dark:bg-slate-900/60 p-4 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm no-print">
                  <div className="flex items-center gap-2">
                    <button 
                      onClick={() => {
                        if (activeDashboardSubTab === "licencas") {
                          setIsDashLicFilterVisible(!isDashLicFilterVisible);
                        } else {
                          setIsDashDocFilterVisible(!isDashDocFilterVisible);
                        }
                      }}
                      className={cn(
                        "flex items-center gap-2 px-5 py-2.5 rounded-2xl text-xs font-black uppercase tracking-widest transition-all border shadow-sm",
                        (activeDashboardSubTab === "licencas" ? isDashLicFilterVisible : isDashDocFilterVisible)
                          ? "bg-slate-900 dark:bg-blue-600 text-white border-slate-900 dark:border-blue-600 shadow-lg shadow-slate-200 dark:shadow-none" 
                          : "bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600"
                      )}
                    >
                      <Filter size={14} />
                      {(activeDashboardSubTab === "licencas" ? isDashLicFilterVisible : isDashDocFilterVisible) ? "Ocultar Filtros" : "Mostrar Filtros"}
                      {(activeDashboardSubTab === "licencas" ? isDashLicFilterVisible : isDashDocFilterVisible) ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    </button>
                    
                    <button 
                      onClick={() => {
                        if (activeDashboardSubTab === "licencas") {
                          setSelectedPlatesLic([]);
                          setSelectedStatusLic([]);
                          setSelectedFleetStatusLic([]);
                          setSelectedOperationsLic([]);
                          setSelectedCitiesLic([]);
                        } else {
                          setSelectedPlatesDocDash([]);
                          setSelectedStatusDocDash([]);
                          setSelectedFleetStatusDocDash([]);
                          setSelectedFleetDocDash([]);
                          setSelectedDescDocDash([]);
                        }
                        setSearchTerm("");
                      }}
                      className="px-5 py-2.5 text-slate-500 dark:text-slate-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-white dark:hover:bg-slate-800 rounded-2xl text-xs font-black uppercase tracking-widest transition-all border border-transparent hover:border-red-100 dark:hover:border-red-900/40 hover:shadow-md flex items-center gap-2"
                    >
                      <RotateCcw size={14} />
                      Limpar Filtros
                    </button>
                  </div>
                  
                  {activeDashboardSubTab === "documentacao" && (
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setExibirDocsSemPlaca(!exibirDocsSemPlaca)}
                        className={cn(
                          "flex items-center gap-2 px-5 py-2.5 rounded-2xl text-xs font-black uppercase tracking-widest transition-all border shadow-sm",
                          exibirDocsSemPlaca 
                            ? "bg-blue-600 text-white border-blue-600 shadow-md shadow-blue-100" 
                            : "bg-white text-slate-600 border-slate-200 hover:border-slate-300"
                        )}
                      >
                        {exibirDocsSemPlaca ? <Eye size={14} /> : <EyeOff size={14} />}
                        {exibirDocsSemPlaca ? "Exibindo Docs sem Placa" : "Ocultando Docs sem Placa"}
                      </button>
                    </div>
                  )}
                </div>

                {/* Collapsible Filter Panels */}
                <AnimatePresence mode="wait">
                  {activeDashboardSubTab === "licencas" && isDashLicFilterVisible && (
                    <motion.div 
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto', transitionEnd: { overflow: 'visible' } }}
                      exit={{ opacity: 0, height: 0, transitionEnd: { overflow: 'hidden' } }}
                      transition={{ duration: 0.3, ease: "easeInOut" }}
                      className="relative z-50 my-2"
                      key="dash-lic-filters"
                    >
                      <div className="glass-card p-6 rounded-3xl space-y-6 bg-slate-50/50">
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 gap-4 items-end">
                          <div className="space-y-2">
                            <MultiSelect 
                              label="Placa"
                              options={platesLicOpts}
                              selected={selectedPlatesLic}
                              onChange={setSelectedPlatesLic}
                            />
                          </div>
                          
                          <div className="space-y-2">
                            <MultiSelect 
                              label="Status Documentação"
                              options={['ok', 'atencao', 'critico', 'vencido']}
                              selected={selectedStatusLic}
                              onChange={setSelectedStatusLic}
                              formatOption={(opt) => {
                                if (opt === 'ok') return 'OK (Regular)';
                                if (opt === 'atencao') return 'Atenção (30 dias)';
                                if (opt === 'critico') return 'Crítico (7 dias)';
                                if (opt === 'vencido') return 'Vencido';
                                return opt;
                              }}
                            />
                          </div>

                          <div className="space-y-2">
                            <MultiSelect 
                              label="Status Frota"
                              options={statusFrotaLicOpts}
                              selected={selectedFleetStatusLic}
                              onChange={setSelectedFleetStatusLic}
                            />
                          </div>

                          <div className="space-y-2">
                            <MultiSelect 
                              label="Operação"
                              options={operations}
                              selected={selectedOperationsLic}
                              onChange={setSelectedOperationsLic}
                            />
                          </div>

                          <div className="space-y-2">
                            <MultiSelect 
                              label="Cidade / Base"
                              options={cities}
                              selected={selectedCitiesLic}
                              onChange={setSelectedCitiesLic}
                            />
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  )}

                  {activeDashboardSubTab === "documentacao" && isDashDocFilterVisible && (
                    <motion.div 
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto', transitionEnd: { overflow: 'visible' } }}
                      exit={{ opacity: 0, height: 0, transitionEnd: { overflow: 'hidden' } }}
                      transition={{ duration: 0.3, ease: "easeInOut" }}
                      className="relative z-50 my-2"
                      key="dash-doc-filters"
                    >
                      <div className="glass-card p-6 rounded-3xl space-y-6 bg-slate-50/50">
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 gap-4 items-end">
                          <div className="space-y-2">
                            <MultiSelect 
                              label="Placa"
                              options={platesDocDash}
                              selected={selectedPlatesDocDash}
                              onChange={setSelectedPlatesDocDash}
                            />
                          </div>

                          <div className="space-y-2">
                            <MultiSelect 
                              label="Status Documentação"
                              options={statusDocDashOpts}
                              selected={selectedStatusDocDash}
                              onChange={setSelectedStatusDocDash}
                              formatOption={(opt) => {
                                if (opt === 'em_aberto') return 'Em Aberto';
                                if (opt === 'vencido') return 'Vencido';
                                if (opt === 'critico') return 'Crítico (7d)';
                                if (opt === 'atencao') return 'Atenção (30d)';
                                if (opt === 'ok') return 'OK (Regular)';
                                if (opt === 'pagos') return 'Pagos';
                                return opt;
                              }}
                            />
                          </div>

                          <div className="space-y-2">
                            <MultiSelect 
                              label="Status Frota"
                              options={statusFrotaDashOpts}
                              selected={selectedFleetStatusDocDash}
                              onChange={setSelectedFleetStatusDocDash}
                            />
                          </div>

                          <div className="space-y-2">
                            <MultiSelect 
                              label="Frota"
                              options={fleetDocDashOpts}
                              selected={selectedFleetDocDash}
                              onChange={setSelectedFleetDocDash}
                            />
                          </div>

                          <div className="space-y-2">
                            <MultiSelect 
                              label="Documento"
                              options={descDocDashOpts}
                              selected={selectedDescDocDash}
                              onChange={setSelectedDescDocDash}
                            />
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>



                {/* Sub-navegação interna em Dashboard Licenças */}
                {activeDashboardSubTab === "licencas" && (
                  <div className="flex items-center gap-1.5 mb-6 bg-slate-100/50 dark:bg-slate-900/50 p-1.5 rounded-2xl border border-slate-200 dark:border-slate-800 w-max shadow-inner">
                    <button
                      id="btn-subtab-dash-indicadores"
                      onClick={() => setDashLicActiveTab("indicadores")}
                      className={cn(
                        "px-4 py-2 rounded-xl text-xs font-black transition-all flex items-center gap-2 cursor-pointer",
                        dashLicActiveTab === "indicadores"
                          ? "bg-blue-600 text-white shadow-md shadow-blue-500/25"
                          : "text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-white/50 dark:hover:bg-slate-700/50"
                      )}
                    >
                      <LayoutDashboard size={15} />
                      <span>Licenças</span>
                    </button>
                    <button
                      id="btn-subtab-dash-justificativas"
                      onClick={() => setDashLicActiveTab("justificativas")}
                      className={cn(
                        "px-4 py-2 rounded-xl text-xs font-black transition-all flex items-center gap-2 cursor-pointer",
                        dashLicActiveTab === "justificativas"
                          ? "bg-blue-600 text-white shadow-md shadow-blue-500/25"
                          : "text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-white/50 dark:hover:bg-slate-700/50"
                      )}
                    >
                      <FileSignature size={15} />
                      <span>Justificativas Licenças</span>
                      {justifications.length > 0 && (
                        <span className={cn(
                          "px-1.5 py-0.5 rounded-full text-[9px] font-mono font-bold leading-none",
                          dashLicActiveTab === "justificativas"
                            ? "bg-white/20 text-white"
                            : "bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300"
                        )}>
                          {justifications.length}
                        </span>
                      )}
                    </button>
                    <button
                      id="btn-subtab-dash-farol"
                      onClick={() => setDashLicActiveTab("farol")}
                      className={cn(
                        "px-4 py-2 rounded-xl text-xs font-black transition-all flex items-center gap-2 cursor-pointer",
                        dashLicActiveTab === "farol"
                          ? "bg-blue-600 text-white shadow-md shadow-blue-500/25"
                          : "text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-white/50 dark:hover:bg-slate-700/50"
                      )}
                    >
                      <Sun size={15} />
                      <span>Farol</span>
                    </button>
                  </div>
                )}

                {/* Sub-navegação interna em Dashboard Documentação */}
                {activeDashboardSubTab === "documentacao" && (
                  <div className="flex items-center gap-1.5 mb-6 bg-slate-100/50 dark:bg-slate-900/50 p-1.5 rounded-2xl border border-slate-200 dark:border-slate-800 w-max shadow-inner">
                    <button
                      id="btn-subtab-dashdoc-indicadores"
                      onClick={() => setDashDocActiveTab("indicadores")}
                      className={cn(
                        "px-4 py-2 rounded-xl text-xs font-black transition-all flex items-center gap-2 cursor-pointer",
                        dashDocActiveTab === "indicadores"
                          ? "bg-blue-600 text-white shadow-md shadow-blue-500/25"
                          : "text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-white/50 dark:hover:bg-slate-700/50"
                      )}
                    >
                      <LayoutDashboard size={15} />
                      <span>Documentação</span>
                    </button>
                    <button
                      id="btn-subtab-dashdoc-justificativas"
                      onClick={() => setDashDocActiveTab("justificativas")}
                      className={cn(
                        "px-4 py-2 rounded-xl text-xs font-black transition-all flex items-center gap-2 cursor-pointer",
                        dashDocActiveTab === "justificativas"
                          ? "bg-blue-600 text-white shadow-md shadow-blue-500/25"
                          : "text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-white/50 dark:hover:bg-slate-700/50"
                      )}
                    >
                      <FileSignature size={15} />
                      <span>Justificativas Documentação</span>
                      {docJustifications.length > 0 && (
                        <span className={cn(
                          "px-1.5 py-0.5 rounded-full text-[9px] font-mono font-bold leading-none",
                          dashDocActiveTab === "justificativas"
                            ? "bg-white/20 text-white"
                            : "bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300"
                        )}>
                          {docJustifications.length}
                        </span>
                      )}
                    </button>
                    <button
                      id="btn-subtab-dashdoc-farol"
                      onClick={() => setDashDocActiveTab("farol")}
                      className={cn(
                        "px-4 py-2 rounded-xl text-xs font-black transition-all flex items-center gap-2 cursor-pointer",
                        dashDocActiveTab === "farol"
                          ? "bg-blue-600 text-white shadow-md shadow-blue-500/25"
                          : "text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-white/50 dark:hover:bg-slate-700/50"
                      )}
                    >
                      <Sun size={15} />
                      <span>Farol</span>
                    </button>
                  </div>
                )}
                {activeDashboardSubTab === "licencas" ? (
                  dashLicActiveTab === "farol" ? (
                    <FarolTab 
                      baseFleet={filteredDashboardLicFleet} 
                      renderModernPDFHeader={renderModernPDFHeader}
                      loadPDFLogo={loadPDFLogo}
                      includePdfSummaries={includePdfSummaries}
                      companyName={settings.companyName}
                    />
                  ) : dashLicActiveTab === "justificativas" ? (
                    <ErrorBoundary 
                      fallbackTitle="Visualização de Justificativas de Licenças"
                      fallbackMessage="Detectamos uma divergência ao renderizar os registros de justificativas. Seus dados estão preservados no servidor e no banco de dados."
                      onReset={() => setDashLicActiveTab("indicadores")}
                      onClose={() => setDashLicActiveTab("indicadores")}
                    >
                      <LicenseJustificationsTab
                        baseFleet={filteredDashboardLicFleet}
                        justifications={justifications}
                        onSaveJustification={handleSaveJustification}
                        onDeleteJustification={handleDeleteJustification}
                        onBatchRestoreJustifications={handleBatchRestoreLicenseJustifications}
                        renderModernPDFHeader={renderModernPDFHeader}
                        loadPDFLogo={loadPDFLogo}
                        includePdfSummaries={includePdfSummaries}
                        theme={theme}
                        isGoogleConnected={isGoogleConnected}
                        onConnectGoogle={handleGoogleConnect}
                        historyItems={licenseHistory}
                        onAddHistoryItem={handleAddLicenseHistoryItem}
                      />
                    </ErrorBoundary>
                  ) : (
                    <>
                      {/* Stats Header with 3D Diagonal Perspective Toggle */}
                      <div className="flex items-center justify-between mb-3 px-1">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">
                            Indicadores da Frota & Licenças
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => setIsIsometricStats(prev => !prev)}
                          className={cn(
                            "px-3 py-1.5 rounded-xl text-[11px] font-black transition-all flex items-center gap-1.5 border cursor-pointer select-none",
                            isIsometricStats
                              ? "bg-blue-600/15 border-blue-500/40 text-blue-600 dark:text-blue-400 shadow-sm"
                              : "bg-slate-100 dark:bg-slate-800/80 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300"
                          )}
                          title="Alternar entre Perspectiva 3D Diagonal e Grade Plana"
                        >
                          <Layers size={13} />
                          <span>{isIsometricStats ? "3D Diagonal Ativo" : "Grade Plana"}</span>
                        </button>
                      </div>

                      {/* 3D Diagonal Stats Grid */}
                      <div className="relative py-3 overflow-visible">
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                          <StatCard3D 
                            index={0}
                            isIsometric={isIsometricStats}
                            title="Total de Veículos" 
                            value={stats.totalVehicles} 
                            icon={<Truck size={20} />} 
                            variant="cyan"
                            badge={{
                              text: "Frota Ativa",
                              subtext: "+2 este mês",
                              icon: <CheckCircle2 size={12} className="text-emerald-400" />
                            }}
                            description="Veículos ativos cadastrados e monitorados quanto a licenças regulatórias."
                          />
                          <StatCard3D 
                            index={1}
                            isIsometric={isIsometricStats}
                            title="Operações Ativas" 
                            value={stats.activeOperations} 
                            icon={<LayoutDashboard size={20} />} 
                            variant="blue"
                            badge={{
                              text: `${stats.activeOperations} Unidades`,
                              subtext: "Em Operação",
                              icon: <Building2 size={12} className="text-cyan-400" />
                            }}
                            description="Filiais e bases operacionais com movimentação de frota ativa."
                          />
                          <StatCard3D 
                            index={2}
                            isIsometric={isIsometricStats}
                            title="Docs a Vencer" 
                            value={stats.expiringDocs} 
                            icon={<Clock size={20} />} 
                            variant="amber"
                            badge={{
                              text: stats.expiringDocs > 0 ? "Atenção (30d)" : "Em Dia",
                              subtext: stats.expiringDocs > 0 ? "Vencendo" : "Regular",
                              icon: <AlertTriangle size={12} className="text-amber-400" />
                            }}
                            description="Licenças com vencimento previsto para os próximos 30 dias."
                          />
                          <StatCard3D 
                            index={3}
                            isIsometric={isIsometricStats}
                            title="Docs Vencidos" 
                            value={stats.expiredDocs} 
                            icon={<FileWarning size={20} />} 
                            variant="rose"
                            badge={{
                              text: stats.expiredDocs > 0 ? `${stats.expiredDocs} Vencidas` : "100% Em Dia",
                              subtext: stats.expiredDocs > 0 ? "Ação Imediata" : "Regular",
                              icon: <AlertCircle size={12} className="text-rose-400" />
                            }}
                            description="Licenças expiradas que necessitam de renovação ou emissão urgente."
                          />
                        </div>
                      </div>

                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                      {/* Recent Alerts */}
                      <div className="lg:col-span-4 rounded-[28px] p-6 flex flex-col h-[490px] border border-slate-800/80 bg-gradient-to-br from-[#0c1224] via-[#090e1c] to-[#060913] shadow-[0_12px_30px_-10px_rgba(0,0,0,0.5),0_0_15px_rgba(56,189,248,0.06)] relative overflow-hidden">
                        <div className="flex items-center justify-between mb-4 shrink-0">
                          <h3 className="font-display font-black text-base sm:text-lg flex items-center gap-2 text-white">
                            <Bell size={18} className="text-cyan-400 drop-shadow-[0_0_8px_rgba(6,182,212,0.5)]" />
                            Alertas Recentes
                          </h3>
                          <div className="flex items-center gap-1.5">
                            <label 
                              className="flex items-center gap-1.5 cursor-pointer px-2 py-1 bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700/80 rounded-xl text-[10px] font-bold text-slate-300 transition-all select-none"
                              title="Definir se o relatório PDF de alertas incluirá os resumos/cards visuais ou apenas a tabela direta"
                            >
                              <input 
                                type="checkbox" 
                                checked={includePdfSummaries}
                                onChange={(e) => toggleIncludePdfSummaries(e.target.checked)}
                                className="w-3.5 h-3.5 rounded border-slate-700 text-cyan-500 focus:ring-cyan-500 cursor-pointer accent-cyan-500"
                              />
                              <span className="hidden sm:inline">Cards:</span>
                              <span className={cn(
                                "text-[10px] font-black uppercase px-1 rounded",
                                includePdfSummaries ? "text-cyan-400 font-extrabold" : "text-slate-400"
                              )}>
                                {includePdfSummaries ? "SIM" : "NÃO"}
                              </span>
                            </label>
                            <button 
                              onClick={() => handleExportAlerts("LICENCAS")}
                              className="p-1.5 text-slate-400 hover:text-cyan-400 hover:bg-cyan-950/40 rounded-xl border border-transparent hover:border-cyan-500/30 transition-all"
                              title={`Salvar Alertas em PDF (${includePdfSummaries ? 'com resumos/cards' : 'sem resumos/cards'})`}
                            >
                              <Download size={15} />
                            </button>
                            <button 
                              onClick={() => handlePrintAlerts("LICENCAS")}
                              className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl border border-transparent hover:border-slate-700 transition-all"
                              title={`Imprimir Alertas (${includePdfSummaries ? 'com resumos/cards' : 'sem resumos/cards'})`}
                            >
                              <Printer size={15} />
                            </button>
                          </div>
                        </div>
                        <div className="flex-1 overflow-y-auto pr-1.5 space-y-2.5 scrollbar-thin scrollbar-thumb-slate-800 scrollbar-track-transparent">
                          {filteredDashboardLicFleet
                            .flatMap(v => v.documents.map(d => ({ ...d, vehicle: v })))
                            .filter(d => d.status !== 'ok' && d.status !== 'pagos' && !isDespachanteType(d.type) && !d.type.toUpperCase().includes('TX INSP TACOGRAFO'))
                            .sort((a, b) => {
                              const priority = { vencido: 0, critico: 1, atencao: 2, ok: 3 };
                              return priority[a.status] - priority[b.status] || a.daysRemaining - b.daysRemaining;
                            })
                            .map((alert, i) => (
                              <div 
                                key={i} 
                                onClick={() => {
                                  setActiveTab("licencas_detalhadas");
                                  setSearchTerm(alert.vehicle.plate);
                                }}
                                className="flex gap-3 p-3 rounded-2xl bg-[#0c1224]/80 border border-slate-800/80 hover:border-cyan-500/50 hover:bg-[#0f172a] hover:shadow-[0_8px_20px_rgba(0,0,0,0.6)] hover:-translate-y-0.5 transition-all cursor-pointer group"
                              >
                                <div className={cn(
                                  "w-9 h-9 rounded-xl flex items-center justify-center shrink-0 shadow-sm",
                                  alert.status === 'vencido' ? "bg-red-500/20 text-red-400 border border-red-500/40 shadow-[0_0_10px_rgba(239,68,68,0.3)]" : 
                                  alert.status === 'critico' ? "bg-orange-500/20 text-orange-400 border border-orange-500/40 shadow-[0_0_10px_rgba(249,115,22,0.3)]" : "bg-amber-500/20 text-amber-400 border border-amber-500/40 shadow-[0_0_10px_rgba(245,158,11,0.3)]"
                                )}>
                                  <AlertTriangle size={16} />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex justify-between items-start gap-2 mb-1">
                                    <div className="flex flex-col min-w-0">
                                      <p className="text-xs font-bold text-white group-hover:text-cyan-400 transition-colors truncate">
                                        {alert.type}
                                      </p>
                                      <div className="flex items-center gap-1.5 mt-0.5">
                                        <p className="text-[9px] text-cyan-400 font-black uppercase truncate">
                                          {alert.vehicle.operation}
                                        </p>
                                        <span className="text-[9px] text-slate-600 font-bold">•</span>
                                        <p className="text-[9px] text-slate-300 font-black flex items-center gap-1">
                                          {alert.vehicle.fleet && (
                                            <>
                                              <span className="text-cyan-300 bg-cyan-950/60 px-1 rounded uppercase tracking-tighter">{alert.vehicle.fleet}</span>
                                              <span className="text-slate-600">•</span>
                                            </>
                                          )}
                                          {alert.vehicle.plate}
                                        </p>
                                      </div>
                                    </div>
                                    <span className={cn(
                                      "text-[8px] font-black px-1.5 py-0.5 rounded-full uppercase shrink-0 tracking-wider border",
                                      alert.status === 'vencido' ? "bg-red-950/60 border-red-500/40 text-red-400" : 
                                      alert.status === 'critico' ? "bg-orange-950/60 border-orange-500/40 text-orange-400" : "bg-amber-950/60 border-amber-500/40 text-amber-400"
                                    )}>
                                      {alert.status}
                                    </span>
                                  </div>
                                  <div className="flex justify-between items-center text-[10px]">
                                    <p className="font-medium text-slate-400">
                                      {alert.status === 'vencido' 
                                        ? `Há ${Math.abs(alert.daysRemaining)} dias` 
                                        : `Em ${alert.daysRemaining} dias`}
                                    </p>
                                    <p className="font-black text-slate-400">
                                      {alert.expiryDate}
                                    </p>
                                  </div>
                                </div>
                              </div>
                            ))}
                          {filteredDashboardLicFleet.length === 0 && (
                            <div className="h-full flex flex-col items-center justify-center text-slate-400 text-center p-4">
                              <CheckCircle2 size={28} className="mb-2 text-cyan-400 opacity-30" />
                              <p className="text-xs font-medium">Nenhum alerta pendente</p>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Operation Distribution with Hierarchy Levels */}
                      <OperationDistributionChart
                        vehicles={filteredDashboardLicFleet}
                        operations={operations}
                        className="lg:col-span-5"
                      />

                      {/* Status Summary Chart */}
                      <ChartContainer3D
                        title="Status da Frota"
                        subtitle="Conformidade Documental"
                        legendBadge="STATUS"
                        badgeColor="#22c55e"
                        className="lg:col-span-3"
                      >
                        <div className="h-[210px] relative">
                          <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                              <Pie
                                data={[
                                  { name: 'Regular', value: filteredDashboardLicFleet.filter(v => v.overallStatus === 'ok').length, color: '#22c55e' },
                                  { name: 'Atenção', value: filteredDashboardLicFleet.filter(v => v.overallStatus === 'atencao').length, color: '#f59e0b' },
                                  { name: 'Crítico', value: filteredDashboardLicFleet.filter(v => v.overallStatus === 'critico').length, color: '#f97316' },
                                  { name: 'Vencido', value: filteredDashboardLicFleet.filter(v => v.overallStatus === 'vencido').length, color: '#ef4444' },
                                ].filter(d => d.value > 0)}
                                cx="50%" 
                                cy="50%" 
                                innerRadius={66} 
                                outerRadius={88} 
                                paddingAngle={7} 
                                cornerRadius={6}
                                dataKey="value" 
                                stroke="none"
                              >
                                {[
                                  { color: '#22c55e' }, { color: '#f59e0b' }, { color: '#f97316' }, { color: '#ef4444' }
                                ].map((entry, index) => (
                                  <Cell key={`cell-${index}`} fill={entry.color} className="hover:opacity-85 transition-opacity cursor-pointer" />
                                ))}
                              </Pie>
                              <Tooltip content={<PieTooltip3D total={filteredDashboardLicFleet.length} />} />
                            </PieChart>
                          </ResponsiveContainer>
                          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                            <span className="text-3xl font-black text-white tracking-tighter drop-shadow-[0_2px_12px_rgba(0,0,0,0.9)]">
                              {Math.round((filteredDashboardLicFleet.filter(v => v.overallStatus === 'ok').length / (filteredDashboardLicFleet.length || 1)) * 100)}%
                            </span>
                            <span className="text-[9px] font-black text-emerald-400 uppercase tracking-widest mt-0.5">REGULAR</span>
                          </div>
                        </div>

                        <div className="mt-2 grid grid-cols-2 gap-2 shrink-0 relative z-10">
                          {[
                            { label: 'REGULAR', color: '#22c55e', count: filteredDashboardLicFleet.filter(v => v.overallStatus === 'ok').length },
                            { label: 'ATENÇÃO', color: '#f59e0b', count: filteredDashboardLicFleet.filter(v => v.overallStatus === 'atencao').length },
                            { label: 'CRÍTICO', color: '#f97316', count: filteredDashboardLicFleet.filter(v => v.overallStatus === 'critico').length },
                            { label: 'VENCIDO', color: '#ef4444', count: filteredDashboardLicFleet.filter(v => v.overallStatus === 'vencido').length },
                          ].map(item => (
                            <div 
                              key={item.label} 
                              style={{
                                boxShadow: `0 4px 15px -2px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.06)`
                              }}
                              className="p-2.5 rounded-2xl border border-slate-800/80 bg-[#0c1224]/80 hover:border-slate-600/60 hover:bg-[#0f172a]/90 transition-all duration-200 flex flex-col justify-between group cursor-default"
                            >
                              <div className="flex items-center gap-1.5 mb-0.5">
                                <span 
                                  className="w-2 h-2 rounded-full shadow-[0_0_8px_currentColor]" 
                                  style={{ backgroundColor: item.color, color: item.color }} 
                                />
                                <span className="text-[9px] font-black text-slate-400 group-hover:text-slate-200 uppercase tracking-wider">{item.label}</span>
                              </div>
                              <span className="text-xl font-black text-white font-display tracking-tight drop-shadow-[0_1px_4px_rgba(0,0,0,0.6)]">{item.count}</span>
                            </div>
                          ))}
                        </div>
                      </ChartContainer3D>
                    </div>
                  </>
                  )
                ) : (
                  dashDocActiveTab === "farol" ? (
                    <FarolTab 
                      baseFleet={filteredDashboardDocFleet} 
                      mode="documentacao" 
                      renderModernPDFHeader={renderModernPDFHeader}
                      loadPDFLogo={loadPDFLogo}
                      includePdfSummaries={includePdfSummaries}
                      companyName={settings.companyName}
                    />
                  ) : dashDocActiveTab === "justificativas" ? (
                    <ErrorBoundary 
                      fallbackTitle="Visualização de Justificativas de Documentação"
                      fallbackMessage="Detectamos uma divergência ao renderizar os registros de justificativas de documentação. Seus dados estão preservados no servidor e no banco de dados."
                      onReset={() => setDashDocActiveTab("indicadores")}
                      onClose={() => setDashDocActiveTab("indicadores")}
                    >
                      <DocJustificationsTab
                        baseFleet={filteredDashboardDocFleet}
                        justifications={docJustifications}
                        onSaveJustification={handleSaveDocJustification}
                        onDeleteJustification={handleDeleteDocJustification}
                        onBatchRestoreJustifications={handleBatchRestoreDocJustifications}
                        renderModernPDFHeader={renderModernPDFHeader}
                        loadPDFLogo={loadPDFLogo}
                        includePdfSummaries={includePdfSummaries}
                        theme={theme}
                        historyItems={docHistory}
                        onAddHistoryItem={handleAddDocHistoryItem}
                      />
                    </ErrorBoundary>
                  ) : (
                    <>
                      {/* Stats Header with 3D Diagonal Perspective Toggle */}
                      <div className="flex items-center justify-between mb-3 px-1">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">
                            Indicadores de Documentação & Guias
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => setIsIsometricStats(prev => !prev)}
                          className={cn(
                            "px-3 py-1.5 rounded-xl text-[11px] font-black transition-all flex items-center gap-1.5 border cursor-pointer select-none",
                            isIsometricStats
                              ? "bg-blue-600/15 border-blue-500/40 text-blue-600 dark:text-blue-400 shadow-sm"
                              : "bg-slate-100 dark:bg-slate-800/80 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300"
                          )}
                          title="Alternar entre Perspectiva 3D Diagonal e Grade Plana"
                        >
                          <Layers size={13} />
                          <span>{isIsometricStats ? "3D Diagonal Ativo" : "Grade Plana"}</span>
                        </button>
                      </div>

                      {/* 3D Diagonal Stats Grid */}
                      <div className="relative py-3 overflow-visible">
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                          <StatCard3D 
                            index={0}
                            isIsometric={isIsometricStats}
                            title="Total Veículos (Docs)" 
                            value={stats.totalVehicles} 
                            icon={<Truck size={20} />} 
                            variant="cyan"
                            badge={{
                              text: `${stats.totalVehicles} Veículos`,
                              subtext: "Monitorados",
                              icon: <CheckCircle2 size={12} className="text-emerald-400" />
                            }}
                            description="Veículos cadastrados com controle de taxas e tributos no sistema."
                          />
                          <StatCard3D 
                            index={1}
                            isIsometric={isIsometricStats}
                            title="Total Documentos" 
                            value={stats.totalDocuments} 
                            icon={<FileText size={20} />} 
                            variant="blue"
                            badge={{
                              text: `${stats.totalDocuments} Guias`,
                              subtext: "Registradas",
                              icon: <Layers size={12} className="text-cyan-400" />
                            }}
                            description="Guias, seguros, taxas e comprovantes tributários gerenciados."
                          />
                          <StatCard3D 
                            index={2}
                            isIsometric={isIsometricStats}
                            title="Docs a Vencer" 
                            value={stats.expiringDocs} 
                            icon={<Clock size={20} />} 
                            variant="amber"
                            badge={{
                              text: stats.expiringDocs > 0 ? "Atenção (30d)" : "Em Dia",
                              subtext: stats.expiringDocs > 0 ? "Programar" : "Tudo OK",
                              icon: <AlertTriangle size={12} className="text-amber-400" />
                            }}
                            description="Documentos com vencimento previsto para os próximos 30 dias."
                          />
                          <StatCard3D 
                            index={3}
                            isIsometric={isIsometricStats}
                            title="Docs Vencidos" 
                            value={stats.expiredDocs} 
                            icon={<FileWarning size={20} />} 
                            variant="rose"
                            badge={{
                              text: stats.expiredDocs > 0 ? `${stats.expiredDocs} Vencidos` : "Zero Pendência",
                              subtext: stats.expiredDocs > 0 ? "Regularizar" : "Em Dia",
                              icon: <AlertCircle size={12} className="text-rose-400" />
                            }}
                            description="Guias e tributos vencidos pendentes de pagamento e quitação imediata."
                          />
                        </div>
                      </div>

                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                      {/* Recent Alerts (Docs) */}
                      <div className="lg:col-span-4 rounded-[28px] p-6 flex flex-col h-[490px] border border-slate-800/80 bg-gradient-to-br from-[#0c1224] via-[#090e1c] to-[#060913] shadow-[0_12px_30px_-10px_rgba(0,0,0,0.5),0_0_15px_rgba(56,189,248,0.06)] relative overflow-hidden">
                        <div className="flex items-center justify-between mb-4 shrink-0">
                          <h3 className="font-display font-black text-base sm:text-lg flex items-center gap-2 text-white">
                            <Bell size={18} className="text-cyan-400 drop-shadow-[0_0_8px_rgba(6,182,212,0.5)]" />
                            Alertas Documentação
                          </h3>
                          <div className="flex items-center gap-1.5">
                            <label 
                              className="flex items-center gap-1.5 cursor-pointer px-2 py-1 bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700/80 rounded-xl text-[10px] font-bold text-slate-300 transition-all select-none"
                              title="Definir se o relatório PDF de alertas incluirá os resumos/cards visuais ou apenas a tabela direta"
                            >
                              <input 
                                type="checkbox" 
                                checked={includePdfSummaries}
                                onChange={(e) => toggleIncludePdfSummaries(e.target.checked)}
                                className="w-3.5 h-3.5 rounded border-slate-700 text-cyan-500 focus:ring-cyan-500 cursor-pointer accent-cyan-500"
                              />
                              <span className="hidden sm:inline">Cards:</span>
                              <span className={cn(
                                "text-[10px] font-black uppercase px-1 rounded",
                                includePdfSummaries ? "text-cyan-400 font-extrabold" : "text-slate-400"
                              )}>
                                {includePdfSummaries ? "SIM" : "NÃO"}
                              </span>
                            </label>
                            <button 
                              onClick={() => handleExportAlerts("DOCUMENTACAO")}
                              className="p-1.5 text-slate-400 hover:text-cyan-400 hover:bg-cyan-950/40 rounded-xl border border-transparent hover:border-cyan-500/30 transition-all"
                              title={`Salvar Alertas em PDF (${includePdfSummaries ? 'com resumos/cards' : 'sem resumos/cards'})`}
                            >
                              <Download size={15} />
                            </button>
                            <button 
                              onClick={() => handlePrintAlerts("DOCUMENTACAO")}
                              className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl border border-transparent hover:border-slate-700 transition-all"
                              title={`Imprimir Alertas (${includePdfSummaries ? 'com resumos/cards' : 'sem resumos/cards'})`}
                            >
                              <Printer size={15} />
                            </button>
                          </div>
                        </div>
                        <div className="flex-1 overflow-y-auto pr-1.5 space-y-2.5 scrollbar-thin scrollbar-thumb-slate-800 scrollbar-track-transparent">
                          {filteredDashboardDocFleet
                            .flatMap(v => v.documents.map(d => ({ ...d, vehicle: v })))
                            .filter(d => d.status !== 'ok' && d.status !== 'pagos' && !isDespachanteType(d.type) && !d.type.toUpperCase().includes('TX INSP TACOGRAFO'))
                            .sort((a, b) => {
                              const priority = { vencido: 0, critico: 1, atencao: 2, ok: 3 };
                              return priority[a.status] - priority[b.status] || a.daysRemaining - b.daysRemaining;
                            })
                            .map((alert, i) => (
                              <div 
                                key={i} 
                                onClick={() => {
                                  setActiveTab("licencas_documentos");
                                  const extra = alert.vehicle?.extraData || {};
                                  const ped = extra["Pedido"] || (extra["Observações"] || "").match(/PEDIDO\s*[:\-#]?\s*([0-9]{4,8})/i)?.[1];
                                  setSearchTerm(alert.vehicle.plate || ped || alert.vehicle.fleet || "");
                                }}
                                className="flex gap-3 p-3 rounded-2xl bg-[#0c1224]/80 border border-slate-800/80 hover:border-cyan-500/50 hover:bg-[#0f172a] hover:shadow-[0_8px_20px_rgba(0,0,0,0.6)] hover:-translate-y-0.5 transition-all cursor-pointer group"
                              >
                                <div className={cn(
                                  "w-9 h-9 rounded-xl flex items-center justify-center shrink-0 shadow-sm",
                                  alert.status === 'vencido' ? "bg-red-500/20 text-red-400 border border-red-500/40 shadow-[0_0_10px_rgba(239,68,68,0.3)]" : 
                                  alert.status === 'critico' ? "bg-orange-500/20 text-orange-400 border border-orange-500/40 shadow-[0_0_10px_rgba(249,115,22,0.3)]" : "bg-amber-500/20 text-amber-400 border border-amber-500/40 shadow-[0_0_10px_rgba(245,158,11,0.3)]"
                                )}>
                                  <AlertTriangle size={16} />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex justify-between items-start gap-2 mb-1">
                                    <div className="flex flex-col min-w-0">
                                      <p className="text-xs font-bold text-white group-hover:text-cyan-400 transition-colors truncate">
                                        {alert.type}
                                      </p>
                                      <div className="flex items-center gap-1.5 mt-0.5">
                                        <p className="text-[9px] text-cyan-400 font-black uppercase truncate">
                                          {alert.vehicle.operation}
                                        </p>
                                        <span className="text-[9px] text-slate-600 font-bold">•</span>
                                        <p className="text-[9px] text-slate-300 font-black flex items-center gap-1">
                                          {(() => {
                                            const extra = alert.vehicle?.extraData || {};
                                            const obs = String(extra["Observações"] || extra["OBSERVACOES"] || extra["OBS"] || "").trim();
                                            const pedMatch = obs.match(/PEDIDO\s*[:\-#]?\s*([0-9]{4,8})/i);
                                            const docVal = String(extra["Documento"] || extra["DOC"] || "").trim();
                                            const ped = String(extra["Pedido"] || (pedMatch ? pedMatch[1] : (/^[0-9]{4,8}$/.test(docVal) ? docVal : ""))).trim();

                                            const fleetDisp = alert.vehicle.fleet || (ped ? ped : "");
                                            const plateDisp = alert.vehicle.plate || (ped ? `PEDIDO: ${ped}` : "S/ PLACA");

                                            return (
                                              <>
                                                {fleetDisp && (
                                                  <>
                                                    <span className="text-cyan-300 bg-cyan-950/60 px-1 rounded uppercase tracking-tighter">
                                                      {fleetDisp.startsWith("PED") ? fleetDisp : `FROTA ${fleetDisp}`}
                                                    </span>
                                                    <span className="text-slate-600">•</span>
                                                  </>
                                                )}
                                                <span>{plateDisp}</span>
                                              </>
                                            );
                                          })()}
                                        </p>
                                      </div>
                                    </div>
                                    <span className={cn(
                                      "text-[8px] font-black px-1.5 py-0.5 rounded-full uppercase shrink-0 tracking-wider border",
                                      alert.status === 'vencido' ? "bg-red-950/60 border-red-500/40 text-red-400" : 
                                      alert.status === 'critico' ? "bg-orange-950/60 border-orange-500/40 text-orange-400" : "bg-amber-950/60 border-amber-500/40 text-amber-400"
                                    )}>
                                      {alert.status}
                                    </span>
                                  </div>
                                  <div className="flex justify-between items-center text-[10px]">
                                    <p className="font-medium text-slate-400">
                                      {alert.status === 'vencido' 
                                        ? `Há ${Math.abs(alert.daysRemaining)} dias` 
                                        : `Em ${alert.daysRemaining} dias`}
                                    </p>
                                    <p className="font-black text-slate-400">
                                      {alert.expiryDate}
                                    </p>
                                  </div>
                                </div>
                              </div>
                            ))}
                          {fleet.filter(v => v.source === "DOCUMENTACAO").length === 0 && (
                            <div className="h-full flex flex-col items-center justify-center text-slate-400 text-center p-4">
                              <CheckCircle2 size={28} className="mb-2 text-cyan-400 opacity-30" />
                              <p className="text-xs font-medium">Nenhum alerta pendente</p>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Document Distribution (Docs) */}
                      <ChartContainer3D
                        title="Distribuição por Documento"
                        subtitle="Documentos & Guias Fiscais"
                        legendBadge="DOCUMENTOS"
                        badgeColor="#38bdf8"
                        className="lg:col-span-5"
                      >
                        {filteredDashboardDocFleet.length > 0 ? (
                          <ResponsiveContainer width="100%" height="100%">
                            <ComposedChart 
                              data={descDocDashOpts.map(desc => ({
                                name: desc,
                                count: filteredDashboardDocFleet.filter(v => v.extraData?.["Descrição"] === desc).length,
                                total: filteredDashboardDocFleet.length
                              })).filter(d => d.count > 0)}
                              margin={{ top: 22, right: 12, left: -22, bottom: 44 }}
                            >
                              <defs>
                                <linearGradient id="neonBarGradientDoc" x1="0" y1="0" x2="0" y2="1">
                                  <stop offset="0%" stopColor="#38bdf8" stopOpacity={0.95}/>
                                  <stop offset="50%" stopColor="#2563eb" stopOpacity={0.65}/>
                                  <stop offset="100%" stopColor="#1e3a8a" stopOpacity={0.15}/>
                                </linearGradient>
                                <filter id="neonSplineGlowDoc" x="-20%" y="-40%" width="140%" height="180%">
                                  <feGaussianBlur stdDeviation="3.5" result="coloredBlur"/>
                                  <feMerge>
                                    <feMergeNode in="coloredBlur"/>
                                    <feMergeNode in="SourceGraphic"/>
                                  </feMerge>
                                </filter>
                              </defs>
                              <CartesianGrid strokeDasharray="4 4" vertical={false} stroke="rgba(255, 255, 255, 0.08)" />
                              <XAxis 
                                dataKey="name" 
                                axisLine={false} 
                                tickLine={false} 
                                tick={{ fontSize: 9, fill: '#94a3b8', fontWeight: 700 }}
                                interval={0}
                                angle={-35}
                                textAnchor="end"
                              />
                              <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#64748b', fontWeight: 600 }} />
                              <Tooltip 
                                content={<ChartTooltip3D unit="documentos" />}
                                cursor={<AnimatedChartCursor />}
                              />
                              <Bar dataKey="count" radius={[8, 8, 0, 0]} barSize={28} fill="url(#neonBarGradientDoc)" stroke="#38bdf8" strokeWidth={1}>
                                <LabelList dataKey="count" position="top" style={{ fontSize: '10px', fontWeight: '900', fill: '#60a5fa' }} />
                              </Bar>
                              <Line 
                                type="monotone" 
                                dataKey="count" 
                                stroke="#818cf8" 
                                strokeWidth={3} 
                                dot={{ r: 4.5, fill: '#ffffff', strokeWidth: 2.5, stroke: '#6366f1' }} 
                                activeDot={{ r: 7, fill: '#38bdf8', stroke: '#ffffff', strokeWidth: 2 }} 
                              />
                            </ComposedChart>
                          </ResponsiveContainer>
                        ) : (
                          <div className="h-full flex items-center justify-center text-slate-400 text-sm">Nenhum dado disponível</div>
                        )}
                      </ChartContainer3D>

                      {/* Status Summary Chart (Docs) */}
                      <ChartContainer3D
                        title="Status Documentação"
                        subtitle="Conformidade & Validade"
                        legendBadge="STATUS"
                        badgeColor="#22c55e"
                        className="lg:col-span-3"
                      >
                        <div className="h-[210px] relative">
                          <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                              <Pie
                                data={[
                                  { name: 'Regular', value: filteredDashboardDocFleet.filter(v => v.overallStatus === 'ok').length, color: '#22c55e' },
                                  { name: 'Atenção', value: filteredDashboardDocFleet.filter(v => v.overallStatus === 'atencao').length, color: '#f59e0b' },
                                  { name: 'Crítico', value: filteredDashboardDocFleet.filter(v => v.overallStatus === 'critico').length, color: '#f97316' },
                                  { name: 'Vencido', value: filteredDashboardDocFleet.filter(v => v.overallStatus === 'vencido').length, color: '#ef4444' },
                                ].filter(d => d.value > 0)}
                                cx="50%" 
                                cy="50%" 
                                innerRadius={66} 
                                outerRadius={88} 
                                paddingAngle={7} 
                                cornerRadius={6}
                                dataKey="value" 
                                stroke="none"
                              >
                                {[
                                  { color: '#22c55e' }, { color: '#f59e0b' }, { color: '#f97316' }, { color: '#ef4444' }
                                ].map((entry, index) => (
                                  <Cell key={`cell-${index}`} fill={entry.color} className="hover:opacity-85 transition-opacity cursor-pointer" />
                                ))}
                              </Pie>
                              <Tooltip content={<PieTooltip3D total={filteredDashboardDocFleet.length} />} />
                            </PieChart>
                          </ResponsiveContainer>
                          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                            <span className="text-3xl font-black text-white tracking-tighter drop-shadow-[0_2px_12px_rgba(0,0,0,0.9)]">
                              {Math.round((filteredDashboardDocFleet.filter(v => v.overallStatus === 'ok').length / (filteredDashboardDocFleet.length || 1)) * 100)}%
                            </span>
                            <span className="text-[9px] font-black text-emerald-400 uppercase tracking-widest mt-0.5">REGULAR</span>
                          </div>
                        </div>

                        <div className="mt-2 grid grid-cols-2 gap-2 shrink-0 relative z-10">
                          {[
                            { label: 'REGULAR', color: '#22c55e', count: filteredDashboardDocFleet.filter(v => v.overallStatus === 'ok').length },
                            { label: 'ATENÇÃO', color: '#f59e0b', count: filteredDashboardDocFleet.filter(v => v.overallStatus === 'atencao').length },
                            { label: 'CRÍTICO', color: '#f97316', count: filteredDashboardDocFleet.filter(v => v.overallStatus === 'critico').length },
                            { label: 'VENCIDO', color: '#ef4444', count: filteredDashboardDocFleet.filter(v => v.overallStatus === 'vencido').length },
                          ].map(item => (
                            <div 
                              key={item.label} 
                              style={{
                                boxShadow: `0 4px 15px -2px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.06)`
                              }}
                              className="p-2.5 rounded-2xl border border-slate-800/80 bg-[#0c1224]/80 hover:border-slate-600/60 hover:bg-[#0f172a]/90 transition-all duration-200 flex flex-col justify-between group cursor-default"
                            >
                              <div className="flex items-center gap-1.5 mb-0.5">
                                <span 
                                  className="w-2 h-2 rounded-full shadow-[0_0_8px_currentColor]" 
                                  style={{ backgroundColor: item.color, color: item.color }} 
                                />
                                <span className="text-[9px] font-black text-slate-400 group-hover:text-slate-200 uppercase tracking-wider">{item.label}</span>
                              </div>
                              <span className="text-xl font-black text-white font-display tracking-tight drop-shadow-[0_1px_4px_rgba(0,0,0,0.6)]">{item.count}</span>
                            </div>
                          ))}
                        </div>
                      </ChartContainer3D>
                    </div>
                  </>
                  )
                )}
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence mode="wait">
          {(activeTab === "licencas_detalhadas" || activeTab === "licencas_documentos") && fleet.length > 0 && (
            <motion.div 
              key="fleet"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-6"
            >
              <div className="flex items-center justify-between">
                <div>
                  <h1 className="text-4xl font-display font-black text-slate-900 tracking-tight">
                    {activeTab === "licencas_detalhadas" ? "Licenças Detalhadas" : "Documentação Detalhada"}
                  </h1>
                  <p className="text-sm text-slate-500 font-medium">
                    {activeTab === "licencas_detalhadas" ? "Gestão de veículos e conformidade" : "Documentação do sistema (DOC_SISTEMA)"}
                  </p>
                </div>
                <div className="flex gap-2 items-center">
                  {activeTab === "licencas_documentos" && (
                    <button
                      onClick={() => setExibirDocsSemPlaca(!exibirDocsSemPlaca)}
                      className={cn(
                        "flex items-center gap-2 px-5 py-2.5 rounded-full text-xs font-black uppercase tracking-widest transition-all border shadow-sm bg-white hover:bg-slate-50",
                        exibirDocsSemPlaca 
                          ? "text-blue-600 border-blue-100 hover:border-blue-200" 
                          : "text-slate-500 border-slate-200 hover:border-slate-300"
                      )}
                    >
                      {exibirDocsSemPlaca ? <Eye size={14} /> : <EyeOff size={14} />}
                      {exibirDocsSemPlaca ? "Exibindo Docs sem Placa" : "Ocultando Docs sem Placa"}
                    </button>
                  )}
                  <button 
                    onClick={() => setIsFilterVisible(!isFilterVisible)}
                    className={cn(
                      "flex items-center gap-2 px-6 py-3 rounded-2xl text-sm font-black transition-all border shadow-sm",
                      isFilterVisible 
                        ? "bg-slate-900 text-white border-slate-900 shadow-slate-200" 
                        : "bg-white text-slate-600 border-slate-200 hover:border-slate-300"
                    )}
                  >
                    {isFilterVisible ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    {isFilterVisible ? "Ocultar Filtros" : "Mostrar Filtros"}
                  </button>
                  <button 
                    onClick={() => {
                      setSelectedOperation([]);
                      setSelectedStatus([]);
                      setSelectedCity([]);
                      setSelectedDriver([]);
                      setSelectedEmpresa([]);
                      setSelectedRazaoSocial([]);
                      setSelectedEstado([]);
                      setSelectedFleetDoc([]);
                      setSelectedPlateDoc([]);
                      setSelectedDescDoc([]);
                      setSelectedObsDoc([]);
                      setSelectedVencimentoDoc([]);
                      setSelectedPagamentoDoc([]);
                      setSelectedParcelaDoc([]);
                      setSelectedStatusDoc([]);
                      setIsPagos100(false);
                      setIsParcelaUnica(false);
                      setSearchTerm("");
                    }}
                    className="px-6 py-3 text-slate-500 hover:text-red-600 hover:bg-white rounded-2xl text-sm font-black transition-all border border-transparent hover:border-red-100 hover:shadow-md flex items-center gap-2"
                  >
                    <RotateCcw size={16} />
                    Limpar
                  </button>
                </div>
              </div>

                <AnimatePresence mode="wait">
                  {isFilterVisible && (
                    <motion.div 
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto', transitionEnd: { overflow: 'visible' } }}
                      exit={{ opacity: 0, height: 0, transitionEnd: { overflow: 'hidden' } }}
                      transition={{ duration: 0.3, ease: "easeInOut" }}
                      className="relative z-50 my-2"
                      key="filter-panel"
                    >
                      <div className="glass-card p-8 rounded-3xl space-y-8">
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6 gap-6 items-end">
                          {activeTab === "licencas_detalhadas" ? (
                            <>
                              <div className="space-y-2">
                                <MultiSelect 
                                  label="Operação"
                                  options={operations}
                                  selected={selectedOperation}
                                  onChange={setSelectedOperation}
                                />
                              </div>
                              <div className="space-y-2">
                                <MultiSelect 
                                  label="Status Documental"
                                  options={['ok', 'atencao', 'critico', 'vencido']}
                                  selected={selectedStatus}
                                  onChange={setSelectedStatus}
                                  formatOption={(opt) => {
                                    if (opt === 'ok') return 'OK (Regular)';
                                    if (opt === 'atencao') return 'Atenção (30 dias)';
                                    if (opt === 'critico') return 'Crítico (7 dias)';
                                    if (opt === 'vencido') return 'Vencido';
                                    return opt;
                                  }}
                                />
                              </div>
                              <div className="space-y-2">
                                <MultiSelect 
                                  label="Cidade / Base"
                                  options={cities}
                                  selected={selectedCity}
                                  onChange={setSelectedCity}
                                />
                              </div>
                              <div className="space-y-2">
                                <MultiSelect 
                                  label="Motorista"
                                  options={drivers}
                                  selected={selectedDriver}
                                  onChange={setSelectedDriver}
                                />
                              </div>
                            </>
                          ) : (
                            <>
                              <div className="space-y-2">
                                 <MultiSelect 
                                   label="Status"
                                   options={['em_aberto', 'vencido', 'critico', 'atencao', 'ok', 'pagos']}
                                   selected={selectedStatusDoc}
                                   onChange={setSelectedStatusDoc}
                                   formatOption={(opt) => {
                                     if (opt === 'em_aberto') return 'Em Aberto';
                                     if (opt === 'vencido') return 'Vencido';
                                     if (opt === 'critico') return 'Crítico (7d)';
                                     if (opt === 'atencao') return 'Atenção (30d)';
                                     if (opt === 'ok') return 'OK (Regular)';
                                     if (opt === 'pagos') return 'Pagos';
                                     return opt;
                                   }}
                                 />
                              </div>
                              <div className="space-y-2">
                                <MultiSelect 
                                  label="Frota"
                                  options={frotasDoc}
                                  selected={selectedFleetDoc}
                                  onChange={setSelectedFleetDoc}
                                />
                              </div>
                              <div className="space-y-2">
                                <MultiSelect 
                                  label="Placa"
                                  options={placasDoc}
                                  selected={selectedPlateDoc}
                                  onChange={setSelectedPlateDoc}
                                />
                              </div>
                              <div className="space-y-2">
                                <MultiSelect 
                                  label="Documento"
                                  options={descricoesDoc}
                                  selected={selectedDescDoc}
                                  onChange={setSelectedDescDoc}
                                />
                              </div>
                              <div className="space-y-2">
                                <MultiSelect 
                                  label="Prazo / Validade"
                                  options={vencimentosDoc}
                                  selected={selectedVencimentoDoc}
                                  onChange={setSelectedVencimentoDoc}
                                  formatOption={formatDaysRemain}
                                />
                              </div>
                              <div className="space-y-2">
                                 <MultiSelect 
                                  label="Parcela"
                                  options={parcelasDoc}
                                  selected={selectedParcelaDoc}
                                  onChange={setSelectedParcelaDoc}
                                />
                              </div>
                              <div className="space-y-2">
                                <MultiSelect 
                                  label="Observações"
                                  options={observacoesDoc}
                                  selected={selectedObsDoc}
                                  onChange={setSelectedObsDoc}
                                />
                              </div>
                              <div className="space-y-2">
                                <MultiSelect 
                                  label="Data Pagamento"
                                  options={pagamentosDoc}
                                  selected={selectedPagamentoDoc}
                                  onChange={setSelectedPagamentoDoc}
                                  formatOption={formatBRDate}
                                />
                              </div>
                            </>
                          )}
                          <div className="space-y-2">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Busca Rápida</label>
                            <div className="relative">
                              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                              <input 
                                type="text" 
                                placeholder="Placa..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="w-full pl-11 pr-4 py-3 bg-white border border-slate-200 rounded-2xl text-sm outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all shadow-sm h-[48px]"
                              />
                            </div>
                          </div>

                          {/* Toggle Buttons aligned at the end of the grid */}
                          {activeTab === "licencas_documentos" && (
                            <div className="lg:col-span-2 xl:col-span-2 flex items-center gap-3 h-[48px]">
                              <button
                                onClick={() => setIsParcelaUnica(!isParcelaUnica)}
                                className={cn(
                                  "flex-1 flex items-center justify-center gap-2 px-6 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all border shadow-sm h-full",
                                  isParcelaUnica 
                                    ? "bg-blue-600 text-white border-blue-600 shadow-lg shadow-blue-200 scale-[1.02]" 
                                    : "bg-white text-slate-600 border-slate-200 hover:border-blue-300 hover:shadow-md"
                                )}
                              >
                                <ShieldCheck size={16} />
                                {isParcelaUnica ? "Única" : "Parcela Única"}
                              </button>
                              <button
                                onClick={() => setIsPagos100(!isPagos100)}
                                className={cn(
                                  "flex-1 flex items-center justify-center gap-2 px-6 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all border shadow-sm h-full",
                                  isPagos100 
                                    ? "bg-green-600 text-white border-green-600 shadow-lg shadow-green-200 scale-[1.02]" 
                                    : "bg-white text-slate-600 border-slate-200 hover:border-green-300 hover:shadow-md"
                                )}
                              >
                                <CheckCircle2 size={16} />
                                {isPagos100 ? "Pagos" : "100% Pagos"}
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                <div className="glass-card rounded-3xl flex flex-col h-[700px] overflow-hidden relative border border-slate-200/80 dark:border-slate-800">
                  <div className="p-8 border-b border-slate-200/80 dark:border-slate-800 flex items-center justify-between shrink-0 bg-slate-50/50 dark:bg-slate-900/50">
                    <h2 className="text-2xl font-display font-black text-slate-900 dark:text-white">Frota e Documentação</h2>
                    <div className="flex items-center gap-4">
                      <div className="flex glass p-1.5 rounded-2xl mr-4 shadow-inner">
                        <button 
                          onClick={exportToExcel}
                          className="flex items-center gap-2 px-4 py-2 text-[10px] font-black text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-800 hover:text-green-600 dark:hover:text-green-400 hover:shadow-md rounded-xl transition-all uppercase tracking-widest"
                          title="Exportar Planilha de Frota"
                        >
                          <FileSpreadsheet size={16} />
                          Excel
                        </button>
                        <button 
                          onClick={() => exportToPDF()}
                          className="flex items-center gap-2 px-4 py-2 text-[10px] font-black text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-800 hover:text-red-600 dark:hover:text-red-400 hover:shadow-md rounded-xl transition-all uppercase tracking-widest"
                          title="Exportar Relatório PDF"
                        >
                          <FileText size={16} />
                          PDF
                        </button>
                        <button 
                          onClick={handlePrint}
                          className="flex items-center gap-2 px-3 py-1.5 text-[10px] font-bold text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-800 hover:shadow-sm rounded-md transition-all"
                          title="Imprimir"
                        >
                          <Printer size={14} className="text-blue-600 dark:text-blue-400" />
                          IMPRIMIR
                        </button>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="flex items-center gap-4 text-[10px] font-bold uppercase text-slate-400 dark:text-slate-300">
                          <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-green-500 shadow-sm shadow-green-500/50"></div> OK</div>
                          <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-amber-500 shadow-sm shadow-amber-500/50"></div> 30 Dias</div>
                          <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-orange-500 shadow-sm shadow-orange-500/50"></div> 7 Dias</div>
                          <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-red-500 shadow-sm shadow-red-500/50"></div> Vencido</div>
                        </div>
                        <span className="text-xs text-slate-500 dark:text-slate-300 font-medium">
                          Exibindo {filteredFleet.length} de {fleet.length} veículos
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Top Scrollbar */}
                  <div 
                    className="overflow-x-auto border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 scrollbar-none"
                    onScroll={(e) => {
                      const bottomScroll = document.getElementById('fleet-table-container');
                      if (bottomScroll) bottomScroll.scrollLeft = e.currentTarget.scrollLeft;
                    }}
                  >
                    <div style={{ width: `${1100 + (activeTab === "licencas_detalhadas" ? interleavedDetailedColumns.length * 130 : 0)}px`, height: '8px' }}></div>
                  </div>

                  <div 
                    id="fleet-table-container"
                    className="overflow-x-scroll overflow-y-auto flex-1 scrollbar-thin scrollbar-thumb-slate-200 dark:scrollbar-thumb-slate-800 scrollbar-track-transparent bg-white dark:bg-slate-900"
                    onScroll={(e) => {
                      const topScroll = e.currentTarget.previousElementSibling;
                      if (topScroll) topScroll.scrollLeft = e.currentTarget.scrollLeft;
                    }}
                  >
                    <table className="w-full text-left border-collapse" style={{ minWidth: `${1100 + (activeTab === "licencas_detalhadas" ? interleavedDetailedColumns.length * 130 : 0)}px` }}>
                      <thead className="sticky top-0 z-30">
                        <tr className="bg-slate-100/90 dark:bg-slate-800/90 text-slate-600 dark:text-slate-200 text-[10px] uppercase tracking-wider font-bold">
                          {activeTab === "licencas_documentos" ? (
                            <>
                              <th className="px-6 py-4 font-bold border-b border-slate-200 dark:border-slate-700 sticky left-0 bg-slate-100 dark:bg-slate-800 z-40 text-slate-800 dark:text-white">Frota</th>
                              <th className="px-6 py-4 font-bold border-b border-slate-200 dark:border-slate-700 sticky left-[80px] bg-slate-100 dark:bg-slate-800 z-40 text-slate-800 dark:text-white">Placa</th>
                              {DOC_SISTEMA_COLUMNS.filter(c => c !== "Frota" && c !== "Placa").map(col => (
                                <th key={col} className="px-4 py-4 font-bold border-b border-slate-200 dark:border-slate-700 text-center min-w-[120px] bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200">
                                  {col === "Vencimento" ? "Validade" : col}
                                </th>
                              ))}
                            </>
                          ) : (
                            <>
                              <th className="px-6 py-4 font-bold border-b border-slate-200 dark:border-slate-700 sticky left-0 bg-slate-100 dark:bg-slate-800 z-40 text-slate-800 dark:text-white">Frota</th>
                              <th className="px-6 py-4 font-bold border-b border-slate-200 dark:border-slate-700 sticky left-[80px] bg-slate-100 dark:bg-slate-800 z-40 text-slate-800 dark:text-white">Placa</th>
                              <th className="px-6 py-4 font-bold border-b border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200">Operação</th>
                              <th className="px-6 py-4 font-bold border-b border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200">Motorista</th>
                              <th className="px-6 py-4 font-bold border-b border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200">Banheiro</th>
                              
                              {/* Interleaved Document & Financial Headers */}
                              {interleavedDetailedColumns.map((col, index) => {
                                if (col.type === "document") {
                                  const valStr = getLegalValidityPeriod(col.name, col.validity);
                                  return (
                                    <th key={`${col.name}-${index}`} className="px-4 py-3.5 border-b border-slate-200 dark:border-slate-700 text-center min-w-[140px] bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200">
                                      <div className="flex flex-col items-center justify-center gap-1">
                                        <span className="whitespace-nowrap font-black text-slate-900 dark:text-white text-[11px]">{col.name}</span>
                                        <span className="text-[9px] font-black text-blue-700 dark:text-cyan-300 bg-blue-100/90 dark:bg-blue-950/90 px-2 py-0.5 rounded-full border border-blue-200/80 dark:border-blue-800/80 shadow-2xs whitespace-nowrap">
                                          Validade: {valStr}
                                        </span>
                                      </div>
                                    </th>
                                  );
                                } else {
                                  return (
                                    <th key={`${col.name}-${index}`} className="px-4 py-4 font-bold border-b border-slate-200 dark:border-slate-700 text-center min-w-[130px] bg-slate-100 dark:bg-slate-800 text-emerald-800 dark:text-emerald-300 tracking-wide font-medium whitespace-nowrap">
                                      <span className="bg-emerald-50 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-300 px-2.5 py-1 rounded-lg border border-emerald-200 dark:border-emerald-800 shadow-sm block text-[10px] font-bold">
                                        {col.name}
                                      </span>
                                    </th>
                                  );
                                }
                              })}
                              
                              <th className="px-6 py-4 font-bold border-b border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200">Cidade / Base</th>
                            </>
                          )}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                        {filteredFleet.map((v) => (
                          <tr key={v.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors group">
                            <td className="px-6 py-4 sticky left-0 bg-white dark:bg-slate-900 group-hover:bg-slate-50 dark:group-hover:bg-slate-800 z-20 border-r border-slate-100 dark:border-slate-800">
                              <span className="text-[11px] font-bold text-blue-600 dark:text-cyan-400">{v.fleet}</span>
                            </td>
                            <td className="px-6 py-4 sticky left-[80px] bg-white dark:bg-slate-900 group-hover:bg-slate-50 dark:group-hover:bg-slate-800 z-20 border-r border-slate-100 dark:border-slate-800">
                              <div className="flex items-center gap-2">
                                {v.plate && (
                                  <div className={cn(
                                    "w-2 h-2 rounded-full shadow-sm",
                                    v.overallStatus === 'ok' || v.overallStatus === 'pagos' ? "bg-green-500 shadow-green-500/50" :
                                    v.overallStatus === 'atencao' ? "bg-amber-500 shadow-amber-500/50" :
                                    v.overallStatus === 'critico' ? "bg-orange-500 shadow-orange-500/50" : "bg-red-500 shadow-red-500/50"
                                  )}></div>
                                )}
                                <p className="font-bold text-sm tracking-wide text-slate-900 dark:text-white">{v.plate}</p>
                              </div>
                            </td>

                            {activeTab === "licencas_documentos" ? (
                              <>
                                {DOC_SISTEMA_COLUMNS.filter(c => c !== "Frota" && c !== "Placa").map(col => {
                                  // Flexible lookup for extraData
                                  let val = v.extraData?.[col];
                                  if (val === undefined || val === null || val === "") {
                                    // Try case-insensitive and accent-insensitive match
                                    const normalizedCol = col.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
                                    const foundKey = Object.keys(v.extraData || {}).find(k => 
                                      k.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim() === normalizedCol
                                    );
                                    if (foundKey) val = v.extraData[foundKey];
                                  }

                                  // Format dates to BR format
                                  if (col === "Emissão" || col === "Vencimento" || col === "Pagamento") {
                                    val = formatBRDate(val);
                                  }

                                  const isDateCol = col === "Emissão" || col === "Vencimento" || col === "Pagamento";
                                  const isVencimento = col === "Vencimento";
                                  const isPagamento = col === "Pagamento";

                                  if (isDateCol) {
                                    // Use row-specific status if available, otherwise fallback to first doc
                                    const status = v.extraData?._status || v.documents[0]?.status;
                                    const days = v.extraData?._daysRemaining !== undefined ? v.extraData._daysRemaining : v.documents[0]?.daysRemaining;

                                    return (
                                      <td key={col} className="px-4 py-4 text-center whitespace-nowrap">
                                        <div className="flex flex-col items-center gap-1">
                                          <span className={cn(
                                            "text-[11px] font-bold px-3 py-1 rounded-full border",
                                            col === "Emissão" ? "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700" : (
                                              status === 'pagos' ? "bg-emerald-100 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800 font-bold" :
                                              status === 'ok' ? "bg-green-100 dark:bg-green-950/80 text-green-700 dark:text-green-300 border-green-200 dark:border-green-800" :
                                              status === 'atencao' ? "bg-amber-100 dark:bg-amber-950/80 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800" :
                                              status === 'critico' ? "bg-orange-100 dark:bg-orange-950/80 text-orange-700 dark:text-orange-300 border-orange-200 dark:border-orange-800" : "bg-red-100 dark:bg-red-950/80 text-red-700 dark:text-red-300 border-red-200 dark:border-red-800"
                                            )
                                          )}>
                                            {val || "-"}
                                          </span>
                                          {(isVencimento || isPagamento) && val && val !== "-" && (
                                            <span className="text-[9px] font-black text-slate-400 dark:text-slate-300 uppercase">
                                              {status === 'vencido' ? `VENCIDO ${Math.abs(days || 0)}D` : (days !== undefined && days < 999 ? `${days}D` : "")}
                                            </span>
                                          )}
                                        </div>
                                      </td>
                                    );
                                  }

                                  if (col === "Valor") {
                                    const num = typeof val === "number" ? val : parseCurrencyVal(val);
                                    const formatted = num > 0 ? formatCurrencyBR(num) : (val || "-");
                                    const hasVal = formatted !== "-" && formatted !== "0" && formatted !== "R$ 0,00" && formatted !== "";
                                    return (
                                      <td key={col} className="px-4 py-4 text-center whitespace-nowrap">
                                        <span className={cn(
                                          "text-[11px] font-bold font-mono px-2.5 py-1 rounded-lg border inline-block tracking-tight transition-colors",
                                          hasVal 
                                            ? "text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/80 border-emerald-200 dark:border-emerald-700/80 shadow-xs dark:shadow-[0_0_10px_rgba(16,185,129,0.15)]"
                                            : "text-slate-400 dark:text-slate-500 bg-slate-50/60 dark:bg-slate-800/40 border-slate-200/60 dark:border-slate-800"
                                        )}>
                                          {formatted}
                                        </span>
                                      </td>
                                    );
                                  }

                                  let displayVal = val || "-";
                                  if (col === "Observações" && typeof displayVal === "string" && displayVal.length > 50) {
                                    displayVal = displayVal.substring(0, 47) + "...";
                                  }

                                  return (
                                    <td key={col} className="px-4 py-4 text-center text-[11px] font-medium text-slate-600 dark:text-slate-300 whitespace-nowrap">
                                      <div className={cn(col === "Observações" && "max-w-[250px] overflow-hidden text-ellipsis")} title={val && val.length > 50 ? val : undefined}>
                                        {displayVal}
                                      </div>
                                    </td>
                                  );
                                })}
                              </>
                            ) : (
                              <>
                                <td className="px-6 py-4">
                                  <span className="px-2 py-1 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 rounded text-[10px] font-bold uppercase whitespace-nowrap">
                                    {v.operation}
                                  </span>
                                </td>
                                <td className="px-6 py-4 text-[11px] font-bold text-slate-700 dark:text-slate-200 whitespace-nowrap">{v.driver}</td>
                                <td className="px-6 py-4 text-[11px] font-bold text-slate-700 dark:text-slate-200 whitespace-nowrap">{v.hasBathroom || "-"}</td>
                                
                                {/* Interleaved Document & Financial Cells */}
                                {interleavedDetailedColumns.map((col, idx) => {
                                  if (col.type === "document") {
                                    const doc = v.documents.find(d => d.type === col.name);
                                    return (
                                      <td key={`${col.name}-${idx}`} className="px-4 py-4 text-center">
                                        {doc ? (
                                          <div className="flex flex-col items-center gap-1">
                                            <span className={cn(
                                              "text-[10px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap border",
                                              doc.status === 'pagos' ? "bg-emerald-100 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800 font-bold" :
                                              doc.status === 'ok' ? "bg-green-100 dark:bg-green-950/80 text-green-700 dark:text-green-300 border-green-200 dark:border-green-800" :
                                              doc.status === 'atencao' ? "bg-amber-100 dark:bg-amber-950/80 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800" :
                                              doc.status === 'critico' ? "bg-orange-100 dark:bg-orange-950/80 text-orange-700 dark:text-orange-300 border-orange-200 dark:border-orange-800" : "bg-red-100 dark:bg-red-950/80 text-red-700 dark:text-red-300 border-red-200 dark:border-red-800"
                                            )}>
                                              {doc.expiryDate}
                                            </span>
                                            {doc.status !== 'ok' && doc.status !== 'pagos' && (
                                              <span className="text-[8px] uppercase font-bold text-slate-400 dark:text-slate-300">
                                                {doc.status === 'vencido' ? 'Vencido' : `${doc.daysRemaining}d`}
                                              </span>
                                            )}
                                          </div>
                                        ) : (
                                          <span className="text-slate-300 dark:text-slate-600 text-[10px]">-</span>
                                        )}
                                      </td>
                                    );
                                  } else {
                                    const rawVal = v.extraData?.[col.name];
                                    let displayVal = "-";
                                    if (rawVal !== undefined && rawVal !== null && String(rawVal).trim() !== "" && String(rawVal).trim() !== "-") {
                                      const num = typeof rawVal === "number" ? rawVal : parseCurrencyVal(rawVal);
                                      if (num > 0 && typeof rawVal === "number") {
                                        displayVal = formatCurrencyBR(num);
                                      } else {
                                        displayVal = String(rawVal).trim();
                                      }
                                    }
                                    const hasValue = displayVal !== "-" && displayVal !== "0" && displayVal !== "R$ 0,00" && displayVal !== "";
                                    return (
                                      <td key={`${col.name}-${idx}`} className="px-4 py-4 text-center whitespace-nowrap">
                                        <span className={cn(
                                          "text-[11px] font-bold font-mono px-2.5 py-1 rounded-lg border inline-block tracking-tight transition-colors",
                                          hasValue
                                            ? "text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/80 border-emerald-200 dark:border-emerald-700/80 shadow-xs dark:shadow-[0_0_10px_rgba(16,185,129,0.15)]"
                                            : "text-slate-400 dark:text-slate-500 bg-slate-50/60 dark:bg-slate-800/40 border-slate-200/60 dark:border-slate-800"
                                        )}>
                                          {displayVal}
                                        </span>
                                      </td>
                                    );
                                  }
                                })}
                                
                                <td className="px-6 py-4">
                                  <div className="flex items-center gap-1 text-[11px] text-slate-600 dark:text-slate-300 font-medium whitespace-nowrap">
                                    <MapIcon size={12} className="text-slate-400 dark:text-slate-400" />
                                    {v.cityBase}
                                  </div>
                                </td>
                              </>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  
                  {/* Validity Legend */}
                  {visibleDocumentTypes.some(t => t.validity) && (
                    <div className="p-4 bg-slate-50 dark:bg-slate-900/90 border-t border-slate-200 dark:border-slate-800 flex flex-wrap gap-x-6 gap-y-2">
                      <span className="text-[10px] font-bold text-slate-400 dark:text-slate-400 uppercase">Prazos de Validade:</span>
                      {visibleDocumentTypes.filter(t => t.validity).map(t => (
                        <div key={t.type} className="flex items-center gap-1.5">
                          <span className="text-[10px] font-bold text-slate-600 dark:text-slate-300">{t.type}:</span>
                          <span className="text-[10px] font-medium text-blue-700 dark:text-cyan-300 bg-blue-50 dark:bg-blue-950/80 border border-blue-200/60 dark:border-blue-800/60 px-1.5 py-0.5 rounded">{t.validity}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </motion.div>
            )}

            {(activeTab === "financeiro_docs" || activeTab === "financeiro_licencas") && fleet.length > 0 && (
              <motion.div 
                key={activeTab}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="space-y-8"
              >
                {/* Header & Controls */}
                <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 glass-card p-6 rounded-3xl">
                  <div>
                    <div className="flex items-center gap-2">
                      <div className="p-2 bg-blue-100 dark:bg-blue-900/60 text-blue-700 dark:text-cyan-300 rounded-xl">
                        <DollarSign size={20} />
                      </div>
                      <h1 className="text-2xl font-display font-black text-slate-900 dark:text-white">
                        {activeTab === "financeiro_licencas" ? "Financeiro - Licenças" : "Financeiro - Docs"}
                      </h1>
                      <span className="bg-blue-600 text-white text-[10px] font-black px-2.5 py-0.5 rounded-full uppercase tracking-wider">
                        Painel de Diretoria
                      </span>
                    </div>
                    <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                      {activeTab === "financeiro_licencas" 
                        ? "Monitoramento estratégico e financeiro do licenciamento da frota (Quitados, Em Aberto e Vencidos)"
                        : "Monitoramento estratégico e financeiro da documentação e licenciamento da frota (Quitados, Em Aberto e Vencidos)"}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2.5">
                    <button
                      onClick={() => setExibirDocsSemPlaca(!exibirDocsSemPlaca)}
                      className={cn(
                        "flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all border shadow-sm bg-white hover:bg-slate-50",
                        exibirDocsSemPlaca 
                          ? "text-blue-600 border-blue-200 bg-blue-50/50" 
                          : "text-slate-500 border-slate-200"
                      )}
                    >
                      {exibirDocsSemPlaca ? <Eye size={15} /> : <EyeOff size={15} />}
                      {exibirDocsSemPlaca ? "Exibindo Docs sem Placa" : "Ocultando Docs sem Placa"}
                    </button>

                    <button 
                      onClick={() => setIsFilterVisible(!isFilterVisible)}
                      className={cn(
                        "flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all border shadow-sm",
                        isFilterVisible 
                          ? "bg-slate-900 text-white border-slate-900 shadow-slate-200" 
                          : "bg-white text-slate-700 border-slate-200 hover:border-slate-300"
                      )}
                    >
                      {isFilterVisible ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                      {isFilterVisible ? "Ocultar Filtros" : "Mostrar Filtros"}
                    </button>

                    <button 
                      onClick={() => {
                        setSelectedOperation([]);
                        setSelectedStatus([]);
                        setSelectedCity([]);
                        setSelectedDriver([]);
                        setSelectedDocTypesLic([]);
                        setSelectedFrequencyLic([]);
                        setSelectedYearLic([]);
                        setSelectedMonthLic([]);
                        setSelectedFleetDoc([]);
                        setSelectedPlateDoc([]);
                        setSelectedDescDoc([]);
                        setSelectedObsDoc([]);
                        setSelectedVencimentoDoc([]);
                        setSelectedPagamentoDoc([]);
                        setSelectedParcelaDoc([]);
                        setSelectedStatusDoc([]);
                        setIsPagos100(false);
                        setIsParcelaUnica(false);
                        setSearchTerm("");
                      }}
                      className="px-4 py-2.5 text-slate-500 hover:text-red-600 hover:bg-white rounded-xl text-xs font-black uppercase tracking-wider transition-all border border-transparent hover:border-red-100 hover:shadow-sm flex items-center gap-1.5"
                      title="Limpar Filtros"
                    >
                      <RotateCcw size={15} />
                      Limpar
                    </button>

                    <div className="h-6 w-px bg-slate-200 mx-1 hidden sm:block"></div>

                    <button 
                      onClick={() => setIncludeChartsInPDF(!includeChartsInPDF)}
                      className={cn(
                        "flex items-center gap-2 px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all border shadow-sm uppercase tracking-wider",
                        includeChartsInPDF 
                          ? "bg-purple-100 dark:bg-purple-900/40 text-purple-900 dark:text-purple-200 border-purple-300 dark:border-purple-700 shadow-purple-500/10" 
                          : "bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:bg-slate-50"
                      )}
                      title="Alternar se o relatório PDF inclui os gráficos visuais de Valor/Mês e Placas/Mês"
                    >
                      <BarChart3 size={16} className={includeChartsInPDF ? "text-purple-600 dark:text-purple-400" : "text-slate-400"} />
                      <span>{includeChartsInPDF ? "Gráficos PDF: SIM" : "Gráficos PDF: NÃO"}</span>
                    </button>

                    <button 
                      onClick={() => setShowPlatesCol(!showPlatesCol)}
                      className={cn(
                        "flex items-center gap-2 px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all border shadow-sm uppercase tracking-wider",
                        showPlatesCol 
                          ? "bg-indigo-100 dark:bg-indigo-900/40 text-indigo-900 dark:text-indigo-200 border-indigo-300 dark:border-indigo-700 shadow-indigo-500/10" 
                          : "bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:bg-slate-50"
                      )}
                      title="Exibir ou ocultar a coluna 'Qtd. Placas/Frotas' do relatório PDF e do sistema"
                    >
                      <Truck size={16} className={showPlatesCol ? "text-indigo-600 dark:text-indigo-400" : "text-slate-400"} />
                      <span>{showPlatesCol ? "Qtd. Placas: EXIBIR" : "Qtd. Placas: OCULTAR"}</span>
                    </button>

                    <button 
                      onClick={exportFinancialExecutivePDFReport}
                      className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-blue-700 to-indigo-800 text-white font-bold text-xs rounded-xl shadow-md hover:shadow-lg hover:scale-[1.02] transition-all uppercase tracking-wider"
                    >
                      <FileText size={16} />
                      PDF Diretoria
                    </button>
                    <button 
                      onClick={exportToExcel}
                      className="flex items-center gap-2 px-3.5 py-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 font-bold text-xs rounded-xl shadow-sm hover:bg-slate-50 dark:hover:bg-slate-700 transition-all uppercase tracking-wider"
                    >
                      <FileSpreadsheet size={16} className="text-green-600 dark:text-green-400" />
                      Excel
                    </button>
                    <button 
                      onClick={handlePrint}
                      className="flex items-center gap-2 px-3.5 py-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 font-bold text-xs rounded-xl shadow-sm hover:bg-slate-50 dark:hover:bg-slate-700 transition-all uppercase tracking-wider"
                    >
                      <Printer size={16} className="text-blue-600 dark:text-cyan-400" />
                      Imprimir
                    </button>
                  </div>
                </div>

                {/* Filter Panel for Financeiro - Licenças & Docs */}
                <AnimatePresence mode="wait">
                  {isFilterVisible && (
                    <motion.div 
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto', transitionEnd: { overflow: 'visible' } }}
                      exit={{ opacity: 0, height: 0, transitionEnd: { overflow: 'hidden' } }}
                      transition={{ duration: 0.3, ease: "easeInOut" }}
                      className="relative z-50 my-2"
                      key="fin-filter-panel"
                    >
                      <div className="glass-card p-6 rounded-3xl space-y-6">
                        {/* Sub-Tab Navigation inside Filter Card for Financeiro - Licenças */}
                        {activeTab === "financeiro_licencas" && (
                          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pb-5 border-b border-slate-200/80 dark:border-slate-800">
                            <div className="flex flex-wrap items-center gap-2 p-1 bg-slate-100 dark:bg-slate-900/90 rounded-2xl border border-slate-200/80 dark:border-slate-800 shrink-0">
                              <button
                                type="button"
                                onClick={() => setFinLicencasSubTab('resumo')}
                                className={cn(
                                  "flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all shadow-2xs",
                                  finLicencasSubTab === 'resumo'
                                    ? "bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-md shadow-blue-500/20"
                                    : "text-slate-600 dark:text-slate-400 hover:text-blue-600 dark:hover:text-cyan-300 hover:bg-white dark:hover:bg-slate-800"
                                )}
                              >
                                <FileText size={15} />
                                <span>Resumo</span>
                                <span className="bg-emerald-400 text-slate-950 px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider">
                                  Alertas
                                </span>
                              </button>
                              <button
                                type="button"
                                onClick={() => setFinLicencasSubTab('painel')}
                                className={cn(
                                  "flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all shadow-2xs",
                                  finLicencasSubTab === 'painel'
                                    ? "bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-md shadow-blue-500/20"
                                    : "text-slate-600 dark:text-slate-400 hover:text-blue-600 dark:hover:text-cyan-300 hover:bg-white dark:hover:bg-slate-800"
                                )}
                              >
                                <DollarSign size={15} />
                                <span>Painel Financeiro & Custos</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => setFinLicencasSubTab('prazos_modelos')}
                                className={cn(
                                  "flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all shadow-2xs",
                                  finLicencasSubTab === 'prazos_modelos'
                                    ? "bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-md shadow-blue-500/20"
                                    : "text-slate-600 dark:text-slate-400 hover:text-blue-600 dark:hover:text-cyan-300 hover:bg-white dark:hover:bg-slate-800"
                                )}
                              >
                                <Clock size={15} />
                                <span>Modelos & Prazos Legais</span>
                              </button>
                            </div>

                            <div className="text-[11px] text-slate-500 dark:text-slate-400 font-medium px-1">
                              {finLicencasSubTab === 'resumo' ? (
                                <span>Resumo consolidado de alertas e regularidade das licenças da frota</span>
                              ) : finLicencasSubTab === 'painel' ? (
                                <span>Filtros operacionais e financeiros da frota</span>
                              ) : (
                                <span>Filtros do catálogo oficial de vigências regulamentares</span>
                              )}
                            </div>
                          </div>
                        )}

                        {activeTab === "financeiro_licencas" ? (
                          (finLicencasSubTab === 'painel' || finLicencasSubTab === 'resumo') ? (
                            <div className="space-y-3">
                              {/* Linha 1 de Filtros */}
                              <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-3 items-end">
                                <div className="space-y-1.5">
                                  <MultiSelect 
                                    label="Ano"
                                    options={yearsLic}
                                    selected={selectedYearLic}
                                    onChange={setSelectedYearLic}
                                  />
                                </div>
                                <div className="space-y-1.5">
                                  <MultiSelect 
                                    label="Mês"
                                    options={monthsLic}
                                    selected={selectedMonthLic}
                                    onChange={setSelectedMonthLic}
                                  />
                                </div>
                                <div className="space-y-1.5">
                                  <MultiSelect 
                                    label="Operação"
                                    options={operations}
                                    selected={selectedOperation}
                                    onChange={setSelectedOperation}
                                  />
                                </div>
                                <div className="space-y-1.5">
                                  <MultiSelect 
                                    label="Documento"
                                    options={documentTypesLic}
                                    selected={selectedDocTypesLic}
                                    onChange={setSelectedDocTypesLic}
                                  />
                                </div>
                                <div className="space-y-1.5">
                                  <MultiSelect 
                                    label="Frequência de Renovação"
                                    options={frequenciesLic}
                                    selected={selectedFrequencyLic}
                                    onChange={setSelectedFrequencyLic}
                                  />
                                </div>
                              </div>

                              {/* Linha 2 de Filtros */}
                              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 items-end">
                                <div className="space-y-1.5">
                                  <MultiSelect 
                                    label="Status Documental"
                                    options={['ok', 'atencao', 'critico', 'vencido', 'em_aberto', 'pagos']}
                                    selected={selectedStatus}
                                    onChange={setSelectedStatus}
                                    formatOption={(opt) => {
                                      if (opt === 'ok') return 'OK (Regular)';
                                      if (opt === 'atencao') return 'Atenção (30 dias)';
                                      if (opt === 'critico') return 'Crítico (7 dias)';
                                      if (opt === 'vencido') return 'Vencido';
                                      if (opt === 'em_aberto') return 'Em Aberto';
                                      if (opt === 'pagos') return 'Pagos';
                                      return opt;
                                    }}
                                  />
                                </div>
                                <div className="space-y-1.5">
                                  <MultiSelect 
                                    label="Cidade / Base"
                                    options={cities}
                                    selected={selectedCity}
                                    onChange={setSelectedCity}
                                  />
                                </div>
                                <div className="space-y-1.5">
                                  <MultiSelect 
                                    label="Motorista"
                                    options={drivers}
                                    selected={selectedDriver}
                                    onChange={setSelectedDriver}
                                  />
                                </div>
                                <div className="space-y-1.5">
                                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Busca Rápida</label>
                                  <div className="relative">
                                    <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
                                    <input 
                                      type="text" 
                                      placeholder="Placa, motorista..."
                                      value={finLicencasSubTab === 'resumo' ? (resumoSearchTerm || searchTerm) : searchTerm}
                                      onChange={(e) => {
                                        setSearchTerm(e.target.value);
                                        setResumoSearchTerm(e.target.value);
                                      }}
                                      className="w-full pl-10 pr-4 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl text-xs outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all shadow-sm h-[44px]"
                                    />
                                  </div>
                                </div>
                              </div>
                            </div>
                          ) : (
                            <div className="space-y-4">
                              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
                                <div className="md:col-span-2 space-y-1.5">
                                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Buscar Modelo / Órgão / Validade</label>
                                  <div className="relative">
                                    <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
                                    <input 
                                      type="text" 
                                      placeholder="Ex: SEGURO, TACOGRAFO, DER, INMETRO, 01 ANO..."
                                      value={modelosSearch}
                                      onChange={(e) => setModelosSearch(e.target.value)}
                                      className="w-full pl-10 pr-4 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl text-xs outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all shadow-sm h-[44px]"
                                    />
                                  </div>
                                </div>
                                <div className="space-y-1.5">
                                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Modelos Encontrados</label>
                                  <div className="h-[44px] px-4 bg-blue-50 dark:bg-blue-950/60 border border-blue-200/80 dark:border-blue-800 rounded-2xl flex items-center justify-between text-xs font-black text-blue-700 dark:text-cyan-300">
                                    <span>Total no Catálogo:</span>
                                    <span className="bg-blue-600 text-white px-2.5 py-0.5 rounded-full text-[11px]">{filteredLicenseModels.length}</span>
                                  </div>
                                </div>
                              </div>

                              <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                                <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider mr-1">Filtrar por Categoria:</span>
                                {[
                                  { id: 'todos', label: 'Todos' },
                                  { id: 'seguros', label: 'Seguros & Coberturas' },
                                  { id: 'vistorias', label: 'Vistorias & Laudos' },
                                  { id: 'orgaos', label: 'Órgãos Reguladores' },
                                  { id: 'documentos', label: 'Documentos & Cadastros' },
                                  { id: 'equipamentos', label: 'Equipamentos' },
                                ].map(cat => (
                                  <button
                                    key={cat.id}
                                    type="button"
                                    onClick={() => setModelosCategory(cat.id)}
                                    className={cn(
                                      "px-3 py-1.5 rounded-xl text-[11px] font-black transition-all border shadow-2xs uppercase tracking-tight",
                                      modelosCategory === cat.id
                                        ? "bg-slate-900 dark:bg-white text-white dark:text-slate-900 border-slate-900 dark:border-white shadow-sm"
                                        : "bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-slate-300"
                                    )}
                                  >
                                    {cat.label}
                                  </button>
                                ))}
                              </div>
                            </div>
                          )
                        ) : (
                          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6 gap-4 items-end">
                            <div className="space-y-1.5">
                              <MultiSelect 
                                label="Status"
                                options={['em_aberto', 'vencido', 'critico', 'atencao', 'ok', 'pagos']}
                                selected={selectedStatusDoc}
                                onChange={setSelectedStatusDoc}
                                formatOption={(opt) => {
                                  if (opt === 'em_aberto') return 'Em Aberto';
                                  if (opt === 'vencido') return 'Vencido';
                                  if (opt === 'critico') return 'Crítico (7d)';
                                  if (opt === 'atencao') return 'Atenção (30d)';
                                  if (opt === 'ok') return 'OK (Regular)';
                                  if (opt === 'pagos') return 'Pagos';
                                  return opt;
                                }}
                              />
                            </div>
                            <div className="space-y-1.5">
                              <MultiSelect 
                                label="Frota"
                                options={frotasDoc}
                                selected={selectedFleetDoc}
                                onChange={setSelectedFleetDoc}
                              />
                            </div>
                            <div className="space-y-1.5">
                              <MultiSelect 
                                label="Placa"
                                options={placasDoc}
                                selected={selectedPlateDoc}
                                onChange={setSelectedPlateDoc}
                              />
                            </div>
                            <div className="space-y-1.5">
                              <MultiSelect 
                                label="Documento"
                                options={descricoesDoc}
                                selected={selectedDescDoc}
                                onChange={setSelectedDescDoc}
                              />
                            </div>
                            <div className="space-y-1.5">
                              <MultiSelect 
                                label="Prazo / Validade"
                                options={vencimentosDoc}
                                selected={selectedVencimentoDoc}
                                onChange={setSelectedVencimentoDoc}
                                formatOption={formatDaysRemain}
                              />
                            </div>
                            <div className="space-y-1.5">
                              <MultiSelect 
                                label="Parcela"
                                options={parcelasDoc}
                                selected={selectedParcelaDoc}
                                onChange={setSelectedParcelaDoc}
                              />
                            </div>
                            <div className="space-y-1.5">
                              <MultiSelect 
                                label="Observações"
                                options={observacoesDoc}
                                selected={selectedObsDoc}
                                onChange={setSelectedObsDoc}
                              />
                            </div>
                            <div className="space-y-1.5">
                              <MultiSelect 
                                label="Data Pagamento"
                                options={pagamentosDoc}
                                selected={selectedPagamentoDoc}
                                onChange={setSelectedPagamentoDoc}
                                formatOption={formatBRDate}
                              />
                            </div>
                            <div className="space-y-1.5">
                              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Busca Rápida</label>
                              <div className="relative">
                                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
                                <input 
                                  type="text" 
                                  placeholder="Placa, pedido..."
                                  value={searchTerm}
                                  onChange={(e) => setSearchTerm(e.target.value)}
                                  className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-2xl text-xs outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all shadow-sm h-[44px]"
                                />
                              </div>
                            </div>

                            <div className="lg:col-span-2 xl:col-span-3 flex items-center gap-3 h-[44px]">
                              <button
                                onClick={() => setIsParcelaUnica(!isParcelaUnica)}
                                className={cn(
                                  "flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all border shadow-sm h-full",
                                  isParcelaUnica 
                                    ? "bg-blue-600 text-white border-blue-600 shadow-lg shadow-blue-200 scale-[1.02]" 
                                    : "bg-white text-slate-600 border-slate-200 hover:border-blue-300 hover:shadow-md"
                                )}
                              >
                                <ShieldCheck size={16} />
                                {isParcelaUnica ? "Única" : "Parcela Única"}
                              </button>
                              <button
                                onClick={() => setIsPagos100(!isPagos100)}
                                className={cn(
                                  "flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all border shadow-sm h-full",
                                  isPagos100 
                                    ? "bg-emerald-600 text-white border-emerald-600 shadow-lg shadow-emerald-200 scale-[1.02]" 
                                    : "bg-white text-slate-600 border-slate-200 hover:border-emerald-300 hover:shadow-md"
                                )}
                              >
                                <CheckCircle2 size={16} />
                                {isPagos100 ? "Pagos" : "100% Pagos"}
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {activeTab === "financeiro_licencas" && finLicencasSubTab === "resumo" ? (
                  <div className="space-y-6">
                    {/* Page Header Banner */}
                    <div className="glass-card p-6 md:p-8 rounded-3xl border border-blue-200/80 dark:border-blue-900/60 bg-gradient-to-r from-slate-900 via-blue-950 to-indigo-950 text-white shadow-xl relative overflow-hidden">
                      <div className="absolute right-0 top-0 bottom-0 w-1/3 bg-gradient-to-l from-blue-500/10 to-transparent pointer-events-none"></div>
                      <div className="relative z-10 space-y-4">
                        <div className="flex flex-wrap items-center justify-between gap-4">
                          <div className="flex items-center gap-3">
                            <div className="p-3.5 bg-blue-500/20 text-cyan-300 rounded-2xl border border-blue-400/30 backdrop-blur-md">
                              <FileText size={28} />
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <h2 className="text-2xl font-display font-black text-white tracking-tight uppercase">
                                  RELATÓRIO DE ALERTAS - LICENÇAS
                                </h2>
                                <span className="px-2.5 py-0.5 bg-blue-500/30 border border-blue-400/40 text-cyan-200 font-bold text-[10px] rounded-full uppercase tracking-wider">
                                  Resumo Executivo
                                </span>
                              </div>
                              <p className="text-xs text-slate-300 font-medium mt-0.5">
                                Monitoramento consolidado de validades, status regulamentar e prazos legais de todas as licenças da frota
                              </p>
                            </div>
                          </div>

                          <div className="flex flex-wrap items-center gap-2">
                            <label 
                              className="flex items-center gap-1.5 cursor-pointer px-3 py-2 bg-white/10 hover:bg-white/15 border border-white/20 rounded-xl text-xs font-bold text-white transition-all select-none"
                              title="Incluir ou omitir cards e resumos visuais no relatório PDF gerado"
                            >
                              <input 
                                type="checkbox"
                                checked={includePdfSummaries}
                                onChange={(e) => toggleIncludePdfSummaries(e.target.checked)}
                                className="w-3.5 h-3.5 rounded border-white/30 text-blue-500 focus:ring-blue-400 cursor-pointer accent-blue-500"
                              />
                              <span>Resumos/Cards:</span>
                              <span className={cn(
                                "text-[10px] font-black uppercase px-1.5 py-0.5 rounded",
                                includePdfSummaries ? "bg-emerald-500/40 text-emerald-300 border border-emerald-400/40" : "bg-slate-700/60 text-slate-300 border border-slate-600"
                              )}>
                                {includePdfSummaries ? "SIM" : "NÃO"}
                              </span>
                            </label>
                            <span className="text-[11px] font-bold text-slate-300 bg-white/10 px-3 py-2 rounded-xl border border-white/10">
                              Gerado em: {format(new Date(), "dd/MM/yyyy HH:mm")}
                            </span>
                            <button
                              type="button"
                              onClick={() => exportToPDF()}
                              className="flex items-center gap-2 px-4 py-2.5 rounded-2xl text-xs font-black uppercase tracking-wider bg-blue-600 hover:bg-blue-500 text-white transition-all shadow-md shadow-blue-600/30 active:scale-95"
                            >
                              <Printer size={15} />
                              <span>Imprimir / PDF</span>
                            </button>
                            <button
                              type="button"
                              onClick={exportToExcel}
                              className="flex items-center gap-2 px-4 py-2.5 rounded-2xl text-xs font-black uppercase tracking-wider bg-emerald-600 hover:bg-emerald-500 text-white transition-all shadow-md shadow-emerald-600/30 active:scale-95"
                            >
                              <FileSpreadsheet size={15} />
                              <span>Excel</span>
                            </button>
                          </div>
                        </div>

                        {/* Executive KPI Stats Bar */}
                        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 pt-2">
                          <div 
                            onClick={() => setResumoStatusFilter('todos')}
                            className={cn(
                              "p-3.5 rounded-2xl border transition-all cursor-pointer flex items-center justify-between",
                              resumoStatusFilter === 'todos' 
                                ? "bg-white/15 border-cyan-400 shadow-md" 
                                : "bg-white/5 border-white/10 hover:bg-white/10"
                            )}
                          >
                            <div>
                              <span className="text-[10px] font-bold text-slate-300 uppercase tracking-wider block">Total Licenças</span>
                              <span className="text-xl font-black text-white">{licenseAlertsList.length}</span>
                            </div>
                            <FileText size={20} className="text-cyan-300 opacity-80" />
                          </div>

                          <div 
                            onClick={() => setResumoStatusFilter('vencido')}
                            className={cn(
                              "p-3.5 rounded-2xl border transition-all cursor-pointer flex items-center justify-between",
                              resumoStatusFilter === 'vencido' 
                                ? "bg-red-500/30 border-red-400 shadow-md" 
                                : "bg-red-950/40 border-red-500/20 hover:bg-red-900/30"
                            )}
                          >
                            <div>
                              <span className="text-[10px] font-bold text-red-200 uppercase tracking-wider block">Vencidas</span>
                              <span className="text-xl font-black text-red-400">
                                {licenseAlertsList.filter(i => i.status === 'vencido').length}
                              </span>
                            </div>
                            <AlertTriangle size={20} className="text-red-400" />
                          </div>

                          <div 
                            onClick={() => setResumoStatusFilter('critico')}
                            className={cn(
                              "p-3.5 rounded-2xl border transition-all cursor-pointer flex items-center justify-between",
                              resumoStatusFilter === 'critico' 
                                ? "bg-orange-500/30 border-orange-400 shadow-md" 
                                : "bg-orange-950/40 border-orange-500/20 hover:bg-orange-900/30"
                            )}
                          >
                            <div>
                              <span className="text-[10px] font-bold text-orange-200 uppercase tracking-wider block">Críticas (até 7d)</span>
                              <span className="text-xl font-black text-orange-400">
                                {licenseAlertsList.filter(i => i.status === 'critico').length}
                              </span>
                            </div>
                            <Clock size={20} className="text-orange-400" />
                          </div>

                          <div 
                            onClick={() => setResumoStatusFilter('atencao')}
                            className={cn(
                              "p-3.5 rounded-2xl border transition-all cursor-pointer flex items-center justify-between",
                              resumoStatusFilter === 'atencao' 
                                ? "bg-amber-500/30 border-amber-400 shadow-md" 
                                : "bg-amber-950/40 border-amber-500/20 hover:bg-amber-900/30"
                            )}
                          >
                            <div>
                              <span className="text-[10px] font-bold text-amber-200 uppercase tracking-wider block">Atenção (até 30d)</span>
                              <span className="text-xl font-black text-amber-300">
                                {licenseAlertsList.filter(i => i.status === 'atencao').length}
                              </span>
                            </div>
                            <Clock size={20} className="text-amber-300" />
                          </div>

                          <div 
                            onClick={() => setResumoStatusFilter('ok')}
                            className={cn(
                              "p-3.5 rounded-2xl border transition-all cursor-pointer flex items-center justify-between",
                              resumoStatusFilter === 'ok' 
                                ? "bg-emerald-500/30 border-emerald-400 shadow-md" 
                                : "bg-emerald-950/40 border-emerald-500/20 hover:bg-emerald-900/30"
                            )}
                          >
                            <div>
                              <span className="text-[10px] font-bold text-emerald-200 uppercase tracking-wider block">Regulares (OK)</span>
                              <span className="text-xl font-black text-emerald-400">
                                {licenseAlertsList.filter(i => i.status === 'ok').length}
                              </span>
                            </div>
                            <CheckCircle2 size={20} className="text-emerald-400" />
                          </div>

                          <div className="p-3.5 rounded-2xl border bg-blue-900/40 border-blue-400/30 flex items-center justify-between">
                            <div>
                              <span className="text-[10px] font-bold text-cyan-200 uppercase tracking-wider block">Valor Total</span>
                              <span className="text-base font-black text-cyan-300 font-mono">
                                {formatCurrencyBR(licenseAlertsList.reduce((acc, curr) => acc + curr.valor, 0))}
                              </span>
                            </div>
                            <DollarSign size={20} className="text-cyan-300" />
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Custo Despachante Info Banner */}
                    {(() => {
                      const despInfo = getBayerGoDespachanteInfo(filteredFleet);
                      if (!despInfo.hasBayerGo) return null;
                      const opLabel = (despInfo.operationName || "BAYER").toUpperCase();
                      return (
                        <div className="p-4 rounded-2xl bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950/50 dark:to-indigo-950/50 border border-blue-200/90 dark:border-blue-800/80 flex flex-wrap items-center justify-between gap-3 shadow-sm">
                          <div className="flex items-center gap-3">
                            <div className="p-2.5 bg-blue-600 text-white rounded-xl shadow-xs">
                              <UserCheck size={20} />
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-black text-blue-900 dark:text-blue-100 uppercase tracking-wider">
                                  {opLabel} — CUSTO OPERACIONAL DESPACHANTE
                                </span>
                                <span className="px-2 py-0.5 bg-blue-200/80 dark:bg-blue-900/80 text-blue-900 dark:text-blue-100 font-extrabold text-[10px] rounded-md uppercase">
                                  Valor Por Veículo
                                </span>
                              </div>
                              <p className="text-xs text-blue-700 dark:text-blue-300 font-medium mt-0.5">
                                Custo Despachante = <strong className="font-black text-blue-950 dark:text-white">{despInfo.formatted} (valor por veículo)</strong> aplicado na regulamentação e despachante da frota {opLabel}.
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 bg-white dark:bg-slate-800 px-3.5 py-1.5 rounded-xl border border-blue-200 dark:border-blue-700/60 shadow-xs">
                            <DollarSign size={15} className="text-blue-600 dark:text-blue-400" />
                            <span className="text-xs font-black text-blue-900 dark:text-blue-200 font-mono">
                              {despInfo.formatted} / veículo
                            </span>
                          </div>
                        </div>
                      );
                    })()}

                    {/* Quick Filters Bar & Search */}
                    <div className="glass-card p-4 rounded-2xl border border-slate-200/90 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 flex flex-wrap items-center justify-between gap-3 shadow-xs">
                      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
                        <button
                          type="button"
                          onClick={() => setResumoStatusFilter('todos')}
                          className={cn(
                            "px-3 py-1.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all shrink-0",
                            resumoStatusFilter === 'todos'
                              ? "bg-blue-600 text-white shadow-sm"
                              : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200"
                          )}
                        >
                          Todos ({licenseAlertsList.length})
                        </button>
                        <button
                          type="button"
                          onClick={() => setResumoStatusFilter('alertas')}
                          className={cn(
                            "px-3 py-1.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all shrink-0",
                            resumoStatusFilter === 'alertas'
                              ? "bg-purple-600 text-white shadow-sm"
                              : "bg-purple-50 dark:bg-purple-950/50 text-purple-700 dark:text-purple-300 hover:bg-purple-100"
                          )}
                        >
                          Somente Alertas ({licenseAlertsList.filter(i => i.status !== 'ok').length})
                        </button>
                        <button
                          type="button"
                          onClick={() => setResumoStatusFilter('vencido')}
                          className={cn(
                            "px-3 py-1.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all shrink-0",
                            resumoStatusFilter === 'vencido'
                              ? "bg-red-600 text-white shadow-sm"
                              : "bg-red-50 dark:bg-red-950/50 text-red-700 dark:text-red-300 hover:bg-red-100"
                          )}
                        >
                          Vencidos ({licenseAlertsList.filter(i => i.status === 'vencido').length})
                        </button>
                        <button
                          type="button"
                          onClick={() => setResumoStatusFilter('critico')}
                          className={cn(
                            "px-3 py-1.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all shrink-0",
                            resumoStatusFilter === 'critico'
                              ? "bg-orange-600 text-white shadow-sm"
                              : "bg-orange-50 dark:bg-orange-950/50 text-orange-700 dark:text-orange-300 hover:bg-orange-100"
                          )}
                        >
                          Críticos ({licenseAlertsList.filter(i => i.status === 'critico').length})
                        </button>
                        <button
                          type="button"
                          onClick={() => setResumoStatusFilter('atencao')}
                          className={cn(
                            "px-3 py-1.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all shrink-0",
                            resumoStatusFilter === 'atencao'
                              ? "bg-amber-600 text-white shadow-sm"
                              : "bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 hover:bg-amber-100"
                          )}
                        >
                          Atenção ({licenseAlertsList.filter(i => i.status === 'atencao').length})
                        </button>
                        <button
                          type="button"
                          onClick={() => setResumoStatusFilter('ok')}
                          className={cn(
                            "px-3 py-1.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all shrink-0",
                            resumoStatusFilter === 'ok'
                              ? "bg-emerald-600 text-white shadow-sm"
                              : "bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100"
                          )}
                        >
                          Regulares ({licenseAlertsList.filter(i => i.status === 'ok').length})
                        </button>
                      </div>

                      <div className="relative w-full sm:w-64">
                        <Search className="absolute left-3 top-2.5 text-slate-400" size={16} />
                        <input
                          type="text"
                          value={resumoSearchTerm}
                          onChange={(e) => setResumoSearchTerm(e.target.value)}
                          placeholder="Buscar documento, placa, frota..."
                          className="w-full pl-9 pr-3 py-1.5 text-xs rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium"
                        />
                      </div>
                    </div>

                    {/* Table Displaying "RELATÓRIO DE ALERTAS - LICENÇAS" */}
                    <div className="glass-card rounded-3xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-lg bg-white dark:bg-slate-900">
                      <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                          <thead>
                            <tr className="bg-[#1E40AF] text-white text-[11px] font-black uppercase tracking-wider select-none">
                              <th onClick={() => handleSortResumo('docType')} className="py-3.5 px-4 cursor-pointer hover:bg-blue-800 transition-colors group">
                                <div className="flex items-center justify-start gap-1">Documento {renderSortIcon('docType')}</div>
                              </th>
                              <th onClick={() => handleSortResumo('operation')} className="py-3.5 px-4 cursor-pointer hover:bg-blue-800 transition-colors group">
                                <div className="flex items-center justify-start gap-1">Operação {renderSortIcon('operation')}</div>
                              </th>
                              <th onClick={() => handleSortResumo('plate')} className="py-3.5 px-4 text-center cursor-pointer hover:bg-blue-800 transition-colors group">
                                <div className="flex items-center justify-center gap-1">Placa {renderSortIcon('plate')}</div>
                              </th>
                              <th onClick={() => handleSortResumo('fleet')} className="py-3.5 px-4 text-center cursor-pointer hover:bg-blue-800 transition-colors group">
                                <div className="flex items-center justify-center gap-1">Frota {renderSortIcon('fleet')}</div>
                              </th>
                              <th onClick={() => handleSortResumo('frequencia')} className="py-3.5 px-4 text-center cursor-pointer hover:bg-blue-800 transition-colors group">
                                <div className="flex items-center justify-center gap-1">Frequência de Renovação {renderSortIcon('frequencia')}</div>
                              </th>
                              <th onClick={() => handleSortResumo('valor')} className="py-3.5 px-4 text-right cursor-pointer hover:bg-blue-800 transition-colors group">
                                <div className="flex items-center justify-end gap-1">Valor {renderSortIcon('valor')}</div>
                              </th>
                              <th onClick={() => handleSortResumo('status')} className="py-3.5 px-4 text-center cursor-pointer hover:bg-blue-800 transition-colors group">
                                <div className="flex items-center justify-center gap-1">Status {renderSortIcon('status')}</div>
                              </th>
                              <th onClick={() => handleSortResumo('prazo')} className="py-3.5 px-4 text-center cursor-pointer hover:bg-blue-800 transition-colors group">
                                <div className="flex items-center justify-center gap-1">Prazo {renderSortIcon('prazo')}</div>
                              </th>
                              <th onClick={() => handleSortResumo('vencimento')} className="py-3.5 px-4 text-center cursor-pointer hover:bg-blue-800 transition-colors group">
                                <div className="flex items-center justify-center gap-1">Vencimento {renderSortIcon('vencimento')}</div>
                              </th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-200 dark:divide-slate-800 text-xs">
                            {filteredResumoList.length > 0 ? (
                              filteredResumoList.map((item, idx) => (
                                <tr 
                                  key={`${item.id}-${idx}`}
                                  className="hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors font-medium text-slate-800 dark:text-slate-200"
                                >
                                  <td className="py-3 px-4 font-black text-slate-900 dark:text-white uppercase">
                                    {item.docType}
                                  </td>
                                  <td className="py-3 px-4 text-slate-600 dark:text-slate-300">
                                    {item.operation}
                                  </td>
                                  <td className="py-3 px-4 text-center font-mono font-bold text-slate-900 dark:text-white">
                                    {item.plate}
                                  </td>
                                  <td className="py-3 px-4 text-center font-bold text-slate-700 dark:text-slate-300">
                                    {item.fleet}
                                  </td>
                                  <td className="py-3 px-4 text-center">
                                    <span className="inline-block px-2.5 py-1 rounded-lg bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 text-[11px] font-bold border border-blue-200/60 dark:border-blue-900/40 whitespace-nowrap">
                                      {item.frequencia}
                                    </span>
                                  </td>
                                  <td className="py-3 px-4 text-right font-mono font-bold text-slate-900 dark:text-white whitespace-nowrap">
                                    {item.valorFormatted}
                                  </td>
                                  <td className="py-3 px-4 text-center">
                                    <span
                                      className={cn(
                                        "font-extrabold uppercase text-[11px]",
                                        item.status === 'vencido' && "text-red-600 dark:text-red-400",
                                        item.status === 'critico' && "text-orange-600 dark:text-orange-400",
                                        item.status === 'atencao' && "text-amber-600 dark:text-amber-400",
                                        item.status === 'ok' && "text-emerald-600 dark:text-emerald-400"
                                      )}
                                    >
                                      {item.statusLabel}
                                    </span>
                                  </td>
                                  <td className="py-3 px-4 text-center">
                                    <span
                                      className={cn(
                                        "font-semibold",
                                        item.status === 'vencido' && "text-red-600 dark:text-red-400 font-bold",
                                        item.status === 'critico' && "text-orange-600 dark:text-orange-400 font-bold",
                                        item.status === 'atencao' && "text-amber-600 dark:text-amber-400",
                                        item.status === 'ok' && "text-slate-600 dark:text-slate-400"
                                      )}
                                    >
                                      {item.prazo}
                                    </span>
                                  </td>
                                  <td className="py-3 px-4 text-center font-semibold text-slate-700 dark:text-slate-300">
                                    {item.vencimento}
                                  </td>
                                </tr>
                              ))
                            ) : (
                              <tr>
                                <td colSpan={9} className="py-12 text-center text-slate-500 dark:text-slate-400">
                                  <FileText className="mx-auto text-slate-300 dark:text-slate-600 mb-2" size={36} />
                                  <p className="font-bold text-sm">Nenhum alerta de licença encontrado</p>
                                  <p className="text-xs text-slate-400 mt-1">
                                    Tente ajustar a busca ou os filtros de status selecionados.
                                  </p>
                                  <button
                                    onClick={() => { setResumoStatusFilter('todos'); setResumoSearchTerm(''); }}
                                    className="mt-3 px-4 py-1.5 bg-blue-600 text-white text-xs font-bold rounded-xl hover:bg-blue-700 transition-all"
                                  >
                                    Limpar Filtros
                                  </button>
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>

                      <div className="p-4 bg-slate-50 dark:bg-slate-900/80 border-t border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between text-xs text-slate-500 font-medium gap-3">
                        <div className="space-y-1">
                          <div>Exibindo <strong>{filteredResumoList.length}</strong> de <strong>{licenseAlertsList.length}</strong> alertas de licença | Valor Total: <strong className="text-slate-900 dark:text-white">{formatCurrencyBR(filteredResumoList.reduce((acc, curr) => acc + curr.valor, 0))}</strong></div>
                          {(() => {
                            const despInfo = getBayerGoDespachanteInfo(filteredFleet);
                            if (!despInfo.hasBayerGo) return null;
                            const opLabel = (despInfo.operationName || "BAYER").toUpperCase();
                            return (
                              <div className="text-[11px] text-blue-800 dark:text-blue-300 bg-blue-50/80 dark:bg-blue-950/40 px-2.5 py-1 rounded-lg border border-blue-200 dark:border-blue-800/60 font-bold flex items-center gap-2">
                                <UserCheck size={14} className="text-blue-600 shrink-0" />
                                <span><strong>{opLabel}:</strong> Custo Despachante = <strong>{despInfo.formatted}</strong> (valor por veículo) para despachante/regulamentação.</span>
                              </div>
                            );
                          })()}
                        </div>
                        <div className="flex items-center gap-4">
                          <span className="text-red-600 dark:text-red-400 font-bold">● Vencidos: {licenseAlertsList.filter(i => i.status === 'vencido').length}</span>
                          <span className="text-orange-600 dark:text-orange-400 font-bold">● Críticos: {licenseAlertsList.filter(i => i.status === 'critico').length}</span>
                          <span className="text-amber-600 dark:text-amber-400 font-bold">● Atenção: {licenseAlertsList.filter(i => i.status === 'atencao').length}</span>
                          <span className="text-emerald-600 dark:text-emerald-400 font-bold">● Regular: {licenseAlertsList.filter(i => i.status === 'ok').length}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : activeTab === "financeiro_licencas" && finLicencasSubTab === "prazos_modelos" ? (
                  <div className="space-y-6">
                    {/* Page Header Banner */}
                    <div className="glass-card p-6 md:p-8 rounded-3xl border border-blue-200/80 dark:border-blue-900/60 bg-gradient-to-r from-slate-900 via-blue-950 to-indigo-950 text-white shadow-xl relative overflow-hidden">
                      <div className="absolute right-0 top-0 bottom-0 w-1/3 bg-gradient-to-l from-cyan-500/10 to-transparent pointer-events-none"></div>
                      <div className="relative z-10 space-y-4">
                        <div className="flex flex-wrap items-center justify-between gap-4">
                          <div className="flex items-center gap-3">
                            <div className="p-3.5 bg-cyan-400/20 text-cyan-300 rounded-2xl border border-cyan-400/30 backdrop-blur-md">
                              <Clock size={28} />
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <h2 className="text-2xl font-display font-black text-white tracking-tight">Catálogo Oficial de Validades e Licenças</h2>
                                <span className="px-2.5 py-0.5 bg-cyan-400 text-slate-950 font-black text-[10px] rounded-full uppercase tracking-wider">
                                  Modelos de Validade
                                </span>
                              </div>
                              <p className="text-xs text-slate-300 font-medium mt-0.5">
                                Regras regulamentares, prazos legais de vigência e requisitos oficiais para cada licença da frota
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => setFinLicencasSubTab('painel')}
                              className="flex items-center gap-2 px-4 py-2.5 rounded-2xl text-xs font-black uppercase tracking-wider bg-white/10 hover:bg-white/20 text-white border border-white/20 transition-all shadow-sm"
                            >
                              <DollarSign size={15} />
                              <span>Ir para Custos & Painel</span>
                            </button>
                          </div>
                        </div>

                        {/* Quick KPI stats bar inside banner */}
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-2">
                          <div className="p-3 bg-white/5 backdrop-blur-md rounded-2xl border border-white/10 flex items-center justify-between">
                            <span className="text-[11px] font-bold text-slate-300">Total de Modelos:</span>
                            <span className="text-lg font-black text-cyan-300">{LICENSE_MODELS_CATALOG.length}</span>
                          </div>
                          <div className="p-3 bg-white/5 backdrop-blur-md rounded-2xl border border-white/10 flex items-center justify-between">
                            <span className="text-[11px] font-bold text-slate-300">Vigência Anual (1 Ano):</span>
                            <span className="text-lg font-black text-emerald-400">
                              {LICENSE_MODELS_CATALOG.filter(m => m.validity === '01 ANO' || m.validity === '1 ANO').length}
                            </span>
                          </div>
                          <div className="p-3 bg-white/5 backdrop-blur-md rounded-2xl border border-white/10 flex items-center justify-between">
                            <span className="text-[11px] font-bold text-slate-300">Vigência 2 Anos:</span>
                            <span className="text-lg font-black text-purple-300">
                              {LICENSE_MODELS_CATALOG.filter(m => m.validity === '02 ANOS' || m.validity.includes('2')).length}
                            </span>
                          </div>
                          <div className="p-3 bg-white/5 backdrop-blur-md rounded-2xl border border-white/10 flex items-center justify-between">
                            <span className="text-[11px] font-bold text-slate-300">Vigência Semestral:</span>
                            <span className="text-lg font-black text-amber-300">
                              {LICENSE_MODELS_CATALOG.filter(m => m.validity.includes('6')).length}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Catalog Grid */}
                    {filteredLicenseModels.length > 0 ? (
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {filteredLicenseModels.map((model) => (
                          <div
                            key={model.id}
                            className="glass-card p-6 rounded-3xl border border-slate-200/90 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 shadow-sm hover:shadow-md transition-all flex flex-col justify-between group"
                          >
                            <div className="space-y-4">
                              {/* Card Header: Type & Validity Badge */}
                              <div className="flex items-start justify-between gap-3">
                                <div className="space-y-1">
                                  <span className="inline-block text-[9px] font-black uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                                    {model.categoryLabel || model.category.toUpperCase()}
                                  </span>
                                  <h3 className="font-display font-black text-lg text-slate-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-cyan-300 transition-colors">
                                    {model.title}
                                  </h3>
                                </div>

                                <div className="text-right shrink-0">
                                  <span className="inline-flex items-center gap-1 text-xs font-black uppercase tracking-wider px-3 py-1.5 rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-md shadow-blue-500/20">
                                    <Clock size={13} />
                                    {model.validity}
                                  </span>
                                </div>
                              </div>

                              {/* Description */}
                              <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                                {model.description}
                              </p>

                              {/* Metadata Badges */}
                              <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-100 dark:border-slate-800 text-[11px]">
                                <div className="p-2.5 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-100 dark:border-slate-700/60">
                                  <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block">Órgão Emissor</span>
                                  <span className="font-bold text-slate-800 dark:text-slate-200">{model.issuingBody}</span>
                                </div>
                                <div className="p-2.5 bg-amber-50/70 dark:bg-amber-950/40 rounded-xl border border-amber-200/60 dark:border-amber-900/40">
                                  <span className="text-[9px] font-black text-amber-600 dark:text-amber-400 uppercase tracking-widest block">Frequência</span>
                                  <span className="font-bold text-amber-800 dark:text-amber-200">{model.frequency}</span>
                                </div>
                              </div>

                              {/* Requirements Checklist */}
                              {model.requirements && (
                                <div className="space-y-1.5 pt-1">
                                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider block">Requisitos Legais & Documentais</span>
                                  <div className="flex items-start gap-2 text-[11px] text-slate-600 dark:text-slate-300 font-medium">
                                    <CheckCircle2 size={13} className="text-emerald-500 shrink-0 mt-0.5" />
                                    <span>{model.requirements}</span>
                                  </div>
                                </div>
                              )}
                            </div>

                            {/* Footer Action */}
                            <div className="mt-5 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs">
                              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                                Modelo Oficial Regulamentar
                              </span>
                              <button
                                type="button"
                                onClick={() => {
                                  setFinLicencasSubTab('painel');
                                  setSelectedStatus([]);
                                  setSearchTerm(model.title);
                                }}
                                className="flex items-center gap-1.5 font-black text-blue-600 dark:text-cyan-400 hover:underline"
                              >
                                <span>Ver Veículos</span>
                                <ChevronRight size={14} />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="glass-card p-12 rounded-3xl text-center border border-slate-200 dark:border-slate-800">
                        <Clock className="mx-auto text-slate-300 dark:text-slate-600 mb-3" size={40} />
                        <h3 className="font-bold text-slate-800 dark:text-slate-200 text-lg">Nenhum modelo de licença encontrado</h3>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-md mx-auto">
                          Nenhum modelo corresponde aos critérios de pesquisa ou categoria selecionada. Tente limpar os filtros.
                        </p>
                        <button
                          onClick={() => { setModelosSearch(''); setModelosCategory('todos'); }}
                          className="mt-4 px-4 py-2 bg-blue-600 text-white text-xs font-bold rounded-xl shadow-sm hover:bg-blue-700 transition-all"
                        >
                          Limpar Filtros de Busca
                        </button>
                      </div>
                    )}
                  </div>
                ) : (
                  <>
                {/* Executive KPIs Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                  {/* Total Card */}
                  <div className="glass-card neon-card-blue p-6 rounded-3xl relative overflow-hidden group transition-all border border-slate-200/90 dark:border-slate-800/90 bg-white/95 dark:bg-slate-900/95">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">Comprometimento Total</span>
                      <div className="p-2.5 bg-blue-100 dark:bg-blue-950/80 text-blue-600 dark:text-cyan-400 rounded-2xl group-hover:scale-110 transition-transform">
                        <Receipt size={20} />
                      </div>
                    </div>
                    <div className="font-display font-black text-2xl text-slate-900 dark:text-white">
                      {formatCurrencyBR(financialStats.totalVal)}
                    </div>
                    <div className="flex items-center gap-2 mt-2 text-xs font-semibold text-slate-500 dark:text-slate-300">
                      <span>{financialStats.totalCount} documentos processados</span>
                    </div>
                    <div className="absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r from-blue-600 to-cyan-400"></div>
                  </div>

                  {/* Quitados Card */}
                  <div className="glass-card neon-card-emerald p-6 rounded-3xl relative overflow-hidden group transition-all border border-emerald-200/80 dark:border-emerald-800/80 bg-white/95 dark:bg-slate-900/95">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-[10px] font-black uppercase tracking-widest text-emerald-700 dark:text-emerald-300">Quitados (Pagos)</span>
                      <div className="p-2.5 bg-emerald-100 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-300 rounded-2xl group-hover:scale-110 transition-transform">
                        <CheckCircle2 size={20} />
                      </div>
                    </div>
                    <div className="font-display font-black text-2xl text-emerald-800 dark:text-emerald-300">
                      {formatCurrencyBR(financialStats.paidVal)}
                    </div>
                    <div className="flex items-center gap-2 mt-2 text-xs font-bold text-emerald-700 dark:text-emerald-400">
                      <span>{financialStats.paidCount} documentos</span>
                      <span>•</span>
                      <span>{financialStats.totalVal ? ((financialStats.paidVal / financialStats.totalVal) * 100).toFixed(1) : 0}% do total</span>
                    </div>
                    <div className="absolute bottom-0 left-0 right-0 h-1 bg-emerald-500"></div>
                  </div>

                  {/* Em Aberto Card */}
                  <div className="glass-card neon-card-blue p-6 rounded-3xl relative overflow-hidden group transition-all border border-blue-200/80 dark:border-blue-800/80 bg-white/95 dark:bg-slate-900/95">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-[10px] font-black uppercase tracking-widest text-blue-700 dark:text-blue-300">Em Aberto (Ano)</span>
                      <div className="p-2.5 bg-blue-100 dark:bg-blue-950/80 text-blue-700 dark:text-blue-300 rounded-2xl group-hover:scale-110 transition-transform">
                        <Clock size={20} />
                      </div>
                    </div>
                    <div className="font-display font-black text-2xl text-blue-900 dark:text-blue-300">
                      {formatCurrencyBR(financialStats.openVal)}
                    </div>
                    <div className="flex items-center gap-2 mt-2 text-xs font-bold text-blue-700 dark:text-blue-400">
                      <span>{financialStats.openCount} documentos</span>
                      <span>•</span>
                      <span>{financialStats.totalVal ? ((financialStats.openVal / financialStats.totalVal) * 100).toFixed(1) : 0}% do total</span>
                    </div>
                    <div className="absolute bottom-0 left-0 right-0 h-1 bg-blue-500"></div>
                  </div>

                  {/* Vencidos Card */}
                  <div className="glass-card neon-card-rose p-6 rounded-3xl relative overflow-hidden group transition-all border border-rose-200/80 dark:border-rose-800/80 bg-white/95 dark:bg-slate-900/95">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-[10px] font-black uppercase tracking-widest text-rose-700 dark:text-rose-300">Vencidos (Atraso)</span>
                      <div className="p-2.5 bg-rose-100 dark:bg-rose-950/80 text-rose-700 dark:text-rose-300 rounded-2xl group-hover:scale-110 transition-transform">
                        <AlertTriangle size={20} />
                      </div>
                    </div>
                    <div className="font-display font-black text-2xl text-rose-800 dark:text-rose-300">
                      {formatCurrencyBR(financialStats.expiredVal)}
                    </div>
                    <div className="flex items-center gap-2 mt-2 text-xs font-bold text-rose-700 dark:text-rose-400">
                      <span>{financialStats.expiredCount} documentos</span>
                      <span>•</span>
                      <span>{financialStats.totalVal ? ((financialStats.expiredVal / financialStats.totalVal) * 100).toFixed(1) : 0}% do total</span>
                    </div>
                    <div className="absolute bottom-0 left-0 right-0 h-1 bg-rose-500"></div>
                  </div>
                </div>

                {/* Demonstrativo Consolidado por Mês/Ano (Tabela do Sistema) */}
                <div className="glass-card p-6 rounded-3xl space-y-4 border border-slate-200/80 bg-white/90 dark:bg-slate-900/90 shadow-sm overflow-hidden">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                      <div className="p-2.5 bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-cyan-300 rounded-2xl">
                        <BarChart3 size={20} />
                      </div>
                      <div>
                        <h3 className="font-display font-black text-lg text-slate-900 dark:text-white">
                          Demonstrativo Consolidado por Mês/Ano
                        </h3>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          Valores, quantidade de documentos e frotas/placas consolidados mensalmente
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowPlatesCol(!showPlatesCol)}
                      className={cn(
                        "flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-bold transition-all border shadow-2xs self-start sm:self-auto",
                        showPlatesCol
                          ? "bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800"
                          : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700"
                      )}
                    >
                      <Truck size={14} />
                      <span>{showPlatesCol ? "Qtd. Placas: EXIBIR" : "Qtd. Placas: OCULTAR"}</span>
                    </button>
                  </div>

                  <div className="overflow-x-auto rounded-2xl border border-slate-200/80 dark:border-slate-800">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-[#1E40AF] text-white text-[11px] font-black uppercase tracking-wider select-none">
                          <th className="py-3 px-4 text-center">Mês/Ano</th>
                          <th className="py-3 px-4 text-center">Qtd. Documentos</th>
                          {showPlatesCol && <th className="py-3 px-4 text-center">Qtd. Placas/Frotas</th>}
                          <th className="py-3 px-4 text-right">Valor Total (R$)</th>
                          <th className="py-3 px-4 text-right">Pago (R$)</th>
                          <th className="py-3 px-4 text-right">Em Aberto (R$)</th>
                          <th className="py-3 px-4 text-right">Vencido (R$)</th>
                          <th className="py-3 px-4 text-center">% Comprometido</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200 dark:divide-slate-800 text-xs">
                        {financialStats.monthlyByMonthYear.length > 0 ? (
                          financialStats.monthlyByMonthYear.map((item) => (
                            <tr key={item.key} className="hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors font-medium">
                              <td className="py-3 px-4 font-bold text-center text-slate-800 dark:text-slate-200 uppercase">{item.label}</td>
                              <td className="py-3 px-4 text-center font-bold text-slate-700 dark:text-slate-300">{item.titlesCount} doc(s)</td>
                              {showPlatesCol && (
                                <td className="py-3 px-4 text-center text-slate-600 dark:text-slate-400 font-medium">{item.platesCount} placas</td>
                              )}
                              <td className="py-3 px-4 text-right font-mono font-bold text-slate-900 dark:text-white">{formatCurrencyBR(item.totalValue)}</td>
                              <td className="py-3 px-4 text-right font-mono font-bold text-emerald-600 dark:text-emerald-400">{formatCurrencyBR(item.paidValue)}</td>
                              <td className="py-3 px-4 text-right font-mono font-bold text-blue-600 dark:text-cyan-400">{formatCurrencyBR(item.openValue)}</td>
                              <td className="py-3 px-4 text-right font-mono font-bold text-rose-600 dark:text-rose-400">{formatCurrencyBR(item.expiredValue)}</td>
                              <td className="py-3 px-4 text-center font-semibold text-slate-600 dark:text-slate-400">
                                {financialStats.totalVal ? ((item.totalValue / financialStats.totalVal) * 100).toFixed(1) : 0}%
                              </td>
                            </tr>
                          ))
                        ) : (
                          <tr>
                            <td colSpan={showPlatesCol ? 8 : 7} className="py-8 text-center text-slate-400">
                              Nenhum dado consolidado disponível.
                            </td>
                          </tr>
                        )}
                      </tbody>
                      <tfoot>
                        <tr className="bg-slate-100 dark:bg-slate-800/90 font-black text-xs text-slate-900 dark:text-white border-t-2 border-slate-300 dark:border-slate-700">
                          <td className="py-3.5 px-4 text-center uppercase">TOTAL CONSOLIDADO</td>
                          <td className="py-3.5 px-4 text-center">{financialStats.totalCount || filteredFleet.length} doc(s)</td>
                          {showPlatesCol && (
                            <td className="py-3.5 px-4 text-center">
                              {new Set(filteredFleet.map(v => (v.plate && v.plate.trim() !== "" && v.plate !== "Vázio") ? v.plate.trim() : (v.fleet ? `Frota ${v.fleet}` : `ID-${v.id}`))).size} placas
                            </td>
                          )}
                          <td className="py-3.5 px-4 text-right font-mono">{formatCurrencyBR(financialStats.totalVal)}</td>
                          <td className="py-3.5 px-4 text-right font-mono text-emerald-600 dark:text-emerald-400">{formatCurrencyBR(financialStats.paidVal)}</td>
                          <td className="py-3.5 px-4 text-right font-mono text-blue-600 dark:text-cyan-400">{formatCurrencyBR(financialStats.openVal)}</td>
                          <td className="py-3.5 px-4 text-right font-mono text-rose-600 dark:text-rose-400">{formatCurrencyBR(financialStats.expiredVal)}</td>
                          <td className="py-3.5 px-4 text-center">100.0%</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>

                {/* Monthly Charts Section: Valor Total por Mês e Frotas por Mês */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Valor Total por Mês Card */}
                  <div className="glass-card p-6 rounded-3xl space-y-4 border border-slate-200/80 bg-white/90 dark:bg-slate-900/90 shadow-sm">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <div className="p-2.5 bg-purple-100 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 rounded-2xl">
                          <TrendingUp size={20} />
                        </div>
                        <div>
                          <h3 className="font-display font-black text-lg text-slate-900 dark:text-white">Valor Total por Mês</h3>
                          <p className="text-xs text-slate-500 dark:text-slate-400">Evolução mensal do montante total de documentos e licenças (R$)</p>
                        </div>
                      </div>
                      <span className="text-xs font-bold px-3 py-1 bg-purple-50 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 rounded-full border border-purple-200/60 dark:border-purple-800/60">
                        {financialStats.monthlyByMonthYear.length} meses
                      </span>
                    </div>

                    <div className="space-y-3 pt-2 max-h-[380px] overflow-y-auto pr-1 scrollbar-thin">
                      {financialStats.monthlyByMonthYear.length === 0 ? (
                        <div className="text-center py-8 text-xs text-slate-400">Nenhum dado mensal disponível para os filtros selecionados.</div>
                      ) : (
                        financialStats.monthlyByMonthYear.map((item) => {
                          const pct = Math.max((item.totalValue / financialStats.maxMonthlyValue) * 100, 3);
                          return (
                            <div key={item.key} className="space-y-1.5 group">
                              <div className="flex items-center justify-between text-xs">
                                <span className="font-bold text-slate-700 dark:text-slate-300 uppercase">{item.label}</span>
                                <span className="font-black text-slate-900 dark:text-white bg-slate-100 dark:bg-slate-800 px-2.5 py-0.5 rounded-lg border border-slate-200/60 dark:border-slate-700">
                                  {formatCurrencyBR(item.totalValue)}
                                </span>
                              </div>
                              <div className="w-full h-3 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden p-0.5 border border-slate-200/50 dark:border-slate-700/50">
                                <div 
                                  className="h-full bg-gradient-to-r from-purple-500 to-indigo-600 rounded-full transition-all duration-500 group-hover:brightness-110" 
                                  style={{ width: `${pct}%` }}
                                ></div>
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>

                  {/* Total Documentos por Mês/Ano Card */}
                  <div className="glass-card p-6 rounded-3xl space-y-4 border border-slate-200/80 bg-white/90 dark:bg-slate-900/90 shadow-sm">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <div className="p-2.5 bg-indigo-100 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 rounded-2xl">
                          <FileText size={20} />
                        </div>
                        <div>
                          <h3 className="font-display font-black text-lg text-slate-900 dark:text-white">Total Documentos por Mês/Ano</h3>
                          <p className="text-xs text-slate-500 dark:text-slate-400">Quantidade de documentos com lançamentos a cada mês</p>
                        </div>
                      </div>
                      <span className="text-xs font-bold px-3 py-1 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 rounded-full border border-indigo-200/60 dark:border-indigo-800/60">
                        {financialStats.monthlyByMonthYear.length} meses
                      </span>
                    </div>

                    <div className="space-y-3 pt-2 max-h-[380px] overflow-y-auto pr-1 scrollbar-thin">
                      {financialStats.monthlyByMonthYear.length === 0 ? (
                        <div className="text-center py-8 text-xs text-slate-400">Nenhum dado de documentos mensal disponível para os filtros selecionados.</div>
                      ) : (
                        financialStats.monthlyByMonthYear.map((item) => {
                          const pct = Math.max((item.titlesCount / financialStats.maxMonthlyTitles) * 100, 3);
                          return (
                            <div key={item.key} className="space-y-1.5 group">
                              <div className="flex items-center justify-between text-xs">
                                <span className="font-bold text-slate-700 dark:text-slate-300 uppercase">{item.label}</span>
                                <span className="font-black text-purple-900 dark:text-purple-300 bg-purple-50 dark:bg-purple-950/50 px-2.5 py-0.5 rounded-lg border border-purple-200/60 dark:border-purple-800/60">
                                  {item.titlesCount} {item.titlesCount === 1 ? 'documento' : 'documentos'}
                                </span>
                              </div>
                              <div className="w-full h-3 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden p-0.5 border border-slate-200/50 dark:border-slate-700/50">
                                <div 
                                  className="h-full bg-gradient-to-r from-indigo-500 to-purple-600 rounded-full transition-all duration-500 group-hover:brightness-110" 
                                  style={{ width: `${pct}%` }}
                                ></div>
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                </div>

                {/* Resumo por Documento Cards Grid */}
                <div className="space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <div className="p-2 bg-indigo-100 text-indigo-700 rounded-xl">
                        <FileText size={20} />
                      </div>
                      <div>
                        <h3 className="font-display font-black text-xl text-slate-900 dark:text-white">Resumo Financeiro por Documento</h3>
                        <p className="text-xs text-slate-500 dark:text-slate-300">Valores, quitados, em aberto e vencidos por tipo de documento e licenciamento (clique no card para filtrar)</p>
                      </div>
                    </div>
                    <span className="text-xs font-bold text-slate-600 dark:text-slate-200 bg-white dark:bg-slate-800 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm self-start sm:self-auto">
                      {financialStats.byDocument.length} tipos de documentos
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                    {financialStats.byDocument.map((docItem) => {
                      const isSelected = selectedDescDoc.includes(docItem.docName);
                      const pctTotal = financialStats.totalVal ? ((docItem.total / financialStats.totalVal) * 100).toFixed(1) : '0';
                      const pctPago = docItem.total ? ((docItem.pago / docItem.total) * 100) : 0;
                      const pctEmAberto = docItem.total ? ((docItem.emAberto / docItem.total) * 100) : 0;
                      const pctVencido = docItem.total ? ((docItem.vencido / docItem.total) * 100) : 0;

                      return (
                        <div 
                          key={docItem.docName} 
                          onClick={() => {
                            if (isSelected) {
                              setSelectedDescDoc(selectedDescDoc.filter(d => d !== docItem.docName));
                            } else {
                              setSelectedDescDoc([...selectedDescDoc, docItem.docName]);
                            }
                            setTimeout(() => {
                              document.getElementById('detalhamento-financeiro-container')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                            }, 80);
                          }}
                          className={cn(
                            "glass-card neon-card-3d p-5 rounded-3xl flex flex-col justify-between space-y-4 cursor-pointer transition-all border group relative overflow-hidden",
                            isSelected 
                              ? "ring-2 ring-blue-600 dark:ring-cyan-400 border-blue-500 dark:border-cyan-400 bg-blue-50/40 dark:bg-blue-950/60 shadow-[0_12px_30px_rgba(37,99,235,0.25)] dark:shadow-[0_12px_30px_rgba(6,182,212,0.35)] scale-[1.01]" 
                              : "border-slate-200/90 dark:border-slate-800/90 bg-white/95 dark:bg-slate-900/95"
                          )}
                        >
                          <div>
                            <div className="flex items-start justify-between gap-2 mb-1">
                              <span className="font-display font-black text-xs text-slate-900 dark:text-white uppercase tracking-tight group-hover:text-blue-700 dark:group-hover:text-cyan-300 transition-colors" title={docItem.docName}>
                                {docItem.docName.replace(/SERVIÇO DE MONITORAMENTO/gi, "SERV. MONITORAMENTO").replace(/SERVICO DE MONITORAMENTO/gi, "SERV. MONITORAMENTO")}
                              </span>
                              <span className="shrink-0 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-[10px] font-black px-2.5 py-0.5 rounded-full uppercase tracking-wider border border-slate-200 dark:border-slate-700">
                                {pctTotal}%
                              </span>
                            </div>

                            {(() => {
                              const docValidityMatch = visibleDocumentTypes.find(t => t.type.toLowerCase().trim() === docItem.docName.toLowerCase().trim() || docItem.docName.toLowerCase().includes(t.type.toLowerCase()))?.validity;
                              if (!docValidityMatch) return null;
                              return (
                                <div className="mb-2">
                                  <span className="inline-flex items-center gap-1 bg-blue-50 dark:bg-blue-950/80 text-blue-700 dark:text-cyan-300 border border-blue-200/80 dark:border-blue-800/80 text-[10px] font-bold px-2 py-0.5 rounded-md uppercase tracking-wider shadow-2xs">
                                    <Clock size={11} /> Validade: {docValidityMatch}
                                  </span>
                                </div>
                              );
                            })()}

                            <div className="font-display font-black text-2xl text-slate-900 dark:text-white mb-1">
                              {formatCurrencyBR(docItem.total)}
                            </div>
                            <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-300 flex items-center justify-between">
                              <span>{docItem.count} {docItem.count === 1 ? 'documento' : 'documentos'}</span>
                              {isSelected && (
                                <span className="text-blue-600 dark:text-cyan-400 font-bold flex items-center gap-1">
                                  <CheckCircle2 size={12} /> Filtrado
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Progress Bar & Status Cards */}
                          <div className="space-y-2">
                            <div className="w-full bg-slate-100 dark:bg-slate-800 h-2.5 rounded-full overflow-hidden flex shadow-inner">
                              <div style={{ width: `${pctPago}%` }} className="bg-emerald-500 h-full" title={`Pago: ${pctPago.toFixed(0)}%`}></div>
                              <div style={{ width: `${pctEmAberto}%` }} className="bg-blue-500 dark:bg-cyan-500 h-full" title={`Em Aberto: ${pctEmAberto.toFixed(0)}%`}></div>
                              <div style={{ width: `${pctVencido}%` }} className="bg-rose-500 h-full" title={`Vencido: ${pctVencido.toFixed(0)}%`}></div>
                            </div>

                            <div className="grid grid-cols-3 gap-1.5 pt-1 text-center">
                              <div 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedDescDoc([docItem.docName]);
                                  setSelectedStatusDoc(['pagos']);
                                  setTimeout(() => {
                                    document.getElementById('detalhamento-financeiro-container')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                                  }, 80);
                                }}
                                className="p-2 bg-emerald-50/90 dark:bg-emerald-950/70 rounded-xl border border-emerald-200/80 dark:border-emerald-800/80 shadow-[0_2px_8px_rgba(16,185,129,0.12)] hover:scale-105 transition-transform"
                              >
                                <div className="text-[9px] font-black text-emerald-800 dark:text-emerald-300 uppercase">Pago</div>
                                <div className="text-[11px] font-black text-emerald-950 dark:text-emerald-100 leading-tight mt-0.5">{formatCurrencyBR(docItem.pago)}</div>
                                <div className="text-[9px] font-bold text-emerald-700 dark:text-emerald-400 mt-0.5">{docItem.paidCount} doc(s)</div>
                              </div>

                              <div 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedDescDoc([docItem.docName]);
                                  setSelectedStatusDoc(['em_aberto']);
                                  setTimeout(() => {
                                    document.getElementById('detalhamento-financeiro-container')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                                  }, 80);
                                }}
                                className="p-2 bg-blue-50/90 dark:bg-blue-950/70 rounded-xl border border-blue-200/80 dark:border-blue-800/80 shadow-[0_2px_8px_rgba(37,99,235,0.12)] hover:scale-105 transition-transform"
                              >
                                <div className="text-[9px] font-black text-blue-800 dark:text-blue-300 uppercase">Em Aberto</div>
                                <div className="text-[11px] font-black text-blue-950 dark:text-blue-100 leading-tight mt-0.5">{formatCurrencyBR(docItem.emAberto)}</div>
                                <div className="text-[9px] font-bold text-blue-700 dark:text-blue-400 mt-0.5">{docItem.openCount} doc(s)</div>
                              </div>

                              <div 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedDescDoc([docItem.docName]);
                                  setSelectedStatusDoc(['vencido']);
                                  setTimeout(() => {
                                    document.getElementById('detalhamento-financeiro-container')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                                  }, 80);
                                }}
                                className={cn("p-2 rounded-xl border transition-all shadow-sm hover:scale-105", docItem.vencido > 0 ? "bg-rose-50/90 dark:bg-rose-950/70 border-rose-200/80 dark:border-rose-800/80 shadow-[0_2px_8px_rgba(244,63,94,0.15)]" : "bg-slate-50 dark:bg-slate-800/60 border-slate-200/80 dark:border-slate-800")}
                              >
                                <div className={cn("text-[9px] font-black uppercase", docItem.vencido > 0 ? "text-rose-800 dark:text-rose-300" : "text-slate-500 dark:text-slate-400")}>Vencido</div>
                                <div className={cn("text-[11px] font-black leading-tight mt-0.5", docItem.vencido > 0 ? "text-rose-950 dark:text-rose-100" : "text-slate-700 dark:text-slate-200")}>{formatCurrencyBR(docItem.vencido)}</div>
                                <div className={cn("text-[9px] font-bold mt-0.5", docItem.vencido > 0 ? "text-rose-700 dark:text-rose-400" : "text-slate-500 dark:text-slate-400")}>{docItem.expiredCount} doc(s)</div>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Charts Dashboard Row */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                  {/* Monthly Financial Trend Chart */}
                  <div className="lg:col-span-8 glass-card p-6 rounded-3xl flex flex-col h-[460px] border border-slate-200/80 dark:border-slate-800">
                    <div className="flex flex-wrap items-center justify-between gap-2 mb-4 shrink-0">
                      <div>
                        <h3 className="font-display font-black text-lg text-slate-900 dark:text-white flex items-center gap-2">
                          <TrendingUp size={20} className="text-blue-600 dark:text-cyan-400" />
                          Cronograma Financeiro Mensal (Vencimentos)
                        </h3>
                        <p className="text-xs text-slate-500 dark:text-slate-300 font-medium">Fluxo dinâmico de pagamentos, em aberto, vencidos e linha de tendência acumulada</p>
                      </div>
                      <div className="flex items-center gap-3 text-[10px] font-black uppercase tracking-wider bg-slate-50 dark:bg-slate-800 p-2 rounded-2xl border border-slate-100 dark:border-slate-700 text-slate-700 dark:text-slate-200">
                        <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-md bg-emerald-500 shadow-sm shadow-emerald-500/50"></div> Pago</div>
                        <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-md bg-blue-500 dark:bg-cyan-500 shadow-sm shadow-blue-500/50"></div> Em Aberto</div>
                        <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-md bg-rose-500 shadow-sm shadow-rose-500/50"></div> Vencido</div>
                        <div className="flex items-center gap-1.5"><div className="w-3 h-1 rounded-full bg-purple-600 dark:bg-purple-400"></div> Tendência Total</div>
                      </div>
                    </div>

                    <div className="flex-1 min-h-0">
                      <ResponsiveContainer width="100%" height="100%">
                        <ComposedChart data={financialStats.monthlyData} margin={{ top: 25, right: 15, left: 15, bottom: 25 }}>
                          <defs>
                            <linearGradient id="pagoGrad" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor="#10b981" stopOpacity={0.95} />
                              <stop offset="100%" stopColor="#059669" stopOpacity={0.8} />
                            </linearGradient>
                            <linearGradient id="emAbertoGrad" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.95} />
                              <stop offset="100%" stopColor="#1d4ed8" stopOpacity={0.8} />
                            </linearGradient>
                            <linearGradient id="vencidoGrad" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor="#f43f5e" stopOpacity={0.95} />
                              <stop offset="100%" stopColor="#be123c" stopOpacity={0.8} />
                            </linearGradient>
                            <linearGradient id="totalLineGrad" x1="0" y1="0" x2="1" y2="0">
                              <stop offset="0%" stopColor="#a855f7" />
                              <stop offset="100%" stopColor="#ec4899" />
                            </linearGradient>
                            <linearGradient id="totalAreaGrad" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor="#8b5cf6" stopOpacity={0.25} />
                              <stop offset="100%" stopColor="#8b5cf6" stopOpacity={0.0} />
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="4 4" vertical={false} stroke={theme === 'dark' ? '#334155' : '#e2e8f0'} opacity={0.6} />
                          <XAxis 
                            dataKey="month" 
                            axisLine={{ stroke: theme === 'dark' ? '#475569' : '#cbd5e1' }} 
                            tickLine={false} 
                            tick={{ fontSize: 11, fill: theme === 'dark' ? '#cbd5e1' : '#334155', fontWeight: 800 }} 
                          />
                          <YAxis 
                            axisLine={false} 
                            tickLine={false} 
                            tick={{ fontSize: 10, fill: theme === 'dark' ? '#94a3b8' : '#64748b', fontWeight: 700 }} 
                            tickFormatter={(v) => v >= 1000 ? `R$ ${(v / 1000).toFixed(0)}k` : `R$ ${v}`}
                          />
                          <Tooltip 
                            cursor={{ fill: theme === 'dark' ? 'rgba(51, 65, 85, 0.4)' : '#f1f5f9', opacity: 0.5 }}
                            content={({ active, payload, label }) => {
                              if (active && payload && payload.length) {
                                const data = payload[0].payload;
                                return (
                                  <div className="bg-white/95 dark:bg-slate-900/95 backdrop-blur-md p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xl text-xs space-y-2 min-w-[180px]">
                                    <div className="font-black text-slate-800 dark:text-white border-b border-slate-100 dark:border-slate-800 pb-1 flex justify-between items-center">
                                      <span>Mês: {label}</span>
                                      <span className="text-[10px] font-bold text-purple-600 dark:text-purple-300 bg-purple-50 dark:bg-purple-950/80 px-2 py-0.5 rounded-full border border-purple-200 dark:border-purple-800">
                                        Total: {formatCurrencyBR(data.Total || 0)}
                                      </span>
                                    </div>
                                    <div className="space-y-1">
                                      <div className="flex justify-between items-center text-emerald-700 dark:text-emerald-300 font-bold">
                                        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-emerald-500"></span> Pago:</span>
                                        <span>{formatCurrencyBR(data.Pago || 0)}</span>
                                      </div>
                                      <div className="flex justify-between items-center text-blue-700 dark:text-blue-300 font-bold">
                                        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-blue-500"></span> Em Aberto:</span>
                                        <span>{formatCurrencyBR(data["Em Aberto"] || 0)}</span>
                                      </div>
                                      <div className="flex justify-between items-center text-rose-700 dark:text-rose-300 font-bold">
                                        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-rose-500"></span> Vencido:</span>
                                        <span>{formatCurrencyBR(data.Vencido || 0)}</span>
                                      </div>
                                    </div>
                                  </div>
                                );
                              }
                              return null;
                            }}
                          />
                          <Bar dataKey="Pago" name="Pago" fill="url(#pagoGrad)" radius={[4, 4, 0, 0]} stackId="a" />
                          <Bar dataKey="Em Aberto" name="Em Aberto" fill="url(#emAbertoGrad)" radius={[4, 4, 0, 0]} stackId="a" />
                          <Bar dataKey="Vencido" name="Vencido" fill="url(#vencidoGrad)" radius={[4, 4, 0, 0]} stackId="a" />
                          <Area type="monotone" dataKey="Total" fill="url(#totalAreaGrad)" stroke="none" />
                          <Line 
                            type="monotone" 
                            dataKey="Total" 
                            name="Total" 
                            stroke="url(#totalLineGrad)" 
                            strokeWidth={3} 
                            dot={{ r: 4, fill: '#8b5cf6', stroke: '#ffffff', strokeWidth: 2 }} 
                            activeDot={{ r: 6, fill: '#7c3aed', stroke: '#ffffff', strokeWidth: 2 }} 
                          >
                            <LabelList 
                              dataKey="Total" 
                              position="top" 
                              formatter={(v: any) => Number(v) > 0 ? `R$ ${(Number(v)/1000).toFixed(0)}k` : ''} 
                              style={{ fontSize: '9px', fontWeight: '800', fill: theme === 'dark' ? '#c084fc' : '#6b21a8' }} 
                            />
                          </Line>
                        </ComposedChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  {/* Financial Distribution & Top Frotas */}
                  <div className="lg:col-span-4 glass-card p-6 rounded-3xl flex flex-col h-[460px] justify-between border border-slate-200/80 dark:border-slate-800">
                    <div>
                      <h3 className="font-display font-bold text-lg text-slate-900 dark:text-white mb-1 flex items-center gap-2">
                        <Building2 size={18} className="text-blue-600 dark:text-cyan-400" />
                        Top Frotas Por Comprometimento
                      </h3>
                      <p className="text-xs text-slate-500 dark:text-slate-300 mb-4">Maiores frotas em volume financeiro de documentos</p>
                    </div>

                    <div className="space-y-3 overflow-y-auto pr-1 flex-1">
                      {financialStats.topFleets.length > 0 ? financialStats.topFleets.map((item, idx) => {
                        const pct = financialStats.totalVal ? (item.total / financialStats.totalVal) * 100 : 0;
                        return (
                          <div key={item.fleet} className="p-3 bg-slate-50/80 dark:bg-slate-800/80 rounded-2xl border border-slate-100 dark:border-slate-700 hover:border-slate-200 dark:hover:border-slate-600 transition-all">
                            <div className="flex items-center justify-between text-xs mb-1.5">
                              <span className="font-black text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
                                <span className="w-5 h-5 rounded-lg bg-blue-100 dark:bg-blue-950/80 text-blue-700 dark:text-blue-300 font-bold text-[10px] flex items-center justify-center">
                                  {idx + 1}
                                </span>
                                {item.fleet}
                              </span>
                              <span className="font-bold text-slate-900 dark:text-white">{formatCurrencyBR(item.total)}</span>
                            </div>
                            <div className="w-full bg-slate-200 dark:bg-slate-700 h-2 rounded-full overflow-hidden flex">
                              <div style={{ width: `${item.total ? (item.pago / item.total) * 100 : 0}%` }} className="bg-emerald-500 h-full" title="Pago"></div>
                              <div style={{ width: `${item.total ? (item.emAberto / item.total) * 100 : 0}%` }} className="bg-blue-500 dark:bg-cyan-500 h-full" title="Em Aberto"></div>
                              <div style={{ width: `${item.total ? (item.vencido / item.total) * 100 : 0}%` }} className="bg-rose-500 h-full" title="Vencido"></div>
                            </div>
                            <div className="flex justify-between items-center text-[9px] text-slate-400 dark:text-slate-300 mt-1 font-semibold">
                              <span>{pct.toFixed(1)}% do total</span>
                              <span className="text-emerald-600 dark:text-emerald-400">Pago: {formatCurrencyBR(item.pago)}</span>
                            </div>
                          </div>
                        );
                      }) : (
                        <div className="h-full flex items-center justify-center text-slate-400 dark:text-slate-300 text-xs">Sem dados de frotas</div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Table Mirror of Documentação Detalhada with Financial Highlights */}
                {activeTab === "financeiro_licencas" ? (
                  <div id="detalhamento-financeiro-container" className="glass-card rounded-3xl flex flex-col h-[650px] overflow-hidden relative border border-slate-200/80 dark:border-slate-800">
                    <div className="p-6 border-b border-slate-200/80 dark:border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4 shrink-0 bg-slate-50/50 dark:bg-slate-900/50">
                      <div>
                        <h2 className="text-xl font-display font-black text-slate-900 dark:text-white">Detalhamento Financeiro - Licenças</h2>
                        <p className="text-xs text-slate-500 dark:text-slate-300">Relação individualizada com validade de licenças e custos associados por veículo</p>
                      </div>

                      <div className="flex flex-wrap items-center gap-3">
                        <div className="flex items-center gap-2 bg-slate-100 dark:bg-slate-800/80 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 text-[10px] font-bold">
                          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500"></span> OK</span>
                          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-500"></span> 30 Dias</span>
                          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-orange-500"></span> 7 Dias</span>
                          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500"></span> Vencido</span>
                        </div>

                        <div className="relative">
                          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-300" size={14} />
                          <input 
                            type="text" 
                            placeholder="Buscar placa, motorista..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="pl-9 pr-3 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white rounded-xl text-xs outline-none focus:ring-2 focus:ring-blue-500/20"
                          />
                        </div>

                        <span className="text-xs font-bold text-slate-600 dark:text-slate-200 bg-white dark:bg-slate-800 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700">
                          Exibindo {filteredFleet.length} de {fleet.length} veículos
                        </span>
                      </div>
                    </div>

                    {/* Top Scrollbar Sync */}
                    <div 
                      className="overflow-x-auto border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 scrollbar-none"
                      onScroll={(e) => {
                        const bottomScroll = document.getElementById('fin-lic-table-container');
                        if (bottomScroll) bottomScroll.scrollLeft = e.currentTarget.scrollLeft;
                      }}
                    >
                      <div style={{ width: `${600 + interleavedDetailedColumns.length * 140}px`, height: '6px' }}></div>
                    </div>

                    <div 
                      id="fin-lic-table-container"
                      className="overflow-x-scroll overflow-y-auto flex-1 scrollbar-thin scrollbar-thumb-slate-200 dark:scrollbar-thumb-slate-800 scrollbar-track-transparent bg-white dark:bg-slate-900"
                      onScroll={(e) => {
                        const topScroll = e.currentTarget.previousElementSibling;
                        if (topScroll) topScroll.scrollLeft = e.currentTarget.scrollLeft;
                      }}
                    >
                      <table className="w-full text-left border-collapse" style={{ minWidth: `${600 + interleavedDetailedColumns.length * 140}px` }}>
                        <thead className="sticky top-0 z-30">
                          <tr className="bg-slate-100/90 dark:bg-slate-800/90 backdrop-blur text-slate-600 dark:text-slate-200 text-[10px] uppercase tracking-wider font-black">
                            <th className="px-6 py-4 border-b border-slate-200 dark:border-slate-700 sticky left-0 bg-slate-100 dark:bg-slate-800 z-40 text-slate-800 dark:text-white">Frota</th>
                            <th className="px-6 py-4 border-b border-slate-200 dark:border-slate-700 sticky left-[80px] bg-slate-100 dark:bg-slate-800 z-40 text-slate-800 dark:text-white">Placa</th>
                            <th className="px-6 py-4 border-b border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200">Operação</th>
                            <th className="px-6 py-4 border-b border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200">Motorista</th>
                            <th className="px-6 py-4 border-b border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200">Banheiro</th>
                            
                            {interleavedDetailedColumns.map((col, index) => {
                              if (col.type === "document") {
                                const valStr = getLegalValidityPeriod(col.name, col.validity, settings?.legalValidityMap);
                                return (
                                  <th key={`${col.name}-${index}`} className="px-4 py-3.5 border-b border-slate-200 dark:border-slate-700 text-center min-w-[140px] bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200">
                                    <div className="flex flex-col items-center justify-center gap-1">
                                      <span className="whitespace-nowrap font-black text-slate-900 dark:text-white text-[11px]">{col.name}</span>
                                      <span className="text-[9px] font-black text-blue-700 dark:text-cyan-300 bg-blue-100/90 dark:bg-blue-950/90 px-2 py-0.5 rounded-full border border-blue-200/80 dark:border-blue-800/80 shadow-2xs whitespace-nowrap">
                                        Validade: {valStr}
                                      </span>
                                    </div>
                                  </th>
                                );
                              } else {
                                return (
                                  <th key={`${col.name}-${index}`} className="px-4 py-4 border-b border-slate-200 dark:border-slate-700 text-center min-w-[130px] bg-slate-100 dark:bg-slate-800 text-emerald-800 dark:text-emerald-300 tracking-wide font-medium whitespace-nowrap">
                                    <span className="bg-emerald-50 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-300 px-2.5 py-1 rounded-lg border border-emerald-200 dark:border-emerald-800 shadow-sm block text-[10px] font-bold">
                                      {col.name}
                                    </span>
                                  </th>
                                );
                              }
                            })}
                            
                            <th className="px-6 py-4 border-b border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200">Cidade / Base</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                          {filteredFleet.map((v) => (
                            <tr key={v.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors group">
                              <td className="px-6 py-4 sticky left-0 bg-white dark:bg-slate-900 group-hover:bg-slate-50 dark:group-hover:bg-slate-800 z-20 border-r border-slate-100 dark:border-slate-800">
                                <span className="text-[11px] font-bold text-blue-600 dark:text-cyan-400">{v.fleet}</span>
                              </td>
                              <td className="px-6 py-4 sticky left-[80px] bg-white dark:bg-slate-900 group-hover:bg-slate-50 dark:group-hover:bg-slate-800 z-20 border-r border-slate-100 dark:border-slate-800">
                                <div className="flex items-center gap-2">
                                  {v.plate && (
                                    <div className={cn(
                                      "w-2 h-2 rounded-full shadow-sm",
                                      v.overallStatus === 'ok' || v.overallStatus === 'pagos' ? "bg-green-500 shadow-green-500/50" :
                                      v.overallStatus === 'atencao' ? "bg-amber-500 shadow-amber-500/50" :
                                      v.overallStatus === 'critico' ? "bg-orange-500 shadow-orange-500/50" : "bg-red-500 shadow-red-500/50"
                                    )}></div>
                                  )}
                                  <p className="font-bold text-sm tracking-wide text-slate-900 dark:text-white">{v.plate}</p>
                                </div>
                              </td>

                              <td className="px-6 py-4">
                                <span className="px-2 py-1 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 rounded text-[10px] font-bold uppercase whitespace-nowrap">
                                  {v.operation}
                                </span>
                              </td>
                              <td className="px-6 py-4 text-[11px] font-bold text-slate-700 dark:text-slate-200 whitespace-nowrap">{v.driver}</td>
                              <td className="px-6 py-4 text-[11px] font-bold text-slate-700 dark:text-slate-200 whitespace-nowrap">{v.hasBathroom || "-"}</td>
                              
                              {interleavedDetailedColumns.map((col, idx) => {
                                if (col.type === "document") {
                                  const doc = v.documents.find(d => d.type === col.name);
                                  return (
                                    <td key={`${col.name}-${idx}`} className="px-4 py-4 text-center">
                                      {doc ? (
                                        <div className="flex flex-col items-center gap-1">
                                          <span className={cn(
                                            "text-[10px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap border",
                                            doc.status === 'pagos' ? "bg-emerald-100 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800 font-bold" :
                                            doc.status === 'ok' ? "bg-green-100 dark:bg-green-950/80 text-green-700 dark:text-green-300 border-green-200 dark:border-green-800" :
                                            doc.status === 'atencao' ? "bg-amber-100 dark:bg-amber-950/80 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800" :
                                            doc.status === 'critico' ? "bg-orange-100 dark:bg-orange-950/80 text-orange-700 dark:text-orange-300 border-orange-200 dark:border-orange-800" : "bg-red-100 dark:bg-red-950/80 text-red-700 dark:text-red-300 border-red-200 dark:border-red-800"
                                          )}>
                                            {doc.expiryDate}
                                          </span>
                                          {doc.status !== 'ok' && doc.status !== 'pagos' && (
                                            <span className="text-[8px] uppercase font-bold text-slate-400 dark:text-slate-300">
                                              {doc.status === 'vencido' ? 'Vencido' : `${doc.daysRemaining}d`}
                                            </span>
                                          )}
                                        </div>
                                      ) : (
                                        <span className="text-slate-300 dark:text-slate-600 text-[10px]">-</span>
                                      )}
                                    </td>
                                  );
                                } else {
                                  const rawVal = v.extraData?.[col.name];
                                  let displayVal = "-";
                                  if (rawVal !== undefined && rawVal !== null && String(rawVal).trim() !== "" && String(rawVal).trim() !== "-") {
                                    const num = typeof rawVal === "number" ? rawVal : parseCurrencyVal(rawVal);
                                    if (num > 0 && typeof rawVal === "number") {
                                      displayVal = formatCurrencyBR(num);
                                    } else {
                                      displayVal = String(rawVal).trim();
                                    }
                                  }
                                  const hasValue = displayVal !== "-" && displayVal !== "0" && displayVal !== "R$ 0,00" && displayVal !== "";
                                  return (
                                    <td key={`${col.name}-${idx}`} className="px-4 py-4 text-center whitespace-nowrap">
                                      <span className={cn(
                                        "text-[11px] font-bold font-mono px-2.5 py-1 rounded-lg border inline-block tracking-tight transition-colors",
                                        hasValue
                                          ? "text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/80 border-emerald-200 dark:border-emerald-700/80 shadow-xs dark:shadow-[0_0_10px_rgba(16,185,129,0.15)]"
                                          : "text-slate-400 dark:text-slate-500 bg-slate-50/60 dark:bg-slate-800/40 border-slate-200/60 dark:border-slate-800"
                                      )}>
                                        {displayVal}
                                      </span>
                                    </td>
                                  );
                                }
                              })}
                              
                              <td className="px-6 py-4">
                                <div className="flex items-center gap-1 text-[11px] text-slate-600 dark:text-slate-300 font-medium whitespace-nowrap">
                                  <MapIcon size={12} className="text-slate-400 dark:text-slate-400" />
                                  {v.cityBase}
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {/* Summary Bar Footer */}
                    <div className="p-4 bg-slate-900 dark:bg-slate-950 text-white flex items-center justify-between px-8 text-xs font-bold shrink-0 border-t border-slate-800">
                      <div className="flex items-center gap-6">
                        <span>Total Exibido: {filteredFleet.length} veículos</span>
                      </div>
                      <div className="flex items-center gap-6">
                        <span>Total Financeiro Exibido: <span className="text-emerald-400 font-black text-sm ml-1">{formatCurrencyBR(financialStats.totalVal)}</span></span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div id="detalhamento-financeiro-container" className="glass-card rounded-3xl flex flex-col h-[650px] overflow-hidden relative border border-slate-200/80 dark:border-slate-800">
                    <div className="p-6 border-b border-slate-200/80 dark:border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4 shrink-0 bg-slate-50/50 dark:bg-slate-900/50">
                      <div>
                        <h2 className="text-xl font-display font-black text-slate-900 dark:text-white">Detalhamento Financeiro de Documentos</h2>
                        <p className="text-xs text-slate-500 dark:text-slate-300">Relação individualizada com valores, status de pagamento e parcelas</p>
                      </div>

                      <div className="flex items-center gap-3">
                        <div className="relative">
                          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-300" size={14} />
                          <input 
                            type="text" 
                            placeholder="Buscar..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="pl-9 pr-3 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white rounded-xl text-xs outline-none focus:ring-2 focus:ring-blue-500/20"
                          />
                        </div>
                        <span className="text-xs font-bold text-slate-600 dark:text-slate-200 bg-white dark:bg-slate-800 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700">
                          {filteredFleet.length} registros
                        </span>
                      </div>
                    </div>

                    {/* Top Scrollbar Sync */}
                    <div 
                      className="overflow-x-auto border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 scrollbar-none"
                      onScroll={(e) => {
                        const bottomScroll = document.getElementById('fin-table-container');
                        if (bottomScroll) bottomScroll.scrollLeft = e.currentTarget.scrollLeft;
                      }}
                    >
                      <div style={{ width: '1300px', height: '6px' }}></div>
                    </div>

                    <div 
                      id="fin-table-container"
                      className="overflow-x-scroll overflow-y-auto flex-1 scrollbar-thin scrollbar-thumb-slate-200 dark:scrollbar-thumb-slate-800 scrollbar-track-transparent bg-white dark:bg-slate-900"
                      onScroll={(e) => {
                        const topScroll = e.currentTarget.previousElementSibling;
                        if (topScroll) topScroll.scrollLeft = e.currentTarget.scrollLeft;
                      }}
                    >
                      <table className="w-full text-left border-collapse" style={{ minWidth: '1300px' }}>
                        <thead className="sticky top-0 z-30">
                          <tr className="bg-slate-100/90 dark:bg-slate-800/90 backdrop-blur text-slate-600 dark:text-slate-200 text-[10px] uppercase tracking-wider font-black">
                            <th className="px-4 py-3.5 border-b border-slate-200 dark:border-slate-700 sticky left-0 bg-slate-100 dark:bg-slate-800 z-40 text-slate-800 dark:text-white">Frota</th>
                            <th className="px-4 py-3.5 border-b border-slate-200 dark:border-slate-700 sticky left-[70px] bg-slate-100 dark:bg-slate-800 z-40 text-slate-800 dark:text-white">Placa</th>
                            <th className="px-4 py-3.5 border-b border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200">Pedido</th>
                            <th className="px-4 py-3.5 border-b border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200">Razão Social / Credor</th>
                            <th className="px-4 py-3.5 border-b border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200">Descrição Documento</th>
                            <th className="px-4 py-3.5 border-b border-slate-200 dark:border-slate-700 text-center text-slate-700 dark:text-slate-200">Parcela</th>
                            <th className="px-4 py-3.5 border-b border-slate-200 dark:border-slate-700 text-center text-slate-700 dark:text-slate-200">Vencimento</th>
                            <th className="px-4 py-3.5 border-b border-slate-200 dark:border-slate-700 text-center text-slate-700 dark:text-slate-200">Pagamento</th>
                            <th className="px-4 py-3.5 border-b border-slate-200 dark:border-slate-700 text-right text-slate-700 dark:text-slate-200">Valor (R$)</th>
                            <th className="px-4 py-3.5 border-b border-slate-200 dark:border-slate-700 text-center text-slate-700 dark:text-slate-200">Status Financeiro</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80 text-xs font-medium">
                          {filteredFleet.map((v) => {
                            const getVal = (col: string) => {
                              let val = v.extraData?.[col];
                              if (val === undefined || val === null || val === "") {
                                const normalizedCol = col.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
                                const foundKey = Object.keys(v.extraData || {}).find(k => 
                                  k.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim() === normalizedCol
                                );
                                if (foundKey) val = v.extraData[foundKey];
                              }
                              return val;
                            };

                            const frota = v.fleet || "-";
                            const placa = v.plate || "-";
                            const pedido = getVal("Pedido") || "-";
                            const razao = getVal("Razão Social") || "-";
                            const desc = getVal("Descrição") || "-";
                            const parcela = getVal("Parcela") || "-";
                            const venc = formatBRDate(getVal("Vencimento") || "-");
                            const pag = formatBRDate(getVal("Pagamento") || "-");
                            const rawVal = getVal("Valor");
                            const numVal = parseCurrencyVal(rawVal);

                            let statusBadge = (
                              <span className="px-2.5 py-1 rounded-full text-[10px] font-black bg-blue-100 dark:bg-blue-950/80 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 uppercase">
                                EM ABERTO
                              </span>
                            );

                            if (v.overallStatus === 'pagos') {
                              statusBadge = (
                                <span className="px-2.5 py-1 rounded-full text-[10px] font-black bg-emerald-100 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 uppercase">
                                  PAGO
                                </span>
                              );
                            } else if (v.overallStatus === 'vencido') {
                              statusBadge = (
                                <span className="px-2.5 py-1 rounded-full text-[10px] font-black bg-rose-100 dark:bg-rose-950/80 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800 uppercase">
                                  VENCIDO
                                </span>
                              );
                            }

                            return (
                              <tr key={v.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors group">
                                <td className="px-4 py-3 sticky left-0 bg-white dark:bg-slate-900 group-hover:bg-slate-50 dark:group-hover:bg-slate-800 z-20 border-r border-slate-100 dark:border-slate-800 font-bold text-blue-600 dark:text-cyan-400">
                                  {frota}
                                </td>
                                <td className="px-4 py-3 sticky left-[70px] bg-white dark:bg-slate-900 group-hover:bg-slate-50 dark:group-hover:bg-slate-800 z-20 border-r border-slate-100 dark:border-slate-800 font-bold text-slate-900 dark:text-white">
                                  {placa}
                                </td>
                                <td className="px-4 py-3 text-slate-600 dark:text-slate-300 font-mono text-[11px]">{pedido}</td>
                                <td className="px-4 py-3 text-slate-800 dark:text-slate-200 font-medium truncate max-w-[200px]" title={razao}>{razao}</td>
                                <td className="px-4 py-3 text-slate-800 dark:text-slate-100 font-bold">{desc}</td>
                                <td className="px-4 py-3 text-center text-slate-600 dark:text-slate-300">{parcela}</td>
                                <td className="px-4 py-3 text-center font-semibold text-slate-700 dark:text-slate-200">{venc}</td>
                                <td className="px-4 py-3 text-center font-semibold text-slate-700 dark:text-slate-200">{pag}</td>
                                <td className="px-4 py-3 text-right font-black text-slate-900 dark:text-white">
                                  {numVal > 0 ? formatCurrencyBR(numVal) : (rawVal || "-")}
                                </td>
                                <td className="px-4 py-3 text-center">
                                  {statusBadge}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>

                    {/* Summary Bar Footer */}
                    <div className="p-4 bg-slate-900 dark:bg-slate-950 text-white flex items-center justify-between px-8 text-xs font-bold shrink-0 border-t border-slate-800">
                      <div className="flex items-center gap-6">
                        <span>Total Exibido: {filteredFleet.length} documentos</span>
                      </div>
                      <div className="flex items-center gap-6">
                        <span>Total Financeiro Exibido: <span className="text-emerald-400 font-black text-sm ml-1">{formatCurrencyBR(financialStats.totalVal)}</span></span>
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}
              </motion.div>
            )}

            {activeTab === "settings" && fleet.length > 0 && (
              <motion.div 
                key="settings"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="max-w-5xl mx-auto space-y-8"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Configurações do Sistema</h1>
                    <p className="text-sm text-slate-500 dark:text-slate-400">Gerencie as preferências e parâmetros do LogiFleet</p>
                  </div>
                  <button className="px-6 py-2 bg-blue-600 text-white rounded-xl font-bold text-sm hover:bg-blue-700 transition-all shadow-md shadow-blue-100 dark:shadow-none">
                    Salvar Alterações
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
                  <div className="md:col-span-1 space-y-4">
                    <div className="bg-white dark:bg-slate-900 p-2 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
                      <nav className="space-y-1">
                        {[
                          { id: 'geral', label: 'Geral', icon: Settings },
                          { id: 'notificacoes', label: 'Notificações', icon: Bell },
                          { id: 'operacoes', label: 'Operações', icon: Truck },
                          { id: 'exportacao', label: 'Exportação', icon: FileText },
                          { id: 'seguranca', label: 'Segurança', icon: ShieldCheck },
                          { id: 'prazos_licencas', label: 'Prazos de Licenças', icon: Clock },
                        ].map((tab) => (
                          <button 
                            key={tab.id}
                            onClick={() => setActiveSettingsTab(tab.id)}
                            className={cn(
                              "w-full flex items-center gap-3 px-4 py-2.5 rounded-xl transition-all text-sm font-bold",
                              activeSettingsTab === tab.id 
                                ? "bg-blue-50 dark:bg-blue-950/80 text-blue-700 dark:text-cyan-300" 
                                : "text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/80 hover:text-slate-700 dark:hover:text-slate-200"
                            )}
                          >
                            <tab.icon size={18} />
                            {tab.label}
                          </button>
                        ))}
                      </nav>
                    </div>
                    <div className="bg-slate-900 dark:bg-slate-900 p-6 rounded-2xl text-white shadow-lg relative overflow-hidden border border-slate-800">
                      <div className="relative z-10">
                        <p className="text-[10px] font-bold uppercase opacity-60 mb-1">Status da Licença</p>
                        <p className="text-lg font-black text-blue-400">ENTERPRISE</p>
                        <div className="mt-4 flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
                          <p className="text-[10px] opacity-70">Sistema Operacional</p>
                        </div>
                      </div>
                      <ShieldCheck className="absolute -right-4 -bottom-4 w-24 h-24 opacity-10 -rotate-12" />
                    </div>
                  </div>

                  <div className="md:col-span-3 space-y-6">
                    {activeSettingsTab === 'geral' && (
                      <motion.div initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} className="space-y-6">
                        <div className="bg-white dark:bg-slate-900 p-8 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-6">
                          <h3 className="font-bold text-lg text-slate-900 dark:text-white border-b border-slate-100 dark:border-slate-800 pb-4">Preferências Gerais</h3>
                          
                          <div className="space-y-6">
                            <div className="grid grid-cols-2 gap-6">
                              <div className="space-y-1.5">
                                <label className="text-[10px] font-bold text-slate-400 dark:text-slate-400 uppercase">Nome da Empresa</label>
                                <input 
                                  type="text" 
                                  value={settings.companyName} 
                                  onChange={(e) => setSettings({...settings, companyName: e.target.value})}
                                  className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-800/90 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-500 transition-all font-medium" 
                                />
                              </div>
                              <div className="space-y-1.5">
                                <label className="text-[10px] font-bold text-slate-400 dark:text-slate-400 uppercase">Fuso Horário</label>
                                <select 
                                  value={settings.timezone}
                                  onChange={(e) => setSettings({...settings, timezone: e.target.value})}
                                  className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-800/90 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-500 transition-all font-medium"
                                >
                                  <option className="dark:bg-slate-900 dark:text-white">Brasília (GMT-3)</option>
                                  <option className="dark:bg-slate-900 dark:text-white">Manaus (GMT-4)</option>
                                  <option className="dark:bg-slate-900 dark:text-white">Fernando de Noronha (GMT-2)</option>
                                </select>
                              </div>
                            </div>

                            <div className="grid grid-cols-2 gap-6">
                              <div className="space-y-1.5">
                                <label className="text-[10px] font-bold text-slate-400 dark:text-slate-400 uppercase">Idioma do Sistema</label>
                                <select className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-800/90 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-500 transition-all font-medium">
                                  <option className="dark:bg-slate-900 dark:text-white">Português (Brasil)</option>
                                  <option className="dark:bg-slate-900 dark:text-white">English (US)</option>
                                  <option className="dark:bg-slate-900 dark:text-white">Español</option>
                                </select>
                              </div>
                              <div className="space-y-1.5">
                                <label className="text-[10px] font-bold text-slate-400 dark:text-slate-400 uppercase">Intervalo de Atualização (Segundos)</label>
                                <input 
                                  type="number" 
                                  value={settings.refreshInterval} 
                                  onChange={(e) => setSettings({...settings, refreshInterval: parseInt(e.target.value) || 60})}
                                  className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-800/90 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-500 transition-all font-medium" 
                                />
                              </div>
                            </div>

                            <div className="pt-4 space-y-4">
                              <h4 className="text-xs font-bold text-slate-400 dark:text-slate-400 uppercase tracking-wider">Limites de Alerta (Dias)</h4>
                              <div className="grid grid-cols-2 gap-4">
                                <div className="p-4 bg-amber-50 dark:bg-amber-950/40 rounded-2xl border border-amber-100 dark:border-amber-900/50">
                                  <label className="text-[10px] font-bold text-amber-600 dark:text-amber-400 uppercase block mb-2">Atenção</label>
                                  <input 
                                    type="number" 
                                    value={settings.alertAttention} 
                                    onChange={(e) => setSettings({...settings, alertAttention: parseInt(e.target.value) || 30})}
                                    className="w-full px-3 py-1.5 bg-white dark:bg-slate-800 border border-amber-200 dark:border-amber-700 text-slate-900 dark:text-white rounded-lg text-sm font-bold outline-none focus:ring-2 focus:ring-amber-500" 
                                  />
                                </div>
                                <div className="p-4 bg-orange-50 dark:bg-orange-950/40 rounded-2xl border border-orange-100 dark:border-orange-900/50">
                                  <label className="text-[10px] font-bold text-orange-600 dark:text-orange-400 uppercase block mb-2">Crítico</label>
                                  <input 
                                    type="number" 
                                    value={settings.alertCritical} 
                                    onChange={(e) => setSettings({...settings, alertCritical: parseInt(e.target.value) || 7})}
                                    className="w-full px-3 py-1.5 bg-white dark:bg-slate-800 border border-orange-200 dark:border-orange-700 text-slate-900 dark:text-white rounded-lg text-sm font-bold outline-none focus:ring-2 focus:ring-orange-500" 
                                  />
                                </div>
                              </div>
                            </div>

                            <div className="pt-4 space-y-4">
                              <h4 className="text-xs font-bold text-slate-400 dark:text-slate-400 uppercase tracking-wider">Identidade Visual</h4>
                              <div className="space-y-4">
                                <div className="flex items-center gap-6 p-4 rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/50">
                                  <div className="w-20 h-20 bg-white dark:bg-slate-900 rounded-2xl flex items-center justify-center border border-slate-200 dark:border-slate-700 overflow-hidden shrink-0">
                                    <img src={settings.logoUrl || UNI_LOGO} alt="Logo Preview" className="max-w-full max-h-full object-contain" referrerPolicy="no-referrer" />
                                  </div>
                                  <div className="flex-1 space-y-1.5">
                                    <label className="text-[10px] font-bold text-slate-400 dark:text-slate-400 uppercase">URL do Logotipo</label>
                                    <input 
                                      type="text" 
                                      value={settings.logoUrl} 
                                      onChange={(e) => setSettings({...settings, logoUrl: e.target.value})}
                                      placeholder="https://exemplo.com/logo.png"
                                      className="w-full px-4 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500 transition-all font-medium" 
                                    />
                                    <p className="text-[10px] text-slate-400 dark:text-slate-400 italic">Insira a URL de uma imagem PNG ou JPG para ser exibida nos relatórios.</p>
                                  </div>
                                </div>
                                <div className="flex items-center justify-between p-4 rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/50">
                                  <div>
                                    <p className="text-sm font-bold text-slate-800 dark:text-white">Logo UNI nos Relatórios</p>
                                    <p className="text-[11px] text-slate-500 dark:text-slate-400">Exibir marca UNI em PDFs e cabeçalho</p>
                                  </div>
                                  <div 
                                    onClick={() => setSettings({...settings, showLogo: !settings.showLogo})}
                                    className={cn(
                                      "w-12 h-6 rounded-full relative cursor-pointer transition-all duration-300",
                                      settings.showLogo ? "bg-blue-600" : "bg-slate-200 dark:bg-slate-700"
                                    )}
                                  >
                                    <div className={cn(
                                      "absolute top-1 w-4 h-4 bg-white rounded-full transition-all duration-300 shadow-sm",
                                      settings.showLogo ? "right-1" : "left-1"
                                    )}></div>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      </motion.div>
                    )}

                    {activeSettingsTab === 'notificacoes' && (
                      <motion.div initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} className="space-y-6">
                        <div className="bg-white dark:bg-slate-900 p-8 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-6">
                          <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-4">
                            <h3 className="font-bold text-lg text-slate-900 dark:text-white">Canais e Contatos de Notificação</h3>
                            <div className="flex items-center gap-3">
                              <button 
                                onClick={() => handleManualTrigger()}
                                className="px-4 py-2 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-xl text-xs font-bold hover:bg-slate-200 dark:hover:bg-slate-700 transition-all"
                              >
                                APENAS RESUMO
                              </button>
                              <button 
                                onClick={handleAutoSendPDF}
                                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl text-xs font-bold hover:bg-blue-700 transition-all shadow-md shadow-blue-100 dark:shadow-none"
                              >
                                <Send size={16} />
                                GERAR PDF E DISPARAR
                              </button>
                            </div>
                          </div>

                          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                            <div className="space-y-6">
                              <h4 className="text-xs font-bold text-slate-400 dark:text-slate-400 uppercase tracking-wider">Ativação de Canais</h4>
                              <div className="space-y-3">
                                {[
                                  { key: 'email', label: 'Alertas por E-mail', desc: 'Habilita o envio do resumo executivo por e-mail', icon: Mail },
                                  { key: 'push', label: 'Push Notifications', desc: 'Alertas em tempo real no navegador', icon: Bell },
                                  { key: 'weekly', label: 'Relatório Semanal', desc: 'Geração automática de PDF consolidado', icon: FileText },
                                  { key: 'whatsapp', label: 'Integração WhatsApp', desc: 'Habilita o compartilhamento via WhatsApp', icon: MessageSquare },
                                ].map((item) => (
                                  <div key={item.key} className="flex items-center justify-between p-3 rounded-xl border border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-all group">
                                    <div className="flex items-center gap-3">
                                      <div className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-500 dark:text-slate-400 group-hover:bg-blue-100 dark:group-hover:bg-blue-900/50 group-hover:text-blue-600 dark:group-hover:text-cyan-300 transition-all">
                                        <item.icon size={16} />
                                      </div>
                                      <div>
                                        <p className="text-xs font-bold text-slate-800 dark:text-slate-100">{item.label}</p>
                                        <p className="text-[10px] text-slate-500 dark:text-slate-400">{item.desc}</p>
                                      </div>
                                    </div>
                                    <div 
                                      onClick={() => setSettings({
                                        ...settings, 
                                        notifications: {
                                          ...settings.notifications, 
                                          [item.key]: !settings.notifications[item.key as keyof typeof settings.notifications]
                                        }
                                      })}
                                      className={cn(
                                        "w-10 h-5 rounded-full relative cursor-pointer transition-all duration-300",
                                        settings.notifications[item.key as keyof typeof settings.notifications] ? "bg-blue-600" : "bg-slate-200 dark:bg-slate-700"
                                      )}
                                    >
                                      <div className={cn(
                                        "absolute top-0.5 w-4 h-4 bg-white rounded-full transition-all duration-300 shadow-sm",
                                        settings.notifications[item.key as keyof typeof settings.notifications] ? "right-0.5" : "left-0.5"
                                      )}></div>
                                    </div>
                                  </div>
                                ))}
                              </div>

                              <div className="pt-4 space-y-3">
                                <h4 className="text-xs font-bold text-slate-400 dark:text-slate-400 uppercase tracking-wider">Frequência de Relatórios</h4>
                                <select 
                                  value={settings.reportFrequency} 
                                  onChange={(e) => setSettings({...settings, reportFrequency: e.target.value})}
                                  className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-500 transition-all font-medium"
                                >
                                  <option value="daily" className="dark:bg-slate-900 dark:text-white">Diário</option>
                                  <option value="weekly" className="dark:bg-slate-900 dark:text-white">Semanal</option>
                                  <option value="biweekly" className="dark:bg-slate-900 dark:text-white">Quinzenal</option>
                                  <option value="monthly" className="dark:bg-slate-900 dark:text-white">Mensal</option>
                                </select>
                                {settings.lastSentDate && (
                                  <div className="p-3 bg-blue-50 dark:bg-blue-950/60 rounded-xl border border-blue-100 dark:border-blue-900/50">
                                    <p className="text-[10px] font-bold text-blue-600 dark:text-blue-400 uppercase">Último Envio Automático</p>
                                    <p className="text-xs text-blue-800 dark:text-blue-200 font-medium">{format(new Date(settings.lastSentDate), "dd/MM/yyyy HH:mm")}</p>
                                  </div>
                                )}
                              </div>
                            </div>

                            <div className="space-y-6">
                              <div className="space-y-4">
                                <div className="flex items-center justify-between">
                                  <h4 className="text-xs font-bold text-slate-400 dark:text-slate-400 uppercase tracking-wider">Lista de E-mails</h4>
                                  <button 
                                    onClick={() => setSettings({...settings, notificationEmails: [...(settings.notificationEmails || []), ""]})}
                                    className="p-1.5 bg-blue-50 dark:bg-blue-950/80 text-blue-600 dark:text-blue-300 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-900 transition-all"
                                  >
                                    <Plus size={14} />
                                  </button>
                                </div>
                                <div className="space-y-2 max-h-[150px] overflow-y-auto pr-2 custom-scrollbar">
                                  {(settings.notificationEmails || []).map((email: string, index: number) => (
                                    <div key={index} className="flex items-center gap-2">
                                      <div className="relative flex-1">
                                        <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500" size={14} />
                                        <input 
                                          type="email" 
                                          value={email} 
                                          onChange={(e) => {
                                            const newEmails = [...settings.notificationEmails];
                                            newEmails[index] = e.target.value;
                                            setSettings({...settings, notificationEmails: newEmails});
                                          }}
                                          placeholder="diretoria@empresa.com.br"
                                          className="w-full pl-9 pr-4 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white rounded-xl text-xs outline-none focus:ring-2 focus:ring-blue-500 transition-all font-medium" 
                                        />
                                      </div>
                                      <button 
                                        onClick={() => {
                                          const newEmails = settings.notificationEmails.filter((_: any, i: number) => i !== index);
                                          setSettings({...settings, notificationEmails: newEmails});
                                        }}
                                        className="p-2 text-slate-400 dark:text-slate-500 hover:text-red-500 dark:hover:text-red-400 transition-all"
                                      >
                                        <Trash2 size={14} />
                                      </button>
                                    </div>
                                  ))}
                                  {(!settings.notificationEmails || settings.notificationEmails.length === 0) && (
                                    <p className="text-[10px] text-slate-400 dark:text-slate-400 italic text-center py-2">Nenhum e-mail cadastrado.</p>
                                  )}
                                </div>
                              </div>

                              <div className="space-y-4 pt-4 border-t border-slate-100 dark:border-slate-800">
                                <div className="flex items-center justify-between">
                                  <h4 className="text-xs font-bold text-slate-400 dark:text-slate-400 uppercase tracking-wider">Lista de WhatsApp</h4>
                                  <button 
                                    onClick={() => setSettings({...settings, notificationWhatsapps: [...(settings.notificationWhatsapps || []), ""]})}
                                    className="p-1.5 bg-green-50 dark:bg-green-950/80 text-green-600 dark:text-green-300 rounded-lg hover:bg-green-100 dark:hover:bg-green-900 transition-all"
                                  >
                                    <Plus size={14} />
                                  </button>
                                </div>
                                <div className="space-y-2 max-h-[150px] overflow-y-auto pr-2 custom-scrollbar">
                                  {(settings.notificationWhatsapps || []).map((num: string, index: number) => (
                                    <div key={index} className="flex items-center gap-2">
                                      <div className="relative flex-1">
                                        <MessageSquare className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500" size={14} />
                                        <input 
                                          type="text" 
                                          value={num} 
                                          onChange={(e) => {
                                            const newNums = [...settings.notificationWhatsapps];
                                            newNums[index] = e.target.value;
                                            setSettings({...settings, notificationWhatsapps: newNums});
                                          }}
                                          placeholder="5511999999999"
                                          className="w-full pl-9 pr-4 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white rounded-xl text-xs outline-none focus:ring-2 focus:ring-blue-500 transition-all font-medium" 
                                        />
                                      </div>
                                      <button 
                                        onClick={() => {
                                          const newNums = settings.notificationWhatsapps.filter((_: any, i: number) => i !== index);
                                          setSettings({...settings, notificationWhatsapps: newNums});
                                        }}
                                        className="p-2 text-slate-400 dark:text-slate-500 hover:text-red-500 dark:hover:text-red-400 transition-all"
                                      >
                                        <Trash2 size={14} />
                                      </button>
                                    </div>
                                  ))}
                                  {(!settings.notificationWhatsapps || settings.notificationWhatsapps.length === 0) && (
                                    <p className="text-[10px] text-slate-400 dark:text-slate-400 italic text-center py-2">Nenhum WhatsApp cadastrado.</p>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                          
                          <p className="text-[10px] text-slate-400 dark:text-slate-400 italic pt-4 border-t border-slate-100 dark:border-slate-800">
                            * O disparo manual abrirá janelas individuais para cada contato de WhatsApp com um intervalo de 1 segundo entre elas.
                          </p>
                        </div>
                      </motion.div>
                    )}

                    {activeSettingsTab === 'operacoes' && (
                      <motion.div initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} className="space-y-6">
                        <div className="bg-white dark:bg-slate-900 p-8 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-6">
                          <h3 className="font-bold text-lg text-slate-900 dark:text-white border-b border-slate-100 dark:border-slate-800 pb-4">Gestão de Operações</h3>
                          <div className="space-y-6">
                            <div className="space-y-3">
                              <label className="text-[10px] font-bold text-slate-400 dark:text-slate-400 uppercase">Operações Ativas (Detectadas)</label>
                              <div className="flex flex-wrap gap-2">
                                {operations.map(op => (
                                  <div key={op} className="flex items-center gap-2 px-3 py-1.5 bg-blue-50 dark:bg-blue-950/80 text-blue-700 dark:text-blue-300 rounded-lg text-xs font-bold border border-blue-100 dark:border-blue-800">
                                    {op}
                                  </div>
                                ))}
                              </div>
                              <p className="text-[10px] text-slate-400 dark:text-slate-400 italic">As operações são detectadas automaticamente a partir dos dados da planilha.</p>
                            </div>
                            
                            <div className="space-y-3">
                              <label className="text-[10px] font-bold text-slate-400 dark:text-slate-400 uppercase">Documentos Obrigatórios Monitorados</label>
                              <div className="grid grid-cols-2 gap-3">
                                {["CRLV", "ANTT", "CRONOTACÓGRAFO", "CIV", "CIPP", "OPP"].map(doc => (
                                  <div key={doc} className="flex items-center justify-between p-3 rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/50">
                                    <span className="text-xs font-bold text-slate-700 dark:text-slate-200">{doc}</span>
                                    <div 
                                      onClick={() => {
                                        const newDocs = settings.requiredDocuments.includes(doc)
                                          ? settings.requiredDocuments.filter(d => d !== doc)
                                          : [...settings.requiredDocuments, doc];
                                        setSettings({...settings, requiredDocuments: newDocs});
                                      }}
                                      className={cn(
                                        "w-10 h-5 rounded-full relative cursor-pointer transition-all",
                                        settings.requiredDocuments.includes(doc) ? "bg-blue-600" : "bg-slate-200 dark:bg-slate-700"
                                      )}
                                    >
                                      <div className={cn(
                                        "absolute top-1 w-3 h-3 bg-white rounded-full transition-all",
                                        settings.requiredDocuments.includes(doc) ? "right-1" : "left-1"
                                      )}></div>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </div>
                        </div>
                      </motion.div>
                    )}

                    {activeSettingsTab === 'exportacao' && (
                      <motion.div initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} className="space-y-6">
                        <div className="bg-white dark:bg-slate-900 p-8 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-6">
                          <h3 className="font-bold text-lg text-slate-900 dark:text-white border-b border-slate-100 dark:border-slate-800 pb-4">Configurações de Exportação</h3>
                          <div className="space-y-6">
                            <div className="space-y-3">
                              <label className="text-[10px] font-bold text-slate-400 dark:text-slate-400 uppercase">Formato Padrão de Relatório</label>
                              <div className="grid grid-cols-3 gap-4">
                                {['PDF Gerencial', 'Excel Detalhado', 'CSV'].map(format => (
                                  <button 
                                    key={format} 
                                    onClick={() => setSettings({...settings, exportFormat: format})}
                                    className={cn(
                                      "p-4 rounded-xl border text-center transition-all",
                                      settings.exportFormat === format 
                                        ? "border-blue-600 dark:border-cyan-400 bg-blue-50 dark:bg-blue-950/80 text-blue-700 dark:text-cyan-300 font-bold" 
                                        : "border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:border-blue-200 dark:hover:border-slate-600 bg-white dark:bg-slate-800"
                                    )}
                                  >
                                    <p className="text-xs font-bold">{format}</p>
                                  </button>
                                ))}
                              </div>
                            </div>
                            
                            <div className="space-y-4">
                              <div className="flex items-center justify-between p-4 rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/50">
                                <div>
                                  <p className="text-sm font-bold text-slate-800 dark:text-white">Incluir Gráficos no PDF</p>
                                  <p className="text-[11px] text-slate-500 dark:text-slate-400">Adiciona sumário visual ao início do documento</p>
                                </div>
                                <div 
                                  onClick={() => setSettings({...settings, includeCharts: !settings.includeCharts})}
                                  className={cn(
                                    "w-12 h-6 rounded-full relative cursor-pointer transition-all",
                                    settings.includeCharts ? "bg-blue-600" : "bg-slate-200 dark:bg-slate-700"
                                  )}
                                >
                                  <div className={cn(
                                    "absolute top-1 w-4 h-4 bg-white rounded-full transition-all",
                                    settings.includeCharts ? "right-1" : "left-1"
                                  )}></div>
                                </div>
                              </div>
                              <div className="flex items-center justify-between p-4 rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/50">
                                <div>
                                  <p className="text-sm font-bold text-slate-800 dark:text-white">Assinatura Digital</p>
                                  <p className="text-[11px] text-slate-500 dark:text-slate-400">Incluir campo de assinatura para diretoria</p>
                                </div>
                                <div 
                                  onClick={() => setSettings({...settings, digitalSignature: !settings.digitalSignature})}
                                  className={cn(
                                    "w-12 h-6 rounded-full relative cursor-pointer transition-all",
                                    settings.digitalSignature ? "bg-blue-600" : "bg-slate-200 dark:bg-slate-700"
                                  )}
                                >
                                  <div className={cn(
                                    "absolute top-1 w-4 h-4 bg-white rounded-full transition-all",
                                    settings.digitalSignature ? "right-1" : "left-1"
                                  )}></div>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      </motion.div>
                    )}

                    {activeSettingsTab === 'seguranca' && (
                      <motion.div initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} className="space-y-6">
                        <div className="bg-white dark:bg-slate-900 p-8 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-6">
                          <h3 className="font-bold text-lg text-slate-900 dark:text-white border-b border-slate-100 dark:border-slate-800 pb-4">Segurança e Acesso</h3>
                          <div className="space-y-6">
                            <div className="p-4 bg-blue-50 dark:bg-blue-950/60 rounded-xl border border-blue-100 dark:border-blue-900/50 flex items-start gap-4">
                              <ShieldCheck className="text-blue-600 dark:text-blue-400 shrink-0" size={24} />
                              <div>
                                <p className="text-sm font-bold text-blue-900 dark:text-blue-100">Proteção de Dados Ativa</p>
                                <p className="text-xs text-blue-700 dark:text-blue-300 mt-1">Sua conexão está criptografada e os dados da frota estão protegidos conforme a LGPD.</p>
                              </div>
                            </div>
                            
                            <div className="space-y-4">
                              <div className="flex items-center justify-between p-4 rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/50">
                                <div>
                                  <p className="text-sm font-bold text-slate-800 dark:text-white">Autenticação em Duas Etapas (2FA)</p>
                                  <p className="text-[11px] text-slate-500 dark:text-slate-400">Exigir código via SMS ou App para login</p>
                                </div>
                                <div 
                                  onClick={() => setSettings({...settings, twoFactor: !settings.twoFactor})}
                                  className={cn(
                                    "w-12 h-6 rounded-full relative cursor-pointer transition-all",
                                    settings.twoFactor ? "bg-blue-600" : "bg-slate-200 dark:bg-slate-700"
                                  )}
                                >
                                  <div className={cn(
                                    "absolute top-1 w-4 h-4 bg-white rounded-full transition-all",
                                    settings.twoFactor ? "right-1" : "left-1"
                                  )}></div>
                                </div>
                              </div>
                              <div className="flex items-center justify-between p-4 rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/50">
                                <div>
                                  <p className="text-sm font-bold text-slate-800 dark:text-white">Logs de Auditoria</p>
                                  <p className="text-[11px] text-slate-500 dark:text-slate-400">Registrar todas as alterações feitas no sistema</p>
                                </div>
                                <div 
                                  onClick={() => setSettings({...settings, auditLogs: !settings.auditLogs})}
                                  className={cn(
                                    "w-12 h-6 rounded-full relative cursor-pointer transition-all",
                                    settings.auditLogs ? "bg-blue-600" : "bg-slate-200 dark:bg-slate-700"
                                  )}
                                >
                                  <div className={cn(
                                    "absolute top-1 w-4 h-4 bg-white rounded-full transition-all",
                                    settings.auditLogs ? "right-1" : "left-1"
                                  )}></div>
                                </div>
                              </div>
                            </div>

                            <div className="pt-4">
                              <button className="w-full py-3 border-2 border-red-100 dark:border-red-900/50 text-red-600 dark:text-red-400 rounded-xl text-sm font-bold hover:bg-red-50 dark:hover:bg-red-950/50 transition-all">
                                Redefinir Todas as Configurações
                              </button>
                            </div>
                          </div>
                        </div>
                      </motion.div>
                    )}

                    {activeSettingsTab === 'prazos_licencas' && (
                      <motion.div initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} className="space-y-6">
                        <div className="bg-white dark:bg-slate-900 p-8 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-6">
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-4">
                            <div>
                              <h3 className="font-bold text-lg text-slate-900 dark:text-white flex items-center gap-2">
                                <Clock className="text-blue-600 dark:text-cyan-400" size={22} />
                                Configuração de Prazos de Licenças
                              </h3>
                              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                                Gerencie, edite, adicione e remova os prazos regulamentares e validade legal das licenças e documentos da frota.
                              </p>
                            </div>

                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => {
                                  if (window.confirm("Deseja restaurar os prazos de licenças para os valores padrão regulamentares?")) {
                                    setSettings({ ...settings, legalValidityMap: DEFAULT_LEGAL_VALIDITY_MAP });
                                  }
                                }}
                                className="px-3 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold rounded-xl transition-all flex items-center gap-1.5"
                                title="Restaurar prazos padrão"
                              >
                                <RotateCcw size={14} />
                                <span className="hidden sm:inline">Restaurar Padrão</span>
                              </button>

                              <button
                                type="button"
                                onClick={() => {
                                  setIsAddingPrazo(true);
                                  setNewPrazoKey("");
                                  setNewPrazoVal("01 ANO");
                                }}
                                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl shadow-sm transition-all flex items-center gap-1.5"
                              >
                                <Plus size={16} />
                                <span>Adicionar Prazo</span>
                              </button>
                            </div>
                          </div>

                          {/* Search Bar & Counter */}
                          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-slate-50 dark:bg-slate-800/60 p-3 rounded-xl border border-slate-100 dark:border-slate-800">
                            <div className="relative w-full sm:w-72">
                              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                              <input
                                type="text"
                                value={prazosSearchTerm}
                                onChange={(e) => setPrazosSearchTerm(e.target.value)}
                                placeholder="Buscar por tipo de licença..."
                                className="w-full pl-9 pr-4 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white rounded-xl text-xs outline-none focus:ring-2 focus:ring-blue-500 font-medium"
                              />
                            </div>
                            <span className="text-xs font-bold text-slate-500 dark:text-slate-400 shrink-0">
                              {Object.keys(settings.legalValidityMap || DEFAULT_LEGAL_VALIDITY_MAP).length} prazos cadastrados
                            </span>
                          </div>

                          {/* Inline Form to Add New Prazo */}
                          {isAddingPrazo && (
                            <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="p-4 bg-blue-50/80 dark:bg-blue-950/50 border border-blue-200 dark:border-blue-800/80 rounded-2xl space-y-4">
                              <div className="flex items-center justify-between">
                                <h4 className="text-xs font-bold uppercase tracking-wider text-blue-900 dark:text-blue-200">Adicionar Novo Prazo Regulamentar</h4>
                                <button type="button" onClick={() => setIsAddingPrazo(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
                                  <X size={16} />
                                </button>
                              </div>
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                  <label className="text-[10px] font-bold uppercase text-slate-500 dark:text-slate-400 block mb-1">Nome / Tipo do Documento</label>
                                  <input
                                    type="text"
                                    value={newPrazoKey}
                                    onChange={(e) => setNewPrazoKey(e.target.value)}
                                    placeholder="Ex: SEGURO, TACOGRAFO, VISTORIA..."
                                    className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white rounded-xl text-xs outline-none focus:ring-2 focus:ring-blue-500 font-bold uppercase"
                                  />
                                </div>
                                <div>
                                  <label className="text-[10px] font-bold uppercase text-slate-500 dark:text-slate-400 block mb-1">Prazo de Validade</label>
                                  <input
                                    type="text"
                                    value={newPrazoVal}
                                    onChange={(e) => setNewPrazoVal(e.target.value)}
                                    placeholder="Ex: 01 ANO, 6 MESES, 02 ANOS..."
                                    className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white rounded-xl text-xs outline-none focus:ring-2 focus:ring-blue-500 font-bold"
                                  />
                                </div>
                              </div>
                              <div className="flex justify-end gap-2 pt-2">
                                <button
                                  type="button"
                                  onClick={() => setIsAddingPrazo(false)}
                                  className="px-3 py-1.5 text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-lg transition-all"
                                >
                                  Cancelar
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (!newPrazoKey.trim()) return;
                                    const keyNorm = newPrazoKey.toUpperCase().trim();
                                    const valNorm = newPrazoVal.trim() || "01 ANO";
                                    setSettings({
                                      ...settings,
                                      legalValidityMap: {
                                        ...(settings.legalValidityMap || DEFAULT_LEGAL_VALIDITY_MAP),
                                        [keyNorm]: valNorm
                                      }
                                    });
                                    setIsAddingPrazo(false);
                                    setNewPrazoKey("");
                                    setNewPrazoVal("");
                                  }}
                                  className="px-4 py-1.5 text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-all shadow-sm"
                                >
                                  Salvar Prazo
                                </button>
                              </div>
                            </motion.div>
                          )}

                          {/* Grid of Legal Validity Items */}
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-[500px] overflow-y-auto pr-1 scrollbar-thin">
                            {Object.entries(settings.legalValidityMap || DEFAULT_LEGAL_VALIDITY_MAP)
                              .filter(([key]) => !prazosSearchTerm || key.toLowerCase().includes(prazosSearchTerm.toLowerCase()))
                              .map(([key, value]) => {
                                const isEditing = editingPrazoKey === key;
                                return (
                                  <div
                                    key={key}
                                    className="p-4 bg-slate-50/80 dark:bg-slate-800/50 rounded-2xl border border-slate-200/80 dark:border-slate-700/80 flex items-center justify-between gap-3 group hover:border-blue-300 dark:hover:border-blue-700 transition-all"
                                  >
                                    {isEditing ? (
                                      <div className="w-full space-y-2">
                                        <div className="flex items-center gap-2">
                                          <span className="text-[10px] font-bold text-slate-400 uppercase">Documento:</span>
                                          <span className="text-xs font-black text-slate-800 dark:text-white uppercase">{key}</span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                          <input
                                            type="text"
                                            value={editingPrazoVal}
                                            onChange={(e) => setEditingPrazoVal(e.target.value)}
                                            className="flex-1 px-3 py-1.5 bg-white dark:bg-slate-900 border border-blue-400 dark:border-blue-600 text-slate-900 dark:text-white rounded-xl text-xs font-bold outline-none"
                                          />
                                          <button
                                            type="button"
                                            onClick={() => {
                                              setSettings({
                                                ...settings,
                                                legalValidityMap: {
                                                  ...(settings.legalValidityMap || DEFAULT_LEGAL_VALIDITY_MAP),
                                                  [key]: editingPrazoVal.trim() || "01 ANO"
                                                }
                                              });
                                              setEditingPrazoKey(null);
                                            }}
                                            className="px-3 py-1.5 bg-emerald-600 text-white text-xs font-bold rounded-lg hover:bg-emerald-700 transition-all"
                                          >
                                            Salvar
                                          </button>
                                          <button
                                            type="button"
                                            onClick={() => setEditingPrazoKey(null)}
                                            className="px-2 py-1.5 bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold rounded-lg"
                                          >
                                            <X size={14} />
                                          </button>
                                        </div>
                                      </div>
                                    ) : (
                                      <>
                                        <div className="min-w-0 flex-1">
                                          <div className="flex items-center gap-2">
                                            <span className="font-black text-xs text-slate-900 dark:text-white uppercase truncate">{key}</span>
                                          </div>
                                          <div className="mt-1">
                                            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-blue-700 dark:text-cyan-300 bg-blue-100/80 dark:bg-blue-950/80 px-2.5 py-0.5 rounded-full border border-blue-200/60 dark:border-blue-800/60">
                                              <Clock size={11} /> {String(value || "")}
                                            </span>
                                          </div>
                                        </div>

                                        <div className="flex items-center gap-1 opacity-90 sm:opacity-0 group-hover:opacity-100 transition-opacity">
                                          <button
                                            type="button"
                                            onClick={() => {
                                              setEditingPrazoKey(key);
                                              setEditingPrazoVal(String(value || ""));
                                            }}
                                            className="p-2 text-slate-500 hover:text-blue-600 dark:text-slate-400 dark:hover:text-cyan-300 hover:bg-white dark:hover:bg-slate-700 rounded-xl transition-all"
                                            title="Ajustar / Editar Prazo"
                                          >
                                            <Edit size={15} />
                                          </button>

                                          <button
                                            type="button"
                                            onClick={() => {
                                              if (window.confirm(`Tem certeza que deseja apagar o prazo para "${key}"?`)) {
                                                const newMap = { ...(settings.legalValidityMap || DEFAULT_LEGAL_VALIDITY_MAP) };
                                                delete newMap[key];
                                                setSettings({ ...settings, legalValidityMap: newMap });
                                              }
                                            }}
                                            className="p-2 text-slate-500 hover:text-red-600 dark:text-slate-400 dark:hover:text-red-400 hover:bg-white dark:hover:bg-slate-700 rounded-xl transition-all"
                                            title="Apagar Prazo"
                                          >
                                            <Trash2 size={15} />
                                          </button>
                                        </div>
                                      </>
                                    )}
                                  </div>
                                );
                              })}
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </div>
                </div>
              </motion.div>
            )}

            {activeTab === "map" && fleet.length > 0 && (
              <motion.div 
                key="map"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="h-full glass-card rounded-3xl relative overflow-hidden flex flex-col"
              >
                {/* Toggle Filters Button */}
                <div className="absolute top-4 right-4 z-[4001] flex items-center gap-2 pointer-events-none">
                  <button 
                    onClick={() => setShowMapFilters(!showMapFilters)}
                    className="flex items-center gap-2 px-3.5 py-2.5 bg-slate-900/90 text-white backdrop-blur-md border border-slate-700/80 rounded-2xl shadow-xl hover:bg-blue-600 hover:border-blue-500 transition-all group pointer-events-auto cursor-pointer"
                    title={showMapFilters ? "Ocultar Painel de Filtros" : "Mostrar Painel de Filtros"}
                  >
                    {showMapFilters ? <EyeOff size={16} className="text-blue-400 group-hover:text-white" /> : <Eye size={16} className="text-blue-400 group-hover:text-white" />}
                    <span className="text-xs font-bold uppercase tracking-wider hidden sm:inline">
                      {showMapFilters ? "Ocultar Filtros" : "Filtros"}
                    </span>
                  </button>
                </div>

                {/* Map Filters Bar - Refined Glass Style with High Visibility & Dropdown Popout */}
                <AnimatePresence>
                  {showMapFilters && (
                    <motion.div 
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      transition={{ duration: 0.2 }}
                      className="relative z-[4000] bg-slate-900/95 border-b border-slate-700/80 backdrop-blur-2xl shadow-2xl overflow-visible"
                      style={{ overflow: "visible" }}
                    >
                      <div className="p-5 overflow-visible">
                        <div className="flex flex-col lg:flex-row gap-6 items-end overflow-visible">
                          <div className="flex-1 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4 w-full overflow-visible">
                            <MultiSelect 
                              label="Operação"
                              options={mapOperations}
                              selected={selectedOperation}
                              onChange={setSelectedOperation}
                              placeholder="Todas as Operações"
                            />
                            <MultiSelect 
                              label="Cidade / Base"
                              options={mapCities}
                              selected={selectedCity}
                              onChange={setSelectedCity}
                              placeholder="Todas as Cidades"
                            />
                            <MultiSelect 
                              label="Motorista"
                              options={mapDrivers}
                              selected={selectedDriver}
                              onChange={setSelectedDriver}
                              placeholder="Todos os Motoristas"
                            />
                            
                            {/* Route Simulation Section - High contrast & visibility */}
                            <div className="md:col-span-2 lg:col-span-3 grid grid-cols-1 md:grid-cols-3 gap-4 bg-slate-800/90 p-3.5 rounded-[2rem] border border-blue-500/30 shadow-lg shadow-black/20">
                              <div className="space-y-1.5">
                                <label className="text-[10px] font-black text-blue-400 uppercase tracking-widest ml-1 flex items-center gap-1">
                                  <span>Rota: Origem</span>
                                </label>
                                <select 
                                  value={originCity}
                                  onChange={(e) => setOriginCity(e.target.value)}
                                  className="w-full bg-slate-900 text-slate-100 border border-slate-700 rounded-2xl px-4 py-2.5 text-xs font-bold outline-none focus:ring-4 focus:ring-blue-500/30 focus:border-blue-400 transition-all shadow-md cursor-pointer hover:border-blue-400/60"
                                >
                                  <option value="" className="bg-slate-900 text-slate-400">Selecione Origem</option>
                                  {mapCities.map(city => (
                                    <option key={city} value={city} className="bg-slate-900 text-slate-100">{city}</option>
                                  ))}
                                </select>
                              </div>
                              <div className="space-y-1.5">
                                <label className="text-[10px] font-black text-blue-400 uppercase tracking-widest ml-1 flex items-center gap-1">
                                  <span>Destino</span>
                                </label>
                                <select 
                                  value={destinationCity}
                                  onChange={(e) => setDestinationCity(e.target.value)}
                                  className="w-full bg-slate-900 text-slate-100 border border-slate-700 rounded-2xl px-4 py-2.5 text-xs font-bold outline-none focus:ring-4 focus:ring-blue-500/30 focus:border-blue-400 transition-all shadow-md cursor-pointer hover:border-blue-400/60"
                                >
                                  <option value="" className="bg-slate-900 text-slate-400">Selecione Destino</option>
                                  {mapCities.map(city => (
                                    <option key={city} value={city} className="bg-slate-900 text-slate-100">{city}</option>
                                  ))}
                                </select>
                              </div>
                              <div className="flex items-end gap-2">
                                <div className="flex-1 bg-slate-950 border border-slate-800 text-white rounded-2xl px-4 py-2.5 flex flex-col justify-center shadow-xl">
                                  <span className="text-[8px] font-black text-slate-400 uppercase tracking-tighter">Distância Estimada</span>
                                  <span className="text-sm font-black text-blue-400">{routeDistance ? `${routeDistance} KM` : "---"}</span>
                                </div>
                                <button 
                                  onClick={() => {
                                    setOriginCity("");
                                    setDestinationCity("");
                                    setRouteDistance(null);
                                  }}
                                  className="p-3 bg-slate-800 text-slate-300 rounded-2xl hover:text-red-400 hover:bg-slate-700 hover:shadow-md transition-all border border-slate-700 cursor-pointer"
                                  title="Limpar Rota"
                                >
                                  <RefreshCw size={16} />
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
                <MapTab 
                  vehicles={fleet} 
                  selectedOperation={selectedOperation}
                  selectedStatus={selectedStatus}
                  selectedCity={selectedCity}
                  selectedDriver={selectedDriver}
                  originCity={originCity}
                  destinationCity={destinationCity}
                  setRouteDistance={setRouteDistance}
                  onSelectOperation={(op) => {
                    if (!op) {
                      setSelectedOperation([]);
                    } else if (selectedOperation.includes(op)) {
                      setSelectedOperation(selectedOperation.filter(o => o !== op));
                    } else {
                      setSelectedOperation([...selectedOperation, op]);
                    }
                  }}
                  onResetFilters={() => {
                    setSelectedOperation([]);
                    setSelectedCity([]);
                    setSelectedStatus([]);
                    setSelectedDriver([]);
                    setOriginCity("");
                    setDestinationCity("");
                    setRouteDistance(null);
                  }}
                />
              </motion.div>
            )}

            {activeTab === "tutorial" && (
              <motion.div 
                key="tutorial"
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -15 }}
                className="max-w-7xl mx-auto space-y-8"
              >
                <ComoUsarTab 
                  onNavigateTab={(tab) => setActiveTab(tab)}
                  onOpenSettings={() => setActiveTab("settings")}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </main>
    </div>
    </>
  );
}

function CollapsedThemeToggle({ 
  theme, 
  setTheme 
}: { 
  theme: "light" | "dark"; 
  setTheme: (theme: "light" | "dark") => void; 
}) {
  const [hoveredButton, setHoveredButton] = useState<"light" | "dark" | null>(null);
  const [coords, setCoords] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const lightRef = useRef<HTMLButtonElement>(null);
  const darkRef = useRef<HTMLButtonElement>(null);

  const handleMouseEnter = (type: "light" | "dark") => {
    const el = type === "light" ? lightRef.current : darkRef.current;
    if (el) {
      const rect = el.getBoundingClientRect();
      setCoords({
        top: rect.top + rect.height / 2,
        left: rect.right + 12
      });
    }
    setHoveredButton(type);
  };

  useEffect(() => {
    if (!hoveredButton) return;
    const updateCoords = () => {
      const el = hoveredButton === "light" ? lightRef.current : darkRef.current;
      if (el) {
        const rect = el.getBoundingClientRect();
        setCoords({
          top: rect.top + rect.height / 2,
          left: rect.right + 12
        });
      }
    };
    window.addEventListener("scroll", updateCoords, true);
    return () => window.removeEventListener("scroll", updateCoords, true);
  }, [hoveredButton]);

  return (
    <>
      <div className="flex flex-col items-center gap-1 p-1 bg-slate-200/80 dark:bg-slate-800/90 rounded-2xl border border-slate-300/70 dark:border-slate-700/80 shadow-inner w-11 mx-auto relative select-none shrink-0 min-h-[82px]">
        <motion.button 
          ref={lightRef}
          type="button"
          whileTap={{ scale: 0.92, y: 1 }}
          onClick={() => setTheme("light")}
          onMouseEnter={() => handleMouseEnter("light")}
          onMouseLeave={() => setHoveredButton(null)}
          className={cn(
            "w-9 h-9 min-h-[36px] rounded-xl transition-all duration-200 flex items-center justify-center cursor-pointer shrink-0",
            theme === "light" 
              ? "bg-white text-amber-500 shadow-md scale-105" 
              : "text-slate-400 hover:text-amber-500 hover:bg-white/50 dark:hover:bg-slate-700/50"
          )}
        >
          <Sun size={18} />
        </motion.button>
        <motion.button 
          ref={darkRef}
          type="button"
          whileTap={{ scale: 0.92, y: 1 }}
          onClick={() => setTheme("dark")}
          onMouseEnter={() => handleMouseEnter("dark")}
          onMouseLeave={() => setHoveredButton(null)}
          className={cn(
            "w-9 h-9 min-h-[36px] rounded-xl transition-all duration-200 flex items-center justify-center cursor-pointer shrink-0",
            theme === "dark" 
              ? "bg-slate-950 text-cyan-400 shadow-md shadow-cyan-950/50 border border-cyan-500/40 scale-105" 
              : "text-slate-400 hover:text-cyan-400 hover:bg-white/50 dark:hover:bg-slate-700/50"
          )}
        >
          <Moon size={18} />
        </motion.button>
      </div>

      <PortalTooltip 
        isOpen={hoveredButton !== null} 
        coords={coords}
        accentColor={hoveredButton === "light" ? "amber" : "cyan"}
      >
        <span className={cn(
          "w-1.5 h-1.5 rounded-full shadow-[0_0_6px]", 
          hoveredButton === "light" ? "bg-amber-400 shadow-amber-400" : "bg-cyan-400 shadow-cyan-400"
        )} />
        <span className="text-xs font-display font-black tracking-wide uppercase text-slate-100 drop-shadow-sm">
          {hoveredButton === "light" ? "Tema Claro (Light)" : "Tema Escuro (Dark)"}
        </span>
        {((hoveredButton === "light" && theme === "light") || (hoveredButton === "dark" && theme === "dark")) && (
          <span className={cn(
            "px-1.5 py-0.2 rounded text-[8px] font-mono font-bold border",
            theme === "light" 
              ? "bg-amber-500/20 text-amber-300 border-amber-400/40 shadow-[0_0_6px_rgba(245,158,11,0.3)]" 
              : "bg-cyan-500/20 text-cyan-300 border-cyan-400/40 shadow-[0_0_6px_rgba(6,182,212,0.3)]"
          )}>
            ATIVO
          </span>
        )}
      </PortalTooltip>
    </>
  );
}

function NavItem({ 
  icon, 
  label, 
  active, 
  onClick, 
  collapsed 
}: { 
  icon: any; 
  label: string; 
  active: boolean; 
  onClick: () => void; 
  collapsed: boolean;
}) {
  const [isHovered, setIsHovered] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const buttonRef = useRef<HTMLButtonElement>(null);

  const handleMouseEnter = () => {
    if (buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setCoords({
        top: rect.top + rect.height / 2,
        left: rect.right + 12
      });
    }
    setIsHovered(true);
  };

  const handleMouseLeave = () => {
    setIsHovered(false);
  };

  useEffect(() => {
    if (!isHovered || !collapsed) return;
    const updateCoords = () => {
      if (buttonRef.current) {
        const rect = buttonRef.current.getBoundingClientRect();
        setCoords({
          top: rect.top + rect.height / 2,
          left: rect.right + 12
        });
      }
    };
    window.addEventListener("scroll", updateCoords, true);
    return () => window.removeEventListener("scroll", updateCoords, true);
  }, [isHovered, collapsed]);

  return (
    <>
      <motion.button 
        ref={buttonRef}
        type="button"
        onClick={onClick}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        whileHover={!active ? { y: -1, transition: { duration: 0.15 } } : {}}
        whileTap={{ scale: 0.965, y: 3 }}
        animate={{
          y: active ? 2 : 0,
          scale: active ? 0.99 : 1,
        }}
        transition={{ type: "spring", stiffness: 450, damping: 26, mass: 0.7 }}
        className={cn(
          "transition-colors duration-200 relative group cursor-pointer select-none outline-none overflow-hidden shrink-0 notranslate",
          collapsed
            ? "w-11 h-11 min-h-[44px] min-w-[44px] rounded-2xl flex items-center justify-center mx-auto"
            : "w-full min-h-[48px] flex items-center gap-3 px-3.5 py-2.5 rounded-2xl text-left",
          active 
            ? collapsed
              ? "bg-gradient-to-b from-slate-950 via-slate-900 to-cyan-950/80 text-white border-2 border-cyan-400 shadow-[inset_0_4px_10px_rgba(0,0,0,0.92),inset_0_-1px_2px_rgba(255,255,255,0.18),0_0_22px_rgba(6,182,212,0.6)]"
              : "bg-gradient-to-b from-slate-950 via-slate-900/95 to-slate-950 dark:from-black/90 dark:via-slate-950/95 dark:to-cyan-950/40 text-white border border-cyan-400/90 shadow-[inset_0_5px_12px_rgba(0,0,0,0.94),inset_0_-1px_2px_rgba(255,255,255,0.16),0_0_24px_rgba(6,182,212,0.45)] font-black"
            : "bg-gradient-to-b from-slate-800/30 via-slate-900/20 to-slate-950/40 text-slate-600 dark:text-slate-400 border border-slate-700/40 dark:border-slate-800/80 shadow-[0_3px_6px_-1px_rgba(0,0,0,0.35),inset_0_1px_1px_rgba(255,255,255,0.08)] hover:text-slate-900 dark:hover:text-cyan-300 hover:border-cyan-500/60 hover:from-slate-800/70 hover:to-slate-900/90 hover:shadow-[0_6px_16px_-2px_rgba(6,182,212,0.3),inset_0_1px_1px_rgba(255,255,255,0.18)]"
        )}
        translate="no"
      >
        {/* Animação 3D do Feixe Laser Neon passando pelo botão */}
        <NeonLaserBeam 
          active={active} 
          showOnHover={true}
          roundedClass="rounded-2xl" 
          accentColor="cyan" 
        />

        {/* Efeito 3D: Cavidade / Sombra Interna Superior de Encaixe Rebaixado quando Apertado */}
        {active && (
          <div className="absolute inset-x-2 top-0 h-[4px] bg-gradient-to-b from-black/85 via-black/40 to-transparent rounded-t-xl pointer-events-none z-10" />
        )}

        {/* Efeito 3D: Bisel Especular Luminoso no Topo quando Desapertado (Tecla em Relevo) */}
        {!active && (
          <div className="absolute inset-x-2 top-0 h-[1px] bg-gradient-to-r from-transparent via-white/25 to-transparent pointer-events-none z-10" />
        )}

        {/* Efeito 3D: Reflexo de Chanfro Inferior */}
        <div className="absolute inset-x-4 bottom-0 h-[1px] bg-gradient-to-r from-transparent via-cyan-400/25 to-transparent pointer-events-none z-10" />

        {/* Indicador Neon ativo no modo recolhido e expandido com Entalhe 3D */}
        {active && (
          <span className="absolute -left-1 top-1/2 -translate-y-1/2 w-1.5 h-6 bg-gradient-to-b from-cyan-300 via-cyan-400 to-cyan-500 rounded-r-full shadow-[0_0_12px_#22d3ee,inset_0_1px_1px_#ffffff] z-20 border-r border-y border-cyan-200/50" />
        )}

        <div className={cn(
          "shrink-0 flex items-center justify-center transition-all duration-300 relative z-10", 
          active 
            ? "scale-105 text-cyan-300 drop-shadow-[0_0_10px_rgba(34,211,238,0.95)] translate-y-[0.5px]" 
            : "group-hover:scale-110 group-hover:text-cyan-400 dark:group-hover:text-cyan-300 group-hover:drop-shadow-[0_0_6px_rgba(34,211,238,0.6)]"
        )}>
          {icon}
        </div>

        {!collapsed && (
          <span 
            translate="no"
            className={cn(
              "font-bold text-[13.5px] tracking-tight whitespace-nowrap overflow-hidden text-ellipsis flex-1 transition-all duration-200 relative z-10 notranslate",
              active 
                ? "text-white font-black drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)] translate-y-[0.5px]" 
                : "group-hover:text-slate-900 dark:group-hover:text-white"
            )}
          >
            {label}
          </span>
        )}

        {/* Indicador lateral no modo expandido (Beacon + Chevron Neon) */}
        {!collapsed && (
          active ? (
            <motion.div 
              layoutId="active-indicator"
              className="ml-auto flex items-center gap-1.5 shrink-0 relative z-10"
            >
              <span className="w-2 h-2 rounded-full bg-cyan-400 shadow-[0_0_8px_#22d3ee,0_0_16px_rgba(34,211,238,0.8)] animate-pulse" />
              <ChevronRight size={14} className="text-cyan-400 drop-shadow-[0_0_6px_rgba(6,182,212,0.8)]" />
            </motion.div>
          ) : (
            <ChevronRight size={14} className="ml-auto text-slate-400 dark:text-slate-600 opacity-0 group-hover:opacity-100 group-hover:text-cyan-400 group-hover:translate-x-0.5 transition-all duration-200 shrink-0 relative z-10" />
          )
        )}
      </motion.button>

      {/* Tooltip 3D Holográfico via Portal quando RECOLHIDO */}
      {collapsed && (
        <PortalTooltip isOpen={isHovered} coords={coords}>
          <span className={cn("w-1.5 h-1.5 rounded-full shadow-[0_0_6px]", active ? "bg-cyan-400 shadow-cyan-400 animate-pulse" : "bg-slate-400")} />
          <span translate="no" className="text-xs font-display font-black tracking-wide uppercase text-slate-100 drop-shadow-sm notranslate">
            {label}
          </span>
          {active && (
            <span className="px-1.5 py-0.2 rounded text-[8px] font-mono font-bold bg-cyan-500/25 text-cyan-300 border border-cyan-400/40 shadow-[0_0_6px_rgba(6,182,212,0.3)]">
              ATIVO
            </span>
          )}
        </PortalTooltip>
      )}
    </>
  );
}

function NotificationPopover({ expiredDocs, onClose }: { expiredDocs: any[], onClose: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 10, scale: 0.95 }}
      className="absolute right-0 mt-4 w-96 glass rounded-[2rem] shadow-2xl z-50 overflow-hidden border border-slate-200/60 dark:border-slate-800 backdrop-blur-2xl bg-white/95 dark:bg-slate-900/95 text-slate-900 dark:text-slate-100"
    >
      <div className="p-6 border-b border-slate-200/50 dark:border-slate-800 flex items-center justify-between bg-slate-50/80 dark:bg-slate-800/80">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center text-white shadow-lg shadow-blue-500/20">
            <Bell size={16} />
          </div>
          <h3 className="font-display font-black text-slate-900 dark:text-white tracking-tight">Notificações</h3>
        </div>
        <span className="bg-red-500 text-white text-[10px] font-black px-2.5 py-1 rounded-full uppercase shadow-sm">
          {expiredDocs.length} Pendências
        </span>
      </div>
      
      <div className="max-h-[450px] overflow-y-auto p-3 space-y-2 scrollbar-hide">
        {expiredDocs.length === 0 ? (
          <div className="py-16 flex flex-col items-center justify-center text-slate-400 dark:text-slate-300">
            <div className="w-16 h-16 rounded-full bg-green-50 dark:bg-green-950/60 flex items-center justify-center text-green-500 mb-4 opacity-80">
              <CheckCircle2 size={32} />
            </div>
            <p className="text-sm font-black uppercase tracking-widest opacity-80">Tudo em dia!</p>
          </div>
        ) : (
          expiredDocs.map((doc, idx) => (
            <div 
              key={idx}
              className="p-4 rounded-2xl bg-white/80 dark:bg-slate-800/60 hover:bg-white dark:hover:bg-slate-800 transition-all border border-slate-200/60 dark:border-slate-700/60 hover:border-blue-300 hover:shadow-lg group cursor-pointer"
            >
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-2xl bg-red-500 flex items-center justify-center text-white shrink-0 group-hover:scale-110 group-hover:rotate-3 transition-transform shadow-md shadow-red-500/20">
                  <FileWarning size={22} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-black text-slate-900 dark:text-white text-base tracking-tight">{doc.plate}</span>
                    <span className="text-[10px] font-black text-red-600 dark:text-red-300 bg-red-50 dark:bg-red-950/80 px-2 py-0.5 rounded-full uppercase tracking-wider">{doc.type}</span>
                  </div>
                  <p className="text-xs font-bold text-slate-600 dark:text-slate-300 truncate mb-2">{doc.driver}</p>
                  <div className="flex items-center gap-1.5 text-[10px] font-black text-slate-500 dark:text-slate-300 uppercase tracking-widest">
                    <Clock size={12} className="text-red-500 dark:text-red-400" />
                    <span>Vencido em {doc.expiryDate}</span>
                  </div>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
      
      {expiredDocs.length > 0 && (
        <div className="p-6 bg-slate-50/80 dark:bg-slate-800/80 border-t border-slate-200/50 dark:border-slate-800">
          <button 
            onClick={onClose}
            className="w-full py-3.5 bg-slate-900 text-white dark:bg-blue-600 dark:hover:bg-blue-700 rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-slate-800 transition-all shadow-xl shadow-slate-200/30 dark:shadow-blue-900/40 active:scale-95"
          >
            Fechar Notificações
          </button>
        </div>
      )}
    </motion.div>
  );
}

function StatCard({ title, value, icon, trend, variant = "default" }: { title: string, value: number | string, icon: any, trend?: string, variant?: "default" | "warning" | "danger" }) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [rotate, setRotate] = useState({ x: 0, y: 0 });
  const [isHovered, setIsHovered] = useState(false);
  const [glare, setGlare] = useState({ x: 50, y: 50, opacity: 0 });

  const colors = {
    default: "bg-blue-500/90 text-white shadow-blue-500/30 border border-blue-400/30",
    warning: "bg-amber-500/90 text-white shadow-amber-500/30 border border-amber-400/30",
    danger: "bg-rose-500/90 text-white shadow-rose-500/30 border border-rose-400/30"
  };

  const borderGlows = {
    default: "border-slate-200/80 dark:border-cyan-500/30 hover:border-cyan-400/80 dark:hover:shadow-[0_15px_35px_rgba(6,182,212,0.22)]",
    warning: "border-slate-200/80 dark:border-amber-500/30 hover:border-amber-400/80 dark:hover:shadow-[0_15px_35px_rgba(245,158,11,0.22)]",
    danger: "border-slate-200/80 dark:border-rose-500/30 hover:border-rose-400/80 dark:hover:shadow-[0_15px_35px_rgba(244,63,94,0.22)]"
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!cardRef.current) return;
    const rect = cardRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;
    const rotateX = ((y - centerY) / centerY) * -9;
    const rotateY = ((x - centerX) / centerX) * 9;
    setRotate({ x: rotateX, y: rotateY });
    setGlare({
      x: (x / rect.width) * 100,
      y: (y / rect.height) * 100,
      opacity: 0.65
    });
  };

  return (
    <div style={{ perspective: 1000 }} className="relative select-none">
      <div 
        ref={cardRef}
        onMouseMove={handleMouseMove}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => {
          setIsHovered(false);
          setRotate({ x: 0, y: 0 });
          setGlare(prev => ({ ...prev, opacity: 0 }));
        }}
        style={{
          transform: isHovered
            ? `perspective(800px) rotateX(${rotate.x}deg) rotateY(${rotate.y}deg) translateZ(14px) translateY(-5px) scale(1.02)`
            : 'perspective(800px) rotateX(0deg) rotateY(0deg) translateZ(0px) translateY(0px)',
          transition: isHovered ? 'transform 0.12s ease-out' : 'transform 0.5s cubic-bezier(0.2, 0.8, 0.2, 1)',
          transformStyle: 'preserve-3d'
        }}
        className={cn(
          "glass-card p-6 rounded-3xl relative overflow-hidden group border dark:bg-slate-900/95 transition-all duration-300",
          borderGlows[variant]
        )}
      >
        {/* Dynamic Specular Glare */}
        <div
          style={{
            background: `radial-gradient(circle at ${glare.x}% ${glare.y}%, rgba(255,255,255,0.2) 0%, transparent 65%)`,
            opacity: glare.opacity
          }}
          className="absolute inset-0 pointer-events-none transition-opacity duration-200 z-10"
        />

        {/* Diagonal Translucent Light Streak */}
        <div className="absolute -top-16 -right-16 w-36 h-48 bg-gradient-to-b from-white/10 via-white/2 to-transparent rotate-25 pointer-events-none opacity-40 group-hover:opacity-80 transition-opacity" />

        <div className="flex items-start justify-between mb-6 relative z-20">
          <div className={cn("p-3.5 rounded-2xl shadow-lg transition-transform duration-500 group-hover:scale-110 group-hover:rotate-3", colors[variant])}>
            {icon}
          </div>
          {trend && (
            <span className="text-[10px] font-black text-green-600 dark:text-cyan-300 bg-green-100 dark:bg-cyan-950/80 border border-green-200 dark:border-cyan-500/40 px-2.5 py-1 rounded-full uppercase tracking-wider shadow-sm">
              {trend}
            </span>
          )}
        </div>
        <div className="relative z-20">
          <p className="text-slate-500 dark:text-slate-300 text-xs font-black uppercase tracking-widest mb-1">{title}</p>
          <h4 className="text-4xl font-display font-black text-slate-900 dark:text-white tracking-tight">{value}</h4>
        </div>
        
        {/* Subtle background accent glow */}
        <div className={cn("absolute -right-4 -bottom-4 w-28 h-28 rounded-full opacity-15 blur-2xl pointer-events-none", variant === 'default' ? 'bg-cyan-500' : variant === 'warning' ? 'bg-amber-500' : 'bg-red-500')} />
      </div>
    </div>
  );
}
