import React, { useState, useMemo, useEffect } from 'react';
import { 
  FileSignature, Plus, Edit3, Trash2, CheckCircle2, AlertTriangle, 
  Clock, UserCheck, Calendar, Search, Filter, Download, X, 
  ShieldCheck, AlertOctagon, AlertCircle, Truck, Building2, RefreshCw, MessageSquare,
  FileSpreadsheet, ExternalLink, Table, Copy, Layers, Database, LayoutGrid, PenLine,
  Warehouse, CalendarX, RotateCcw, FileText, ChevronLeft, ChevronRight, Printer, History,
  Upload, FileUp, Check, HardDrive
} from 'lucide-react';
import { Vehicle, LicenseJustification, JustificationHistoryItem, normalizeDocKey } from '../types';
import { cn } from "@/src/lib/utils";
import { Card3D } from './Card3D';
import { MultiSelectFilter, MultiSelectOption } from './MultiSelectFilter';
import { PendingStatusSelector } from './PendingStatusSelector';
import { VehicleJustificationHistoryModal } from './VehicleJustificationHistoryModal';
import { AppSafeBoundary as ErrorBoundary } from './AppSafeBoundary';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { format } from 'date-fns';

const formatSafeDate = (val: any, formatStr: string = "dd/MM/yyyy HH:mm:ss"): string => {
  if (!val) return "-";
  try {
    if (typeof val === "string") {
      if (val.includes("/") && val.includes(":")) return val;
      const d = new Date(val);
      if (!isNaN(d.getTime())) return format(d, formatStr);
      return val;
    }
    if (typeof val === "number") {
      const d = new Date(val);
      if (!isNaN(d.getTime())) return format(d, formatStr);
    }
    if (val instanceof Date) {
      if (!isNaN(val.getTime())) return format(val, formatStr);
    }
  } catch (_) {}
  return String(val || "-");
};

interface Props {
  baseFleet: Vehicle[];
  justifications: LicenseJustification[];
  onSaveJustification: (justification: LicenseJustification) => Promise<void>;
  onDeleteJustification: (id: string) => Promise<void>;
  onBatchRestoreJustifications?: (restoredItems: LicenseJustification[], overwrite?: boolean) => Promise<void>;
  renderModernPDFHeader: (doc: any, options: any) => void;
  loadPDFLogo: () => Promise<HTMLImageElement | null>;
  includePdfSummaries: boolean;
  theme?: 'light' | 'dark';
  isGoogleConnected?: boolean;
  onConnectGoogle?: () => void;
  historyItems?: JustificationHistoryItem[];
  onAddHistoryItem?: (item: JustificationHistoryItem) => Promise<void>;
}

const DEFAULT_AUTH_REASONS = [
  "Parado no Garagem",
  "Aguardando Autorização da Letícia",
  "Aguardando Autorização da Esther",
  "Aguardando liberação orçamentária / diretoria",
  "Aguardando autorização da gerência"
];

const DEFAULT_OPS_REASONS = [
  "Sem Previsão de Renovação",
  "Não irá pagar no prazo (apenas no próximo ano)",
  "Aguardando agendamento / vistoria no DER",
  "Aguardando laudo de inspeção / tacógrafo",
  "Veículo parado em manutenção / reforma",
  "Aguardando emissão do órgão competente",
  "Em processo de transferência de propriedade",
  "Documentação em trâmite no despachante",
  "Aguardando boleto / guia de pagamento",
  "Em análise pela Controladoria / Financeiro",
  "Aguardando comprovante de quitação",
  "Multas em recurso / contestação",
  "Veículo em processo de desmobilização / venda"
];

const COMMON_REASONS = [
  ...DEFAULT_AUTH_REASONS,
  ...DEFAULT_OPS_REASONS
];

const COMMON_AUTHORIZERS = [
  "Letícia",
  "Esther",
  "Diretoria Executiva",
  "Gerência de Operações",
  "Coordenação de Frota",
  "Supervisão de Manutenção",
  "Controladoria / Financeiro",
  "Comitê de Custos & Licenças"
];

const COMMON_FORECASTS = [
  "Apenas no próximo ano (exercício seguinte)",
  "Regularização até o fim do mês",
  "Previsão em até 15 dias",
  "Previsão em até 30 dias",
  "Previsão em até 60 dias",
  "Aguardando retorno do órgão regulador",
  "Sem previsão de pagamento imediato"
];

export type JustificationSubCategory = 'GARAGEM' | 'SEM_PREVISAO' | 'POSTPONED' | null;

export interface JustificationCategoryInfo {
  key: JustificationSubCategory;
  label: string;
  shortLabel: string;
  badgeClass: string;
  pdfTag: string;
  pdfColor: [number, number, number];
}

export const getJustificationCategoryInfo = (
  reason?: string | null,
  forecast?: string | null,
  observations?: string | null
): JustificationCategoryInfo => {
  const r = (reason || "").toLowerCase();
  const f = (forecast || "").toLowerCase();
  const o = (observations || "").toLowerCase();
  const full = `${r} ${f} ${o}`;

  if (full.includes("parado no garagem") || full.includes("parado na garagem") || full.includes("garagem")) {
    return {
      key: 'GARAGEM',
      label: 'Parado no Garagem',
      shortLabel: 'Garagem',
      badgeClass: 'bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/70 dark:text-indigo-300 dark:border-indigo-800',
      pdfTag: '[PARADO NO GARAGEM]',
      pdfColor: [79, 70, 229]
    };
  }

  if (full.includes("sem previsão de renovação") || full.includes("sem previsao de renovacao") || full.includes("sem previsão") || full.includes("sem previsao")) {
    return {
      key: 'SEM_PREVISAO',
      label: 'Sem Previsão',
      shortLabel: 'Sem Previsão',
      badgeClass: 'bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950/70 dark:text-sky-300 dark:border-sky-800',
      pdfTag: '[SEM PREVISÃO]',
      pdfColor: [2, 132, 199]
    };
  }

  if (full.includes("próximo ano") || full.includes("proximo ano") || full.includes("próximo exercício") || full.includes("proximo exercicio")) {
    return {
      key: 'POSTPONED',
      label: 'Próx. Exercício',
      shortLabel: 'Próx. Exercício',
      badgeClass: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/70 dark:text-amber-300 dark:border-amber-800',
      pdfTag: '[PRÓX. EXERCÍCIO]',
      pdfColor: [217, 119, 6]
    };
  }

  return {
    key: null,
    label: '',
    shortLabel: '',
    badgeClass: '',
    pdfTag: '',
    pdfColor: [0, 0, 0]
  };
};

export const LicenseJustificationsTab: React.FC<Props> = ({
  baseFleet,
  justifications,
  onSaveJustification,
  onDeleteJustification,
  onBatchRestoreJustifications,
  renderModernPDFHeader,
  loadPDFLogo,
  includePdfSummaries,
  theme = 'dark',
  isGoogleConnected,
  onConnectGoogle,
  historyItems = [],
  onAddHistoryItem
}) => {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedPlates, setSelectedPlates] = useState<string[]>([]);
  const [selectedFleets, setSelectedFleets] = useState<string[]>([]);
  const [selectedOperations, setSelectedOperations] = useState<string[]>([]);
  const [selectedLicenses, setSelectedLicenses] = useState<string[]>([]);
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>([]);
  const [onlyWithJustification, setOnlyWithJustification] = useState<boolean | null>(null);
  const [cardFilter, setCardFilter] = useState<'ALL' | 'WITH_JUST' | 'PENDING' | 'POSTPONED' | 'GARAGEM' | 'SEM_PREVISAO'>('ALL');
  // Filtro rápido por Status Operacional (Cards da Imagem 2)
  const [statusCardFilter, setStatusCardFilter] = useState<"ALL" | "VENCIDO" | "CRITICO" | "ATENCAO" | "REGULAR">("ALL");
  const [viewMode, setViewMode] = useState<"table" | "cards">("table");

  // Histórico de justificativas por veículo
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
  const [historyTargetPlate, setHistoryTargetPlate] = useState<string | null>(null);

  // Combina o histórico persistido com as justificativas ativas para garantir visualização imediata
  const effectiveHistory = useMemo(() => {
    const list: JustificationHistoryItem[] = [...(historyItems || [])];
    const existingIds = new Set(list.map(i => i.justificationId).filter(Boolean));
    const existingPlateDoc = new Set(
      list.map(i => `${(i.plate || '').toUpperCase().trim()}#${(i.documentType || '').toUpperCase().trim()}`)
    );

    (justifications || []).forEach(j => {
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
  }, [historyItems, justifications]);

  const handleOpenHistory = (plate?: string | null) => {
    setHistoryTargetPlate(plate ? plate.toUpperCase().trim() : null);
    setIsHistoryModalOpen(true);
  };

  // Status considerados "Pendentes de Justificativa" (configurável pelo usuário)
  const [pendingStatuses, setPendingStatuses] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem("logifleet_lic_pending_statuses");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {}
    return ['VENCIDO', 'CRITICO'];
  });

  const handlePendingStatusesChange = (statuses: string[]) => {
    setPendingStatuses(statuses);
    try {
      localStorage.setItem("logifleet_lic_pending_statuses", JSON.stringify(statuses));
    } catch {}
  };

  const pendingStatusesLabel = useMemo(() => {
    const hasV = pendingStatuses.includes('VENCIDO');
    const hasC = pendingStatuses.includes('CRITICO');
    const hasA = pendingStatuses.includes('ATENCAO');
    const hasR = pendingStatuses.includes('REGULAR');

    if (hasV && !hasC && !hasA && !hasR) return "Apenas Vencidos";
    if (hasV && hasC && !hasA && !hasR) return "Vencidos + Críticos";
    if (hasV && hasC && hasA && !hasR) return "Venc. + Crít. + Atenção";
    if (hasV && hasC && hasA && hasR) return "Todos os Status";
    if (!hasV && hasC && !hasA && !hasR) return "Apenas Críticos";
    return `${pendingStatuses.length} Status`;
  }, [pendingStatuses]);

  // Flegue para selecionar se os cards de resumo devem ser impressos no PDF
  const [printCardsInPdf, setPrintCardsInPdf] = useState<boolean>(() => {
    const saved = localStorage.getItem("logifleet_lic_print_cards");
    if (saved !== null) return saved === "true";
    return includePdfSummaries ?? true;
  });

  const handleTogglePrintCards = (checked: boolean) => {
    setPrintCardsInPdf(checked);
    localStorage.setItem("logifleet_lic_print_cards", String(checked));
  };

  // Flegue para incluir documentos regulares (sem pendências) na visualização e no relatório PDF
  const [includeRegularDocs, setIncludeRegularDocs] = useState<boolean>(() => {
    const saved = localStorage.getItem("logifleet_lic_include_regular");
    return saved === "true";
  });

  const handleToggleIncludeRegular = (checked: boolean) => {
    setIncludeRegularDocs(checked);
    localStorage.setItem("logifleet_lic_include_regular", String(checked));
  };

  // Flegue para incluir ou isolar justificativas de todas as estações de trabalho sincronizadas
  const [includeAllStations, setIncludeAllStations] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem("uni_lic_include_all_stations_v1");
      return saved !== null ? JSON.parse(saved) : false;
    } catch {
      return false;
    }
  });

  const handleToggleIncludeAllStations = (val: boolean) => {
    setIncludeAllStations(val);
    try {
      localStorage.setItem("uni_lic_include_all_stations_v1", JSON.stringify(val));
    } catch {}
  };

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<Partial<LicenseJustification> | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccessMsg, setSaveSuccessMsg] = useState<string | null>(null);

  // Motivos personalizados, filtros e gerenciamento no modal
  const [reasonTabFilter, setReasonTabFilter] = useState<"ALL" | "AUTH" | "OPS">("ALL");
  const [isAddingReason, setIsAddingReason] = useState(false);
  const [newReasonText, setNewReasonText] = useState("");
  const [newReasonCategory, setNewReasonCategory] = useState<"AUTH" | "OPS">("AUTH");

  // Listas ativas de motivos (todas as opções podem ser excluídas, adicionadas e restauradas)
  const [reasonsAuth, setReasonsAuth] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem("uni_lic_reasons_auth_v3");
      if (saved) return JSON.parse(saved);
      const oldCustom = localStorage.getItem("uni_custom_reasons_auth");
      const custom = oldCustom ? JSON.parse(oldCustom) : [];
      return Array.from(new Set([...DEFAULT_AUTH_REASONS, ...custom]));
    } catch {
      return DEFAULT_AUTH_REASONS;
    }
  });

  const [reasonsOps, setReasonsOps] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem("uni_lic_reasons_ops_v3");
      if (saved) return JSON.parse(saved);
      const oldCustom = localStorage.getItem("uni_custom_reasons_ops");
      const custom = oldCustom ? JSON.parse(oldCustom) : [];
      return Array.from(new Set([...DEFAULT_OPS_REASONS, ...custom]));
    } catch {
      return DEFAULT_OPS_REASONS;
    }
  });

  const [authorizersList, setAuthorizersList] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem("uni_lic_authorizers_v3");
      return saved ? JSON.parse(saved) : COMMON_AUTHORIZERS;
    } catch {
      return COMMON_AUTHORIZERS;
    }
  });

  const [forecastsList, setForecastsList] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem("uni_lic_forecasts_v3");
      return saved ? JSON.parse(saved) : COMMON_FORECASTS;
    } catch {
      return COMMON_FORECASTS;
    }
  });

  // Modal de Restauração de Justificativas (Excel e Backups do Servidor)
  const [isRestoreModalOpen, setIsRestoreModalOpen] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [restoreTab, setRestoreTab] = useState<'file' | 'server'>('file');
  const [restoreMode, setRestoreMode] = useState<'merge' | 'overwrite'>('merge');
  const [selectedBackupFile, setSelectedBackupFile] = useState<File | null>(null);
  const [parsedRestorationData, setParsedRestorationData] = useState<{
    items: LicenseJustification[];
    totalRows: number;
    previewItems: any[];
    sheetNames: string[];
  } | null>(null);
  const [restoreFeedback, setRestoreFeedback] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);
  const [serverBackups, setServerBackups] = useState<any[]>([]);
  const [isLoadingServerBackups, setIsLoadingServerBackups] = useState(false);
  const [serverBackupsError, setServerBackupsError] = useState<string | null>(null);
  const [restoringFilename, setRestoringFilename] = useState<string | null>(null);

  const fetchServerBackups = async () => {
    setIsLoadingServerBackups(true);
    setServerBackupsError(null);
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 12000);
      const res = await fetch("/api/justifications/backups", { signal: controller.signal });
      clearTimeout(timeoutId);
      if (!res.ok) {
        throw new Error(`O servidor retornou status ${res.status} ao consultar backups.`);
      }
      const data = await res.json();
      if (Array.isArray(data?.backups)) {
        setServerBackups(data.backups);
      } else {
        setServerBackups([]);
      }
    } catch (e: any) {
      console.warn("Erro ao buscar backups do servidor:", e);
      const msg = e?.name === 'AbortError'
        ? "Tempo limite esgotado ao consultar os backups do servidor. Tente novamente."
        : (e?.message || "Não foi possível conectar ao servidor para carregar backups.");
      setServerBackupsError(msg);
      setServerBackups([]);
    } finally {
      setIsLoadingServerBackups(false);
    }
  };

  useEffect(() => {
    fetchServerBackups();
  }, []);

  // Safe Escape key listener to dismiss restore modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isRestoreModalOpen && !isRestoring) {
        setIsRestoreModalOpen(false);
        setRestoreFeedback(null);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isRestoreModalOpen, isRestoring]);

  const parseExcelOrBackupFile = (file: File): Promise<{
    items: LicenseJustification[];
    totalRows: number;
    previewItems: any[];
    sheetNames: string[];
  }> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      if (file.name.endsWith('.json')) {
        reader.onload = (e) => {
          try {
            const text = e.target?.result as string;
            const parsed = JSON.parse(text);
            const rawItems = Array.isArray(parsed?.items) ? parsed.items : (Array.isArray(parsed) ? parsed : []);
            const valid = rawItems
              .filter((i: any) => i.plate && (i.reason || i.authorizedBy || i.actionForecast || i.observations))
              .map((i: any) => ({
                id: i.id || `just_lic_${(i.plate || '').toUpperCase().trim().replace(/[^a-zA-Z0-9]/g, '')}_${(i.documentType || 'geral').toLowerCase().replace(/[^a-zA-Z0-9]/g, '')}_${(i.status || 'vencido').toLowerCase().replace(/[^a-zA-Z0-9]/g, '')}_${Date.now()}`,
                plate: String(i.plate).toUpperCase().trim(),
                fleet: String(i.fleet || '-').trim(),
                operation: formatOperationName(i.operation || '-'),
                documentType: String(i.documentType || 'Licença').trim(),
                status: String(i.status || 'VENCIDO').toUpperCase().trim(),
                reason: String(i.reason || '').trim(),
                authorizedBy: String(i.authorizedBy || '').trim(),
                actionForecast: String(i.actionForecast || '').trim(),
                observations: String(i.observations || '').trim(),
                updatedAt: i.updatedAt || format(new Date(), 'dd/MM/yyyy HH:mm'),
                updatedBy: 'Restauração Backup'
              }));
            resolve({
              items: valid,
              totalRows: rawItems.length,
              previewItems: valid.slice(0, 50),
              sheetNames: ['JSON Backup']
            });
          } catch (err: any) {
            reject(new Error('Arquivo JSON inválido: ' + err.message));
          }
        };
        reader.readAsText(file);
        return;
      }

      reader.onload = (e) => {
        try {
          const data = new Uint8Array(e.target?.result as ArrayBuffer);
          const workbook = XLSX.read(data, { type: 'array' });
          const sheetNames = workbook.SheetNames;
          if (!sheetNames || sheetNames.length === 0) {
            throw new Error('Planilha sem abas válidas');
          }

          let allRows: any[] = [];
          sheetNames.forEach(sName => {
            const sheet = workbook.Sheets[sName];
            const rows = XLSX.utils.sheet_to_json(sheet);
            if (Array.isArray(rows)) {
              allRows = allRows.concat(rows);
            }
          });

          const findVal = (row: any, keys: string[]) => {
            const rowEntries = Object.entries(row);
            for (const key of keys) {
              const keyLower = key.toLowerCase();
              const found = rowEntries.find(([k]) => k.toLowerCase().trim() === keyLower || k.toLowerCase().trim().includes(keyLower));
              if (found && found[1] !== undefined && found[1] !== null && String(found[1]).trim() !== '-' && String(found[1]).trim() !== '') {
                return String(found[1]).trim();
              }
            }
            return '';
          };

          const extractedJusts: LicenseJustification[] = [];

          allRows.forEach((row, idx) => {
            const rawPlate = findVal(row, ['placa', 'plate', 'veículo', 'veiculo']);
            if (!rawPlate) return;
            const plate = rawPlate.toUpperCase().trim();

            const rawReason = findVal(row, [
              'motivo da pendência', 'motivo da pendencia', 'motivo / justificativa',
              'por que está vencido? (motivo)', 'por que está vencido', 'motivo', 'justificativa'
            ]);
            const rawAuth = findVal(row, [
              'quem autorizou', 'autorizado por', 'quem autorizou?', 'autorizou', 'autorizado'
            ]);
            const rawForecast = findVal(row, [
              'previsão / condição', 'previsão', 'previsao', 'condição', 'prazo'
            ]);
            const rawObs = findVal(row, [
              'observações detalhadas', 'observacoes detalhadas', 'observações', 'observacoes', 'obs'
            ]);

            const hasJustificationData = 
              (rawReason && rawReason !== 'Pendente de justificativa' && !rawReason.includes('Regular / Sem')) ||
              (rawAuth && rawAuth !== '-') ||
              (rawForecast && rawForecast !== '-' && rawForecast !== 'Não informada' && rawForecast !== 'Em dia') ||
              (rawObs && rawObs !== '-' && !rawObs.includes('sem pendências'));

            if (hasJustificationData) {
              const fleet = findVal(row, ['frota', 'fleet', 'prefixo']);
              const operation = findVal(row, ['operação', 'operacao', 'operation']);
              const documentType = findVal(row, ['licença / documento', 'licença', 'licenca', 'documento', 'documentType', 'document', 'descrição', 'tipo']) || 'Licença Geral';
              const status = (findVal(row, ['status', 'situação', 'situacao']) || 'VENCIDO').toUpperCase();
              const updatedAt = findVal(row, ['data de atualização', 'data de atualizacao', 'data registro', 'atualizado']) || format(new Date(), 'dd/MM/yyyy HH:mm');

              const cleanPlate = plate.replace(/[^a-zA-Z0-9]/g, '');
              const cleanDoc = documentType.toLowerCase().replace(/[^a-zA-Z0-9]/g, '');
              const cleanStatus = status.toLowerCase().replace(/[^a-zA-Z0-9]/g, '');

              extractedJusts.push({
                id: `just_lic_excel_${cleanPlate}_${cleanDoc}_${cleanStatus}_${Date.now()}_${idx}`,
                plate,
                fleet: fleet || '-',
                operation: formatOperationName(operation || '-'),
                documentType,
                status,
                reason: rawReason || '',
                authorizedBy: rawAuth || '',
                actionForecast: rawForecast || '',
                observations: rawObs || '',
                updatedAt,
                updatedBy: 'Restauração Excel Licenças'
              });
            }
          });

          resolve({
            items: extractedJusts,
            totalRows: allRows.length,
            previewItems: extractedJusts.slice(0, 50),
            sheetNames
          });
        } catch (err: any) {
          reject(new Error('Erro ao processar planilha: ' + err.message));
        }
      };

      reader.readAsArrayBuffer(file);
    });
  };

  const handleFileSelected = async (file: File) => {
    setSelectedBackupFile(file);
    setRestoreFeedback(null);
    try {
      const parsed = await parseExcelOrBackupFile(file);
      setParsedRestorationData(parsed);
      if (parsed.items.length === 0) {
        setRestoreFeedback({
          type: 'error',
          message: `Arquivo lido (${parsed.totalRows} linhas), mas nenhuma justificativa com motivo/autorização preenchido foi identificada.`
        });
      } else {
        setRestoreFeedback({
          type: 'info',
          message: `${parsed.items.length} justificativas válidas identificadas em ${parsed.totalRows} linhas lidas da planilha!`
        });
      }
    } catch (err: any) {
      setParsedRestorationData(null);
      setRestoreFeedback({
        type: 'error',
        message: err.message || 'Erro ao ler arquivo selecionado.'
      });
    }
  };

  const handleConfirmRestore = async () => {
    if (!parsedRestorationData || !Array.isArray(parsedRestorationData.items) || parsedRestorationData.items.length === 0) return;
    setIsRestoring(true);
    setRestoreFeedback({
      type: 'info',
      message: 'Validando e aplicando registros de justificativas no sistema...'
    });

    try {
      const rawItems = parsedRestorationData.items;
      const sanitizedItems: LicenseJustification[] = rawItems
        .filter((it: any) => it && typeof it === 'object')
        .map((it: any) => ({
          id: String(it.id || `just-lic-import-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`),
          plate: String(it.plate || '').toUpperCase().trim(),
          fleet: String(it.fleet || '-').trim(),
          operation: String(it.operation || '-').trim(),
          documentType: String(it.documentType || 'Geral').trim(),
          status: String(it.status || 'ATENCAO').toUpperCase().trim(),
          reason: String(it.reason || '-').trim(),
          authorizedBy: String(it.authorizedBy || '-').trim(),
          actionForecast: String(it.actionForecast || '-').trim(),
          observations: String(it.observations || '').trim(),
          updatedAt: String(it.updatedAt || format(new Date(), "dd/MM/yyyy HH:mm")).trim()
        }))
        .filter(it => it.plate.length > 0);

      if (sanitizedItems.length === 0) {
        throw new Error('Nenhuma justificativa com placa válida foi encontrada no arquivo.');
      }

      if (onBatchRestoreJustifications) {
        await onBatchRestoreJustifications(sanitizedItems, restoreMode === 'overwrite');
      } else {
        for (const item of sanitizedItems) {
          await onSaveJustification(item);
        }
      }

      setSaveSuccessMsg(`Backup restaurado com sucesso! ${sanitizedItems.length} justificativas de licenças sincronizadas.`);
      setTimeout(() => setSaveSuccessMsg(null), 5000);
      setIsRestoreModalOpen(false);
      setParsedRestorationData(null);
      setSelectedBackupFile(null);
      setRestoreFeedback(null);
    } catch (err: any) {
      console.error("Erro na restauração de planilha licenças:", err);
      setRestoreFeedback({
        type: 'error',
        message: 'Erro ao restaurar justificativas: ' + (err?.message || String(err))
      });
    } finally {
      setIsRestoring(false);
    }
  };

  const handleRestoreFromSnapshot = async (filename: string) => {
    if (!filename) {
      setRestoreFeedback({
        type: 'error',
        message: 'Nenhum arquivo de backup especificado para restauração.'
      });
      return;
    }
    setIsRestoring(true);
    setRestoringFilename(filename);
    setRestoreFeedback({
      type: 'info',
      message: `Carregando e validando dados do ponto de restauração "${filename}"...`
    });

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 20000);

      const res = await fetch("/api/justifications/restore-snapshot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename }),
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      if (!res.ok) {
        let errorMsg = `Falha ao restaurar ponto de backup do servidor (código ${res.status}).`;
        try {
          const errJson = await res.json();
          if (errJson?.error) {
            errorMsg = errJson.error;
          }
        } catch (_) {}

        if (res.status === 404) {
          errorMsg = `O ponto de backup "${filename}" não foi encontrado no servidor. Tente atualizar a lista ou usar a importação de planilha Excel.`;
        } else if (res.status === 400) {
          errorMsg = `O arquivo de backup "${filename}" está corrompido ou contém formato incompatível.`;
        } else if (res.status >= 500) {
          errorMsg = `Instabilidade no servidor ao restaurar "${filename}". Verifique o arquivo e tente novamente.`;
        }
        throw new Error(errorMsg);
      }

      const data = await res.json();
      const rawItems = Array.isArray(data?.items) ? data.items : [];

      if (rawItems.length === 0) {
        throw new Error(`O ponto de backup "${filename}" foi localizado, mas não contém justificativas válidas para restauração.`);
      }

      const sanitizedItems: LicenseJustification[] = rawItems
        .filter((it: any) => it && typeof it === 'object')
        .map((it: any) => ({
          id: String(it.id || `just-lic-snap-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`),
          plate: String(it.plate || '').toUpperCase().trim(),
          fleet: String(it.fleet || '-').trim(),
          operation: String(it.operation || '-').trim(),
          documentType: String(it.documentType || 'Geral').trim(),
          status: String(it.status || 'ATENCAO').toUpperCase().trim(),
          reason: String(it.reason || '-').trim(),
          authorizedBy: String(it.authorizedBy || '-').trim(),
          actionForecast: String(it.actionForecast || '-').trim(),
          observations: String(it.observations || '').trim(),
          updatedAt: String(it.updatedAt || formatSafeDate(new Date(), "dd/MM/yyyy HH:mm")).trim()
        }))
        .filter(it => it.plate.length > 0);

      if (sanitizedItems.length === 0) {
        throw new Error(`Nenhuma justificativa com placa válida identificada no ponto de restauração "${filename}".`);
      }

      if (onBatchRestoreJustifications) {
        await onBatchRestoreJustifications(sanitizedItems, restoreMode === 'overwrite');
      } else {
        for (const item of sanitizedItems) {
          await onSaveJustification(item);
        }
      }

      setRestoreFeedback({
        type: 'success',
        message: `Ponto de backup "${filename}" restaurado com sucesso! ${sanitizedItems.length} registros recuperados.`
      });

      setSaveSuccessMsg(`Ponto de backup "${filename}" restaurado com sucesso! ${sanitizedItems.length} registros recuperados.`);
      setTimeout(() => setSaveSuccessMsg(null), 6000);

      setTimeout(() => {
        setIsRestoreModalOpen(false);
        setRestoreFeedback(null);
      }, 1000);
    } catch (err: any) {
      console.error("Erro ao restaurar do servidor:", err);
      let displayMsg = typeof err === 'string' ? err : (err?.message || 'Falha inesperada na comunicação ou processamento da restauração.');
      if (err?.name === 'AbortError') {
        displayMsg = `Tempo limite esgotado ao tentar restaurar "${filename}". Tente novamente.`;
      } else if (err instanceof TypeError && String(err.message).includes("fetch")) {
        displayMsg = "Não foi possível conectar ao servidor para restaurar o ponto de backup. Verifique a conexão.";
      }
      setRestoreFeedback({
        type: 'error',
        message: displayMsg
      });
    } finally {
      setIsRestoring(false);
      setRestoringFilename(null);
    }
  };

  const handleAddCustomReason = () => {
    const trimmed = newReasonText.trim();
    if (!trimmed) return;
    if (newReasonCategory === "AUTH") {
      if (!reasonsAuth.includes(trimmed)) {
        const updated = [...reasonsAuth, trimmed];
        setReasonsAuth(updated);
        try { localStorage.setItem("uni_lic_reasons_auth_v3", JSON.stringify(updated)); } catch {}
      }
    } else {
      if (!reasonsOps.includes(trimmed)) {
        const updated = [...reasonsOps, trimmed];
        setReasonsOps(updated);
        try { localStorage.setItem("uni_lic_reasons_ops_v3", JSON.stringify(updated)); } catch {}
      }
    }
    // Seleciona automaticamente para o item sendo editado
    setEditingItem(prev => prev ? ({ ...prev, reason: trimmed }) : prev);
    setNewReasonText("");
    setIsAddingReason(false);
  };

  const handleDeleteReason = (r: string, category: "AUTH" | "OPS", e: React.MouseEvent) => {
    e.stopPropagation();
    if (category === "AUTH") {
      const updated = reasonsAuth.filter(x => x !== r);
      setReasonsAuth(updated);
      try { localStorage.setItem("uni_lic_reasons_auth_v3", JSON.stringify(updated)); } catch {}
    } else {
      const updated = reasonsOps.filter(x => x !== r);
      setReasonsOps(updated);
      try { localStorage.setItem("uni_lic_reasons_ops_v3", JSON.stringify(updated)); } catch {}
    }
  };

  const handleResetReasons = (category?: "AUTH" | "OPS") => {
    if (category === "AUTH" || !category) {
      setReasonsAuth(DEFAULT_AUTH_REASONS);
      try { localStorage.setItem("uni_lic_reasons_auth_v3", JSON.stringify(DEFAULT_AUTH_REASONS)); } catch {}
    }
    if (category === "OPS" || !category) {
      setReasonsOps(DEFAULT_OPS_REASONS);
      try { localStorage.setItem("uni_lic_reasons_ops_v3", JSON.stringify(DEFAULT_OPS_REASONS)); } catch {}
    }
  };

  // Gerenciamento de opções de Autorizadores
  const [isAddingAuthorizer, setIsAddingAuthorizer] = useState(false);
  const [newAuthorizerText, setNewAuthorizerText] = useState("");

  const handleAddAuthorizer = () => {
    const trimmed = newAuthorizerText.trim();
    if (!trimmed) return;
    if (!authorizersList.includes(trimmed)) {
      const updated = [...authorizersList, trimmed];
      setAuthorizersList(updated);
      try { localStorage.setItem("uni_lic_authorizers_v3", JSON.stringify(updated)); } catch {}
    }
    setEditingItem(prev => prev ? ({ ...prev, authorizedBy: trimmed }) : prev);
    setNewAuthorizerText("");
    setIsAddingAuthorizer(false);
  };

  const handleDeleteAuthorizer = (a: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const updated = authorizersList.filter(x => x !== a);
    setAuthorizersList(updated);
    try { localStorage.setItem("uni_lic_authorizers_v3", JSON.stringify(updated)); } catch {}
  };

  const handleResetAuthorizers = () => {
    setAuthorizersList(COMMON_AUTHORIZERS);
    try { localStorage.setItem("uni_lic_authorizers_v3", JSON.stringify(COMMON_AUTHORIZERS)); } catch {}
  };

  // Gerenciamento de opções de Previsão
  const [isAddingForecast, setIsAddingForecast] = useState(false);
  const [newForecastText, setNewForecastText] = useState("");

  const handleAddForecast = () => {
    const trimmed = newForecastText.trim();
    if (!trimmed) return;
    if (!forecastsList.includes(trimmed)) {
      const updated = [...forecastsList, trimmed];
      setForecastsList(updated);
      try { localStorage.setItem("uni_lic_forecasts_v3", JSON.stringify(updated)); } catch {}
    }
    setEditingItem(prev => prev ? ({ ...prev, actionForecast: trimmed }) : prev);
    setNewForecastText("");
    setIsAddingForecast(false);
  };

  const handleDeleteForecast = (f: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const updated = forecastsList.filter(x => x !== f);
    setForecastsList(updated);
    try { localStorage.setItem("uni_lic_forecasts_v3", JSON.stringify(updated)); } catch {}
  };

  const handleResetForecasts = () => {
    setForecastsList(COMMON_FORECASTS);
    try { localStorage.setItem("uni_lic_forecasts_v3", JSON.stringify(COMMON_FORECASTS)); } catch {}
  };

  const handleCloseModal = () => {
    setIsSaving(false);
    setIsModalOpen(false);
    setEditingItem(null);
    setIsAddingReason(false);
    setNewReasonText("");
    setIsAddingAuthorizer(false);
    setNewAuthorizerText("");
    setIsAddingForecast(false);
    setNewForecastText("");
  };

  // Inline table editing state
  const [inlineEdits, setInlineEdits] = useState<Record<string, {
    reason: string;
    authorizedBy: string;
    actionForecast: string;
    observations: string;
  }>>({});
  const [savingRowKey, setSavingRowKey] = useState<string | null>(null);
  const [savedRowKeys, setSavedRowKeys] = useState<Set<string>>(new Set());

  // Spreadsheet interactive preview state
  const [isSpreadsheetModalOpen, setIsSpreadsheetModalOpen] = useState(false);
  const [copiedTable, setCopiedTable] = useState(false);

  const formatOperationName = (op?: string) => {
    if (!op) return "-";
    const trimmed = op.trim();
    if (trimmed === "DOC_SISTEMA") return "GLOBUS";
    const upper = trimmed.toUpperCase();
    if (upper === "CITROSUCO - SÃO PAULO" || upper === "CITROSUCO - SAO PAULO" || upper === "CITROSUCO-SP" || 
       (upper.includes("CITROSUCO") && (upper.includes("SÃO PAULO") || upper.includes("SAO PAULO") || upper.endsWith("- SP") || upper.endsWith("-SP")))) {
      return "CITROSUCO-SP";
    }
    if (upper === "CITROSUCO - UBERLANDIA" || upper === "CITROSUCO - UBERLÂNDIA" || upper === "CITROSUCO-MG" || 
       (upper.includes("CITROSUCO") && (upper.includes("UBERLANDIA") || upper.includes("UBERLÂNDIA") || upper.endsWith("- MG") || upper.endsWith("-MG")))) {
      return "CITROSUCO-MG";
    }
    return op;
  };

  // Map of justification by plate + docType + status (STRICT 1:1 MATCHING ONLY)
  const justMap = useMemo(() => {
    const map = new Map<string, LicenseJustification>();
    (justifications || []).forEach(j => {
      if (!j || !j.plate || !j.documentType) return;
      const rawDoc = (j.documentType || "").toUpperCase().trim();
      const normDoc = normalizeDocKey(j.documentType);
      // STRICT 1:1 ISOLATION: Forbid generic catch-all documentType placeholders from bleeding
      if (!normDoc || normDoc === "TODAS" || normDoc === "TODASASLICENCAS" || normDoc === "GERAL") {
        return;
      }

      const p = (j.plate || "").toUpperCase().trim();
      const s = (j.status || "").toUpperCase().trim();

      // STRICT 1:1 MATCHING ONLY:
      if (s) {
        map.set(`${p}#${rawDoc}#${s}`, j);
        map.set(`${p}#${normDoc}#${s}`, j);
      }
      // Match if alert doesn't have status constraint
      map.set(`${p}#${rawDoc}#ANY`, j);
      map.set(`${p}#${normDoc}#ANY`, j);
    });
    return map;
  }, [justifications]);

  // Extract all alert and regular items from Licenças source vehicles
  const alertVehicles = useMemo(() => {
    try {
      const items: Array<{
        plate: string;
        fleet: string;
        operation: string;
        documentType: string;
        status: string;
        daysRemaining: number;
        expiryDate: string;
        justification?: LicenseJustification;
        isAlert: boolean;
      }> = [];

      const licVehicles = (baseFleet || []).filter(v => v && (v.source === "LICENCAS" || !v.source));
      const safeJustifications = (justifications || []).filter(j => j && typeof j === 'object');

      // Pre-index justifications by plate for instant O(1) lookups
      const justByPlate = new Map<string, LicenseJustification[]>();
      for (let i = 0; i < safeJustifications.length; i++) {
        const j = safeJustifications[i];
        if (!j) continue;
        const p = (j.plate || '').toUpperCase().trim();
        if (!p) continue;
        if (!justByPlate.has(p)) justByPlate.set(p, []);
        justByPlate.get(p)!.push(j);
      }

      const includedKeySet = new Set<string>();

      licVehicles.forEach(v => {
        const opFormatted = formatOperationName(v.operation);
        const p = (v.plate || '').toUpperCase().trim();

      (v.documents || []).forEach(d => {
        const rawDoc = (d.type || '').toUpperCase().trim();
        const normDoc = normalizeDocKey(d.type);
        const rawStatus = (d.status || '').toLowerCase().trim();

        let itemStatus = 'REGULAR';
        if (rawStatus === 'vencido' || (typeof d.daysRemaining === 'number' && d.daysRemaining <= 0)) {
          itemStatus = 'VENCIDO';
        } else if (rawStatus === 'critico' || (typeof d.daysRemaining === 'number' && d.daysRemaining > 0 && d.daysRemaining <= 15)) {
          itemStatus = 'CRITICO';
        } else if (rawStatus === 'atencao' || (typeof d.daysRemaining === 'number' && d.daysRemaining > 15 && d.daysRemaining <= 30)) {
          itemStatus = 'ATENCAO';
        } else {
          itemStatus = 'REGULAR';
        }

        const isAlert = itemStatus === 'VENCIDO' || itemStatus === 'CRITICO' || itemStatus === 'ATENCAO';

        // Se a data foi alterada e o item agora está regular/pago, não anexa justificativa de pendência anterior
        const specificJust = isAlert ? (
          justMap.get(`${p}#${rawDoc}#${itemStatus}`) ||
          justMap.get(`${p}#${normDoc}#${itemStatus}`) ||
          justMap.get(`${p}#${rawDoc}#ANY`) ||
          justMap.get(`${p}#${normDoc}#ANY`)
        ) : undefined;

        includedKeySet.add(`${p}#${normDoc}`);

        items.push({
          plate: v.plate || "-",
          fleet: v.fleet || "-",
          operation: opFormatted,
          documentType: d.type || "Licença Geral",
          status: itemStatus,
          daysRemaining: typeof d.daysRemaining === 'number' ? d.daysRemaining : 999,
          expiryDate: d.expiryDate || "-",
          justification: specificJust,
          isAlert
        });
      });

      // Even if no document in array, if there's a custom justification registered for this plate
      const plateJusts = justByPlate.get(p) || [];
      plateJusts.forEach(genJust => {
        const docType = (genJust.documentType || "Geral").toUpperCase().trim();
        const normDoc = normalizeDocKey(docType);
        if (!includedKeySet.has(`${p}#${normDoc}`)) {
          includedKeySet.add(`${p}#${normDoc}`);
          items.push({
            plate: v.plate || "-",
            fleet: v.fleet || "-",
            operation: opFormatted,
            documentType: genJust.documentType || "Geral",
            status: (genJust.status || "OK").toUpperCase(),
            daysRemaining: 999,
            expiryDate: "-",
            justification: genJust,
            isAlert: false
          });
        }
      });
    });

    // Include justifications from other workstations/files:
    // 1. If baseFleet has no license vehicles, include them so restored/synced records are immediately visible (prevents blank/black screen)
    // 2. If baseFleet has vehicles, only include foreign workstations when the user explicitly enabled 'includeAllStations'
    const shouldIncludeExternal = includeAllStations || licVehicles.length === 0;
    if (shouldIncludeExternal) {
      for (let i = 0; i < safeJustifications.length; i++) {
        const j = safeJustifications[i];
        if (!j || !j.plate) continue;
        const p = (j.plate || "").toUpperCase().trim();
        const docType = (j.documentType || "Geral").toUpperCase().trim();
        const normDoc = normalizeDocKey(docType);
        const key = `${p}#${normDoc}`;
        if (!includedKeySet.has(key)) {
          includedKeySet.add(key);

          const matchedVeh = (baseFleet || []).find(b => b && (b.plate || '').toUpperCase().trim() === p);
          const jStatus = (j.status || "ATENCAO").toUpperCase().trim();
          const isAlert = jStatus !== 'OK' && jStatus !== 'REGULAR';

          items.push({
            plate: String(j.plate || "-"),
            fleet: String(j.fleet || (matchedVeh ? matchedVeh.fleet : "-")),
            operation: formatOperationName(j.operation || (matchedVeh ? matchedVeh.operation : "-")),
            documentType: String(j.documentType || "Geral"),
            status: jStatus,
            daysRemaining: isAlert ? 0 : 999,
            expiryDate: "-",
            justification: j,
            isAlert
          });
        }
      }
    }

    return items;
  } catch (err) {
    console.error("Erro defensivo em alertVehicles licenças:", err);
    return [];
  }
  }, [baseFleet, justifications, justMap, includeAllStations]);

  // Distinct operations
  const operationsList = useMemo(() => {
    const set = new Set<string>();
    alertVehicles.forEach(it => {
      if (it.operation && it.operation !== "-") set.add(it.operation.trim());
    });
    return Array.from(set).sort();
  }, [alertVehicles]);

  // Options for MultiSelect Operação (Padrão da Imagem 2)
  const operationOptions: MultiSelectOption[] = useMemo(() => {
    const counts = new Map<string, number>();
    alertVehicles.forEach(it => {
      if (it.operation && it.operation !== "-") {
        const op = it.operation.trim();
        counts.set(op, (counts.get(op) || 0) + 1);
      }
    });
    return operationsList.map(op => ({
      value: op,
      label: op,
      count: counts.get(op) || 0,
      icon: <Building2 size={13} className="text-slate-400 shrink-0" />
    }));
  }, [operationsList, alertVehicles]);

  // Options for MultiSelect Placa
  const availablePlates = useMemo(() => {
    const set = new Set<string>();
    alertVehicles.forEach(it => {
      if (it.plate && it.plate !== '-' && it.plate !== 'VÁZIO') set.add(it.plate.trim().toUpperCase());
    });
    return Array.from(set).sort();
  }, [alertVehicles]);

  const plateOptions: MultiSelectOption[] = useMemo(() => {
    const counts = new Map<string, number>();
    alertVehicles.forEach(it => {
      if (it.plate && it.plate !== '-' && it.plate !== 'VÁZIO') {
        const p = it.plate.trim().toUpperCase();
        counts.set(p, (counts.get(p) || 0) + 1);
      }
    });
    return availablePlates.map(p => ({
      value: p,
      label: p,
      count: counts.get(p) || 0
    }));
  }, [availablePlates, alertVehicles]);

  // Options for MultiSelect Frota
  const availableFleets = useMemo(() => {
    const set = new Set<string>();
    alertVehicles.forEach(it => {
      if (it.fleet && it.fleet !== '-') set.add(String(it.fleet).trim());
    });
    return Array.from(set).sort((a, b) => {
      const numA = parseInt(a, 10);
      const numB = parseInt(b, 10);
      if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
      return a.localeCompare(b);
    });
  }, [alertVehicles]);

  const fleetOptions: MultiSelectOption[] = useMemo(() => {
    const counts = new Map<string, number>();
    alertVehicles.forEach(it => {
      if (it.fleet && it.fleet !== '-') {
        counts.set(String(it.fleet).trim(), (counts.get(String(it.fleet).trim()) || 0) + 1);
      }
    });
    return availableFleets.map(f => ({
      value: f,
      label: `Frota ${f}`,
      count: counts.get(f) || 0
    }));
  }, [availableFleets, alertVehicles]);

  // Options for MultiSelect Licença
  const availableLicenses = useMemo(() => {
    const set = new Set<string>();
    alertVehicles.forEach(it => {
      if (it.documentType && it.documentType !== '-') set.add(it.documentType.trim());
    });
    return Array.from(set).sort();
  }, [alertVehicles]);

  const licenseOptions: MultiSelectOption[] = useMemo(() => {
    const counts = new Map<string, number>();
    alertVehicles.forEach(it => {
      if (it.documentType && it.documentType.trim()) {
        const d = it.documentType.trim();
        counts.set(d, (counts.get(d) || 0) + 1);
      }
    });
    return availableLicenses.map(lic => ({
      value: lic,
      label: lic,
      count: counts.get(lic) || 0
    }));
  }, [availableLicenses, alertVehicles]);

  // 1. Filtragem dimensional base: busca textual, placas, frotas, operações e licenças
  const dimFilteredItems = useMemo(() => {
    const term = searchTerm ? searchTerm.toLowerCase().trim() : "";
    const platesSet = selectedPlates.length > 0 ? new Set(selectedPlates.map(sp => sp.toUpperCase().trim())) : null;
    const fleetsSet = selectedFleets.length > 0 ? new Set(selectedFleets.map(sf => String(sf).trim())) : null;
    const operationsSet = selectedOperations.length > 0 ? new Set(selectedOperations.map(so => so.toUpperCase().trim())) : null;
    const licensesSet = selectedLicenses.length > 0 ? new Set(selectedLicenses.map(sl => sl.toUpperCase().trim())) : null;

    return alertVehicles.filter(it => {
      // Filter by operation (multi-select / flegue - Padrão Imagem 2)
      if (operationsSet) {
        if (!it.operation || !operationsSet.has(it.operation.trim().toUpperCase())) return false;
      }

      // Filter by license (multi-select / flegue)
      if (licensesSet) {
        if (!it.documentType || !licensesSet.has(it.documentType.trim().toUpperCase())) return false;
      }

      // Filter by plate (multi-select / flegue)
      if (platesSet) {
        if (!it.plate || !platesSet.has(it.plate.trim().toUpperCase())) return false;
      }

      // Filter by fleet (multi-select / flegue)
      if (fleetsSet) {
        if (!it.fleet || !fleetsSet.has(String(it.fleet).trim())) return false;
      }

      if (term) {
        const pMatch = it.plate.toLowerCase().includes(term);
        const fMatch = it.fleet.toLowerCase().includes(term);
        const opMatch = it.operation.toLowerCase().includes(term);
        const docMatch = it.documentType.toLowerCase().includes(term);
        const rMatch = it.justification?.reason?.toLowerCase().includes(term);
        const authMatch = it.justification?.authorizedBy?.toLowerCase().includes(term);
        const obsMatch = it.justification?.observations?.toLowerCase().includes(term);
        const foreMatch = it.justification?.actionForecast?.toLowerCase().includes(term);
        return pMatch || fMatch || opMatch || docMatch || rMatch || authMatch || obsMatch || foreMatch;
      }

      return true;
    });
  }, [alertVehicles, selectedOperations, selectedLicenses, selectedPlates, selectedFleets, searchTerm]);

  // 2. Universo para cálculo dos Cards de Status Operacional (interage com filtros de governança)
  const itemsForStatusStats = useMemo(() => {
    return dimFilteredItems.filter(it => {
      if (cardFilter === 'WITH_JUST' || onlyWithJustification === true) {
        if (!it.justification) return false;
      }
      if (cardFilter === 'PENDING' || onlyWithJustification === false) {
        const s = (it.status || '').toUpperCase().trim();
        const matchesPending = pendingStatuses.includes(s) || 
          (pendingStatuses.includes('REGULAR') && (s === 'REGULAR' || s === 'OK'));
        if (it.justification || !matchesPending) return false;
      }
      if (cardFilter === 'POSTPONED') {
        const txt = (it.justification?.reason || "") + " " + (it.justification?.actionForecast || "");
        if (!txt.toLowerCase().includes("próximo ano") && !txt.toLowerCase().includes("proximo ano")) return false;
      }
      if (cardFilter === 'GARAGEM') {
        const txt = (it.justification?.reason || "") + " " + (it.justification?.observations || "");
        const lower = txt.toLowerCase();
        if (!lower.includes("parado no garagem") && !lower.includes("parado na garagem") && !lower.includes("garagem")) return false;
      }
      if (cardFilter === 'SEM_PREVISAO') {
        const txt = (it.justification?.reason || "") + " " + (it.justification?.actionForecast || "") + " " + (it.justification?.observations || "");
        const lower = txt.toLowerCase();
        if (!lower.includes("sem previsão de renovação") && !lower.includes("sem previsao de renovacao") && !lower.includes("sem previsão") && !lower.includes("sem previsao")) return false;
      }
      return true;
    });
  }, [dimFilteredItems, cardFilter, onlyWithJustification, pendingStatuses]);

  // Statistics of Operational Status (Cards da Imagem 2 - interagem 100% com os filtros)
  const statusStats = useMemo(() => {
    let vencido = 0;
    let critico = 0;
    let atencao = 0;
    let regular = 0;

    itemsForStatusStats.forEach(it => {
      const s = (it.status || '').toUpperCase();
      if (s === 'VENCIDO') vencido++;
      else if (s === 'CRITICO') critico++;
      else if (s === 'ATENCAO') atencao++;
      else regular++;
    });

    return { vencido, critico, atencao, regular, total: itemsForStatusStats.length };
  }, [itemsForStatusStats]);

  // Options for MultiSelect Status (reflete fielmente os status da imagem 2 com contadores dinâmicos)
  const statusOptions: MultiSelectOption[] = useMemo(() => {
    return [
      {
        value: 'VENCIDO',
        label: 'Vencido',
        count: statusStats.vencido,
        colorDot: 'bg-rose-500',
        icon: <AlertOctagon size={13} className="text-rose-500" />
      },
      {
        value: 'CRITICO',
        label: 'Crítico (≤ 15d)',
        count: statusStats.critico,
        colorDot: 'bg-amber-500',
        icon: <AlertTriangle size={13} className="text-amber-500" />
      },
      {
        value: 'ATENCAO',
        label: 'Em Atenção (≤ 30d)',
        count: statusStats.atencao,
        colorDot: 'bg-blue-500',
        icon: <Clock size={13} className="text-blue-500" />
      },
      {
        value: 'OK',
        label: 'Regular / Outros',
        count: statusStats.regular,
        colorDot: 'bg-emerald-500',
        icon: <CheckCircle2 size={13} className="text-emerald-500" />
      }
    ];
  }, [statusStats]);

  // 3. Universo para cálculo dos Cards de Governança (interage com filtros de status operacional)
  const itemsForGovStats = useMemo(() => {
    const statusesSet = selectedStatuses.length > 0 ? new Set(selectedStatuses) : null;
    return dimFilteredItems.filter(it => {
      // Filtro pelos cards da Imagem 2 (Status Operacional)
      if (statusCardFilter === 'VENCIDO' && it.status !== 'VENCIDO') return false;
      if (statusCardFilter === 'CRITICO' && it.status !== 'CRITICO') return false;
      if (statusCardFilter === 'ATENCAO' && it.status !== 'ATENCAO') return false;
      if (statusCardFilter === 'REGULAR' && it.status !== 'REGULAR' && it.status !== 'OK') return false;

      // Filter by status (multi-select / flegue)
      if (statusesSet) {
        const itemStatus = (it.status || '').toUpperCase();
        const matchesStatus = statusesSet.has(itemStatus) || 
          ((statusesSet.has('OK') || statusesSet.has('REGULAR')) && (itemStatus === 'OK' || itemStatus === 'REGULAR'));
        if (!matchesStatus) return false;
      }

      return true;
    });
  }, [dimFilteredItems, statusCardFilter, selectedStatuses]);

  // Contagens dos status dos alertas sem justificativa (para o seletor de critério de pendência)
  const pendingStatusCounts = useMemo(() => {
    let vencido = 0;
    let critico = 0;
    let atencao = 0;
    let regular = 0;
    itemsForGovStats.forEach(it => {
      if (!it.justification) {
        const s = (it.status || '').toUpperCase().trim();
        if (s === 'VENCIDO') vencido++;
        else if (s === 'CRITICO') critico++;
        else if (s === 'ATENCAO') atencao++;
        else regular++;
      }
    });
    return { vencido, critico, atencao, regular };
  }, [itemsForGovStats]);

  // Statistics (Governança & Justificativas da Frota - interagem 100% com os filtros)
  const stats = useMemo(() => {
    const isRegularFilterActive = statusCardFilter === 'REGULAR' || 
      includeRegularDocs || 
      selectedStatuses.some(s => s === 'OK' || s === 'REGULAR');
    const alertItems = itemsForGovStats.filter(it => isRegularFilterActive ? true : (it.isAlert || !!it.justification));
    const total = alertItems.length;
    const withJust = alertItems.filter(it => !!it.justification).length;
    const pendingSet = new Set(pendingStatuses);
    const pendingJust = alertItems.filter(it => {
      if (it.justification) return false;
      const s = (it.status || '').toUpperCase().trim();
      return pendingSet.has(s) || (pendingSet.has('REGULAR') && (s === 'REGULAR' || s === 'OK'));
    }).length;
    const nextYearPostponed = alertItems.filter(it => {
      const cat = getJustificationCategoryInfo(it.justification?.reason, it.justification?.actionForecast, it.justification?.observations);
      return cat.key === 'POSTPONED';
    }).length;
    const paradoGaragem = alertItems.filter(it => {
      const cat = getJustificationCategoryInfo(it.justification?.reason, it.justification?.actionForecast, it.justification?.observations);
      return cat.key === 'GARAGEM';
    }).length;
    const semPrevisao = alertItems.filter(it => {
      const cat = getJustificationCategoryInfo(it.justification?.reason, it.justification?.actionForecast, it.justification?.observations);
      return cat.key === 'SEM_PREVISAO';
    }).length;

    return { total, withJust, pendingJust, nextYearPostponed, paradoGaragem, semPrevisao };
  }, [itemsForGovStats, pendingStatuses, statusCardFilter, includeRegularDocs, selectedStatuses]);

  // 4. Filtered rows - final data for Table & Cards
  const filteredItems = useMemo(() => {
    const statusesSet = selectedStatuses.length > 0 ? new Set(selectedStatuses) : null;
    const shouldIncludeRegulars = includeRegularDocs || statusCardFilter === 'REGULAR' || (statusesSet && (statusesSet.has('OK') || statusesSet.has('REGULAR')));
    const pendingSet = new Set(pendingStatuses);

    return dimFilteredItems.filter(it => {
      // Se a data foi alterada ou o documento agora está regular/pago, sai automaticamente dos relatórios e painel de justificativas
      const isRegularOrPaid = !it.isAlert || it.status === 'REGULAR' || it.status === 'OK' || it.status === 'PAGOS' || it.status === 'PAGO';
      if (!shouldIncludeRegulars && isRegularOrPaid) return false;

      // Filtro pelos cards da Imagem 2 (Status Operacional)
      if (statusCardFilter === 'VENCIDO' && it.status !== 'VENCIDO') return false;
      if (statusCardFilter === 'CRITICO' && it.status !== 'CRITICO') return false;
      if (statusCardFilter === 'ATENCAO' && it.status !== 'ATENCAO') return false;
      if (statusCardFilter === 'REGULAR' && it.status !== 'REGULAR' && it.status !== 'OK') return false;

      // Filter by status (multi-select / flegue)
      if (statusesSet) {
        const itemStatus = (it.status || '').toUpperCase();
        const matchesStatus = statusesSet.has(itemStatus) || 
          ((statusesSet.has('OK') || statusesSet.has('REGULAR')) && (itemStatus === 'OK' || itemStatus === 'REGULAR'));
        if (!matchesStatus) return false;
      }
      
      if (onlyWithJustification === true && !it.justification) return false;
      if (onlyWithJustification === false) {
        if (it.justification) return false;
        const s = (it.status || '').toUpperCase().trim();
        const matchesPending = pendingSet.has(s) || (pendingSet.has('REGULAR') && (s === 'REGULAR' || s === 'OK'));
        if (!matchesPending) return false;
      }

      // Card quick filters (Governança)
      if (cardFilter === 'WITH_JUST' && !it.justification) return false;
      if (cardFilter === 'PENDING') {
        if (it.justification) return false;
        const s = (it.status || '').toUpperCase().trim();
        const matchesPending = pendingSet.has(s) || (pendingSet.has('REGULAR') && (s === 'REGULAR' || s === 'OK'));
        if (!matchesPending) return false;
      }
      if (cardFilter === 'POSTPONED') {
        const cat = getJustificationCategoryInfo(it.justification?.reason, it.justification?.actionForecast, it.justification?.observations);
        if (cat.key !== 'POSTPONED') return false;
      }
      if (cardFilter === 'GARAGEM') {
        const cat = getJustificationCategoryInfo(it.justification?.reason, it.justification?.actionForecast, it.justification?.observations);
        if (cat.key !== 'GARAGEM') return false;
      }
      if (cardFilter === 'SEM_PREVISAO') {
        const cat = getJustificationCategoryInfo(it.justification?.reason, it.justification?.actionForecast, it.justification?.observations);
        if (cat.key !== 'SEM_PREVISAO') return false;
      }

      return true;
    });
  }, [dimFilteredItems, selectedStatuses, onlyWithJustification, cardFilter, statusCardFilter, includeRegularDocs, pendingStatuses]);

  // High-performance pagination state
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(50);

  // Reset to first page when filtering changes
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, selectedPlates, selectedFleets, selectedOperations, selectedLicenses, selectedStatuses, cardFilter, statusCardFilter, includeRegularDocs, onlyWithJustification, pendingStatuses]);

  const totalPages = Math.max(1, Math.ceil(filteredItems.length / pageSize));
  const validCurrentPage = Math.min(currentPage, totalPages);

  const paginatedItems = useMemo(() => {
    if (pageSize >= 9999) return filteredItems;
    const start = (validCurrentPage - 1) * pageSize;
    return filteredItems.slice(start, start + pageSize);
  }, [filteredItems, validCurrentPage, pageSize]);

  const getRowKey = (plate: string, docType: string, status?: string) => 
    `${(plate || '').toUpperCase().trim()}#${normalizeDocKey(docType)}#${(status || '').toUpperCase().trim()}`;

  const getCellValues = (item: {
    plate: string;
    fleet: string;
    operation: string;
    documentType: string;
    status: string;
    justification?: LicenseJustification;
  }) => {
    const key = getRowKey(item.plate, item.documentType, item.status);
    if (inlineEdits[key]) {
      return inlineEdits[key];
    }
    return {
      reason: item.justification?.reason ?? "",
      authorizedBy: item.justification?.authorizedBy ?? "",
      actionForecast: item.justification?.actionForecast ?? "",
      observations: item.justification?.observations ?? "",
    };
  };

  const handleCellChange = (
    item: {
      plate: string;
      fleet: string;
      operation: string;
      documentType: string;
      status: string;
      justification?: LicenseJustification;
    },
    field: 'reason' | 'authorizedBy' | 'actionForecast' | 'observations',
    value: string
  ) => {
    const key = getRowKey(item.plate, item.documentType, item.status);
    setInlineEdits(prev => {
      const current = prev[key] || {
        reason: item.justification?.reason ?? "",
        authorizedBy: item.justification?.authorizedBy ?? "",
        actionForecast: item.justification?.actionForecast ?? "",
        observations: item.justification?.observations ?? "",
      };
      return {
        ...prev,
        [key]: {
          ...current,
          [field]: value
        }
      };
    });
  };

  const handleCellBlur = async (
    item: {
      plate: string;
      fleet: string;
      operation: string;
      documentType: string;
      status: string;
      justification?: LicenseJustification;
    }
  ) => {
    const key = getRowKey(item.plate, item.documentType, item.status);
    const current = inlineEdits[key];
    if (!current) return;

    const original = {
      reason: item.justification?.reason ?? "",
      authorizedBy: item.justification?.authorizedBy ?? "",
      actionForecast: item.justification?.actionForecast ?? "",
      observations: item.justification?.observations ?? "",
    };

    const hasChanged =
      current.reason.trim() !== original.reason.trim() ||
      current.authorizedBy.trim() !== original.authorizedBy.trim() ||
      current.actionForecast.trim() !== original.actionForecast.trim() ||
      current.observations.trim() !== original.observations.trim();

    const isAllEmpty = !current.reason.trim() && !current.authorizedBy.trim() && !current.actionForecast.trim() && !current.observations.trim();
    if (!item.justification && isAllEmpty) return;

    if (!hasChanged) return;

    setSavingRowKey(key);
    try {
      const cleanPlate = (item.plate || "").toUpperCase().trim().replace(/[^a-zA-Z0-9]/g, '');
      const cleanDoc = (item.documentType || "geral").toLowerCase().replace(/[^a-zA-Z0-9]/g, '');
      const cleanStatus = (item.status || "vencido").toLowerCase().replace(/[^a-zA-Z0-9]/g, '');
      const isExactDocMatch = item.justification && normalizeDocKey(item.justification.documentType) === normalizeDocKey(item.documentType);
      const toSave: LicenseJustification = {
        id: (isExactDocMatch && item.justification?.id) ? item.justification.id : `just_${cleanPlate}_${cleanDoc}_${cleanStatus}_${Date.now()}`,
        plate: (item.plate || "").toUpperCase().trim(),
        fleet: (item.fleet || "").trim(),
        operation: formatOperationName(item.operation),
        documentType: (item.documentType || "Geral").trim(),
        status: (item.status || "VENCIDO").toUpperCase().trim(),
        reason: current.reason.trim(),
        authorizedBy: current.authorizedBy.trim(),
        actionForecast: current.actionForecast.trim(),
        observations: current.observations.trim(),
        updatedAt: format(new Date(), "dd/MM/yyyy HH:mm")
      };

      await onSaveJustification(toSave);
      setSavedRowKeys(prev => new Set(prev).add(key));
      setTimeout(() => {
        setSavedRowKeys(prev => {
          const next = new Set(prev);
          next.delete(key);
          return next;
        });
      }, 3000);
    } catch (err) {
      console.error("Erro ao salvar linha da tabela:", err);
    } finally {
      setSavingRowKey(null);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.currentTarget.blur();
    }
  };

  // Open modal for new or editing
  const handleOpenModal = (item?: {
    plate: string;
    fleet: string;
    operation: string;
    documentType: string;
    status: string;
    justification?: LicenseJustification;
  }) => {
    setIsSaving(false);
    setIsAddingReason(false);
    setNewReasonText("");
    const key = item ? getRowKey(item.plate, item.documentType, item.status) : '';
    const currentInline = key && inlineEdits[key] ? inlineEdits[key] : null;

    const isExactDocMatch = item?.justification && normalizeDocKey(item.justification.documentType) === normalizeDocKey(item.documentType);
    if (isExactDocMatch && item?.justification) {
      setEditingItem({
        ...item.justification,
        plate: item.plate !== "-" ? item.plate : item.justification.plate,
        fleet: item.fleet !== "-" ? item.fleet : item.justification.fleet,
        operation: item.operation !== "-" ? item.operation : item.justification.operation,
        documentType: item.documentType || item.justification.documentType,
        status: item.status || item.justification.status || "VENCIDO",
        reason: currentInline?.reason ?? item.justification.reason,
        authorizedBy: currentInline?.authorizedBy ?? item.justification.authorizedBy,
        actionForecast: currentInline?.actionForecast ?? item.justification.actionForecast,
        observations: currentInline?.observations ?? item.justification.observations,
      });
    } else if (item) {
      const cleanPlate = (item.plate || "").toUpperCase().trim().replace(/[^a-zA-Z0-9]/g, '');
      const cleanDoc = normalizeDocKey(item.documentType).toLowerCase() || "doc";
      const cleanStatus = (item.status || "vencido").toLowerCase().replace(/[^a-zA-Z0-9]/g, '');
      setEditingItem({
        id: `just_${cleanPlate}_${cleanDoc}_${cleanStatus}_${Date.now()}`,
        plate: item.plate !== "-" ? item.plate : "",
        fleet: item.fleet !== "-" ? item.fleet : "",
        operation: item.operation !== "-" ? item.operation : "",
        documentType: item.documentType || "",
        status: (item.status || "VENCIDO").toUpperCase().trim(),
        reason: currentInline?.reason ?? "",
        authorizedBy: currentInline?.authorizedBy ?? "",
        actionForecast: currentInline?.actionForecast ?? "",
        observations: currentInline?.observations ?? "",
        updatedAt: format(new Date(), "dd/MM/yyyy HH:mm")
      });
    } else {
      setEditingItem({
        id: `just_new_${Date.now()}`,
        plate: "",
        fleet: "",
        operation: "",
        documentType: availableLicenses[0] || "",
        status: "VENCIDO",
        reason: "",
        authorizedBy: "",
        actionForecast: "",
        observations: "",
        updatedAt: format(new Date(), "dd/MM/yyyy HH:mm")
      });
    }
    setIsModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingItem?.plate) {
      alert("Por favor, informe a placa do veículo.");
      return;
    }
    if (!editingItem?.documentType || editingItem.documentType.trim() === "") {
      alert("Por favor, informe a Licença / Documento específico.");
      return;
    }

    setIsSaving(true);
    try {
      const cleanPlate = (editingItem.plate || "").toUpperCase().trim().replace(/[^a-zA-Z0-9]/g, '');
      const cleanDoc = (editingItem.documentType || "geral").toLowerCase().replace(/[^a-zA-Z0-9]/g, '');
      const cleanStatus = (editingItem.status || "vencido").toLowerCase().replace(/[^a-zA-Z0-9]/g, '');
      const toSave: LicenseJustification = {
        id: editingItem.id || `just_${cleanPlate}_${cleanDoc}_${cleanStatus}_${Date.now()}`,
        plate: (editingItem.plate || "").toUpperCase().trim(),
        fleet: (editingItem.fleet || "").trim(),
        operation: formatOperationName(editingItem.operation || ""),
        documentType: (editingItem.documentType || "Geral").trim(),
        status: (editingItem.status || "VENCIDO").toUpperCase().trim(),
        reason: (editingItem.reason || "").trim(),
        authorizedBy: (editingItem.authorizedBy || "").trim(),
        actionForecast: (editingItem.actionForecast || "").trim(),
        observations: (editingItem.observations || "").trim(),
        updatedAt: format(new Date(), "dd/MM/yyyy HH:mm")
      };

      await onSaveJustification(toSave);

      // Clear inline edit state for this row since it's saved
      const key = getRowKey(toSave.plate, toSave.documentType, toSave.status);
      setInlineEdits(prev => {
        const next = { ...prev };
        delete next[key];
        return next;
      });

      setSaveSuccessMsg("Justificativa salva com sucesso no sistema e sincronizada!");
      setTimeout(() => setSaveSuccessMsg(null), 3500);
      handleCloseModal();
    } catch (err: any) {
      console.error("Erro ao salvar justificativa:", err);
      alert("Ocorreu um erro ao salvar justificativa: " + (err?.message || err));
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id: string, plate: string) => {
    if (window.confirm(`Deseja realmente remover a justificativa da placa ${plate}?`)) {
      try {
        await onDeleteJustification(id);
        setSaveSuccessMsg("Justificativa removida do banco de dados!");
        setTimeout(() => setSaveSuccessMsg(null), 3500);
      } catch (err) {
        console.error("Erro ao remover:", err);
      }
    }
  };

  // EXPORT JUSTIFICATIONS PDF REPORT
  const exportJustificationsPDF = async (isDirectPrint: boolean = false) => {
    const doc = new jsPDF({ orientation: 'landscape', format: 'a4' });
    const pageWidth = doc.internal.pageSize.getWidth();
    const loadedImg = await loadPDFLogo();

    // Render modern header
    renderModernPDFHeader(doc, {
      title: "RELATÓRIO DE JUSTIFICATIVAS E OBSERVAÇÕES - LICENÇAS",
      subtitle: "Detalhamento Operacional de Motivos de Vencimento, Autorizações e Previsões",
      badgeText: "JUSTIFICATIVAS DA FROTA",
      rightMetaText: `Registros: ${filteredItems.length}`,
      loadedImg,
      height: 36
    });

    let startY = 42;

    // Resumo Executivo em Cards (Flegue ativável antes da impressão/salvamento)
    // Resumo Executivo em Cards (Flegue ativável antes da impressão/salvamento)
    // Regra estrita: exibir todos os cards disponíveis no sistema e NÃO exibir cards zerados
    // Exibe separadamente: 1) Governança & Justificativas e 2) Status Operacional dos Documentos (Imagem 2)
    if (printCardsInPdf) {
      // 1. Cards de Governança & Justificativas da Frota
      const allGovernanceCards = [
        {
          key: 'total',
          label: 'TOTAL DE ALERTAS',
          subtitle: 'Veículos / licenças',
          value: Number(stats.total) || 0,
          color: [30, 58, 138] // azul marinho escuro
        },
        {
          key: 'withJust',
          label: 'COM JUSTIFICATIVA',
          subtitle: 'Registros ativos',
          value: Number(stats.withJust) || 0,
          color: [16, 124, 65] // verde esmeralda
        },
        {
          key: 'pendingJust',
          label: 'PENDENTES',
          subtitle: 'Sem justificativa',
          value: Number(stats.pendingJust) || 0,
          color: [220, 38, 38] // vermelho
        },
        {
          key: 'nextYearPostponed',
          label: 'POSTERGADOS (JUSTIF.)',
          subtitle: 'Próx. Exercício (Subdivisão)',
          value: Number(stats.nextYearPostponed) || 0,
          color: [217, 119, 6] // âmbar
        },
        {
          key: 'paradoGaragem',
          label: 'PARADO GARAGEM (JUSTIF.)',
          subtitle: 'Autorizações (Subdivisão)',
          value: Number(stats.paradoGaragem) || 0,
          color: [79, 70, 229] // índigo
        },
        {
          key: 'semPrevisao',
          label: 'SEM PREVISÃO (JUSTIF.)',
          subtitle: 'Prazos & Ops (Subdivisão)',
          value: Number(stats.semPrevisao) || 0,
          color: [2, 132, 199] // sky / ciano
        }
      ];

      // 2. Cards de Status Operacional dos Documentos (Imagem 2 - SEPARADOS)
      const allStatusCards = [
        {
          key: 'vencido',
          label: 'VENCIDOS',
          subtitle: 'Licenças vencidas',
          value: Number(statusStats.vencido) || 0,
          color: [220, 38, 38] // vermelho
        },
        {
          key: 'critico',
          label: 'CRÍTICOS (≤ 15d)',
          subtitle: 'Vencem em até 15d',
          value: Number(statusStats.critico) || 0,
          color: [217, 119, 6] // âmbar
        },
        {
          key: 'atencao',
          label: 'EM ATENÇÃO (≤ 30d)',
          subtitle: 'Vencem em até 30d',
          value: Number(statusStats.atencao) || 0,
          color: [2, 132, 199] // sky / azul
        },
        {
          key: 'regular',
          label: 'REGULARES / EM DIA',
          subtitle: 'Sem pendências',
          value: Number(statusStats.regular) || 0,
          color: [16, 124, 65] // verde esmeralda
        }
      ];

      // Filtro estrito: Oculta qualquer card com valor 0
      const activeGovCards = allGovernanceCards.filter(c => c.value > 0);
      const activeStatusCards = allStatusCards.filter(c => c.value > 0);

      // Renderização do Banner 1: Governança
      if (activeGovCards.length > 0) {
        const bannerH = 19;
        doc.setFillColor(248, 250, 252);
        doc.roundedRect(14, startY, pageWidth - 28, bannerH, 2, 2, 'F');
        doc.setDrawColor(226, 232, 240);
        doc.roundedRect(14, startY, pageWidth - 28, bannerH, 2, 2, 'S');

        doc.setFont("helvetica", "bold");
        doc.setFontSize(6.8);
        doc.setTextColor(71, 85, 105);
        doc.text("GOVERNANÇA & JUSTIFICATIVAS DA FROTA", 18, startY + 4.5);

        const innerStartX = 18;
        const innerAvailableW = pageWidth - 36;
        const gap = 3;
        const cardW = (innerAvailableW - (gap * (activeGovCards.length - 1))) / activeGovCards.length;
        const cardH = 12;
        const cardY = startY + 5.5;

        activeGovCards.forEach((c, idx) => {
          const cardX = innerStartX + idx * (cardW + gap);
          doc.setFillColor(255, 255, 255);
          doc.roundedRect(cardX, cardY, cardW, cardH, 1.2, 1.2, 'F');
          doc.setDrawColor(226, 232, 240);
          doc.roundedRect(cardX, cardY, cardW, cardH, 1.2, 1.2, 'S');

          doc.setFillColor(c.color[0], c.color[1], c.color[2]);
          doc.roundedRect(cardX, cardY, cardW, 1.1, 0.5, 0.5, 'F');

          doc.setFont("helvetica", "bold");
          doc.setFontSize(5.8);
          doc.setTextColor(100, 116, 139);
          doc.text(c.label, cardX + 2.2, cardY + 4.2);

          doc.setFont("helvetica", "bold");
          doc.setFontSize(9.5);
          doc.setTextColor(c.color[0], c.color[1], c.color[2]);
          doc.text(String(c.value), cardX + 2.2, cardY + 8.8);

          if (c.subtitle && cardW > 28) {
            doc.setFont("helvetica", "normal");
            doc.setFontSize(4.8);
            doc.setTextColor(148, 163, 184);
            doc.text(c.subtitle, cardX + cardW - 2.2, cardY + 8.8, { align: 'right' });
          }
        });

        startY += bannerH + 2.5;
      }

      // Renderização do Banner 2: Status Operacional dos Documentos & Prazos (SEPARADO)
      if (activeStatusCards.length > 0) {
        const bannerH = 19;
        doc.setFillColor(248, 250, 252);
        doc.roundedRect(14, startY, pageWidth - 28, bannerH, 2, 2, 'F');
        doc.setDrawColor(226, 232, 240);
        doc.roundedRect(14, startY, pageWidth - 28, bannerH, 2, 2, 'S');

        doc.setFont("helvetica", "bold");
        doc.setFontSize(6.8);
        doc.setTextColor(71, 85, 105);
        doc.text("STATUS OPERACIONAL DOS DOCUMENTOS & PRAZOS (LICENÇAS)", 18, startY + 4.5);

        const innerStartX = 18;
        const innerAvailableW = pageWidth - 36;
        const gap = 3;
        const cardW = (innerAvailableW - (gap * (activeStatusCards.length - 1))) / activeStatusCards.length;
        const cardH = 12;
        const cardY = startY + 5.5;

        activeStatusCards.forEach((c, idx) => {
          const cardX = innerStartX + idx * (cardW + gap);
          doc.setFillColor(255, 255, 255);
          doc.roundedRect(cardX, cardY, cardW, cardH, 1.2, 1.2, 'F');
          doc.setDrawColor(226, 232, 240);
          doc.roundedRect(cardX, cardY, cardW, cardH, 1.2, 1.2, 'S');

          doc.setFillColor(c.color[0], c.color[1], c.color[2]);
          doc.roundedRect(cardX, cardY, cardW, 1.1, 0.5, 0.5, 'F');

          doc.setFont("helvetica", "bold");
          doc.setFontSize(5.8);
          doc.setTextColor(100, 116, 139);
          doc.text(c.label, cardX + 2.2, cardY + 4.2);

          doc.setFont("helvetica", "bold");
          doc.setFontSize(9.5);
          doc.setTextColor(c.color[0], c.color[1], c.color[2]);
          doc.text(String(c.value), cardX + 2.2, cardY + 8.8);

          if (c.subtitle && cardW > 28) {
            doc.setFont("helvetica", "normal");
            doc.setFontSize(4.8);
            doc.setTextColor(148, 163, 184);
            doc.text(c.subtitle, cardX + cardW - 2.2, cardY + 8.8, { align: 'right' });
          }
        });

        startY += bannerH + 4;
      }
    }

    // Prepare table rows
    const tableBody = filteredItems.map(it => {
      const j = it.justification;
      const isRegular = it.status === 'REGULAR' || it.status === 'OK' || !it.isAlert;
      const cat = getJustificationCategoryInfo(j?.reason, j?.actionForecast, j?.observations);
      let reasonText = j?.reason || (isRegular ? "Regular / Sem pendência" : "Pendente de justificativa");
      if (cat.key && j?.reason) {
        reasonText = `${cat.pdfTag} ${reasonText}`;
      }

      return [
        it.plate,
        it.fleet,
        it.operation,
        it.documentType,
        isRegular ? "REGULAR" : it.status,
        reasonText,
        j?.authorizedBy || "-",
        j?.actionForecast || (isRegular ? "Em dia" : "-"),
        j?.observations || (isRegular ? "Documento regular sem pendências" : "-")
      ];
    });

    autoTable(doc, {
      head: [["Placa", "Frota", "Operação", "Documento", "Status", "Motivo / Justificativa", "Quem Autorizou", "Previsão / Condição", "Observações Detalhadas"]],
      body: tableBody,
      startY: startY,
      theme: 'grid',
      headStyles: {
        fillColor: [26, 54, 138],
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        fontSize: 8,
        halign: 'center'
      },
      styles: {
        fontSize: 7.5,
        cellPadding: 2,
        valign: 'middle',
        overflow: 'linebreak'
      },
      margin: { left: 14, right: 14 },
      columnStyles: {
        0: { cellWidth: 24, halign: 'center', fontStyle: 'bold' }, // Placa
        1: { cellWidth: 18, halign: 'center' }, // Frota
        2: { cellWidth: 28, halign: 'center' }, // Operação
        3: { cellWidth: 32 }, // Documento
        4: { cellWidth: 20, halign: 'center' }, // Status
        5: { cellWidth: 44 }, // Motivo
        6: { cellWidth: 28 }, // Autorizou
        7: { cellWidth: 28 }, // Previsão
        8: { cellWidth: 'auto' } // Observações
      },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      didParseCell: (data) => {
        if (data.section === 'body' && data.column.index === 4) {
          const status = String(data.cell.raw || '').toUpperCase();
          if (status === 'VENCIDO') data.cell.styles.textColor = [220, 38, 38];
          else if (status === 'CRITICO') data.cell.styles.textColor = [234, 88, 12];
          else if (status === 'ATENCAO') data.cell.styles.textColor = [2, 132, 199];
          else data.cell.styles.textColor = [16, 124, 65];
        }
        if (data.section === 'body' && data.column.index === 5) {
          const reason = String(data.cell.raw || '');
          if (reason.startsWith('[PARADO NO GARAGEM]')) {
            data.cell.styles.textColor = [79, 70, 229]; // índigo
            data.cell.styles.fontStyle = 'bold';
          } else if (reason.startsWith('[SEM PREVISÃO]')) {
            data.cell.styles.textColor = [2, 132, 199]; // sky
            data.cell.styles.fontStyle = 'bold';
          } else if (reason.startsWith('[PRÓX. EXERCÍCIO]')) {
            data.cell.styles.textColor = [217, 119, 6]; // âmbar
            data.cell.styles.fontStyle = 'bold';
          } else if (reason === "Pendente de justificativa") {
            data.cell.styles.textColor = [156, 163, 175];
            data.cell.styles.fontStyle = 'italic';
          } else if (reason.includes("Regular / Sem pendência")) {
            data.cell.styles.textColor = [16, 124, 65];
          }
        }
      }
    });

    // Page numbering and signatures
    const pageCount = (doc.internal as any).getNumberOfPages ? (doc.internal as any).getNumberOfPages() : doc.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      
      if (i === pageCount) {
        const finalY = doc.internal.pageSize.getHeight() - 18;
        doc.setFontSize(7.5);
        doc.setLineWidth(0.3);
        doc.setDrawColor(203, 213, 225);
        
        doc.line(40, finalY - 4, 120, finalY - 4);
        doc.setTextColor(71, 85, 105);
        doc.text("Responsável de Frota / Operações", 80, finalY, { align: "center" });

        doc.line(pageWidth - 120, finalY - 4, pageWidth - 40, finalY - 4);
        doc.text("Diretoria Executiva / Aprovação", pageWidth - 80, finalY, { align: "center" });
      }

      doc.setFontSize(7.5);
      doc.setTextColor(148, 163, 184);
      doc.text(
        `LogiFleet - Relatório de Justificativas e Observações de Licenças | Página ${i} de ${pageCount}`,
        pageWidth / 2,
        doc.internal.pageSize.getHeight() - 6,
        { align: "center" }
      );
    }

    if (isDirectPrint) {
      doc.autoPrint();
      const blobUrl = doc.output('bloburl');
      window.open(blobUrl, '_blank');
    } else {
      doc.save(`Relatorio_Justificativas_Licencas_${format(new Date(), "dd-MM-yyyy")}.pdf`);
    }
  };

  const exportJustificationsExcel = () => {
    const dataToExport = filteredItems.map((item, idx) => {
      return {
        "Item": idx + 1,
        "Placa": item.plate || "-",
        "Frota": item.fleet || "-",
        "Operação": formatOperationName(item.operation),
        "Licença / Documento": item.documentType || "-",
        "Status": item.status || "VENCIDO",
        "Subtipo de Justificativa": getJustificationCategoryInfo(item.justification?.reason, item.justification?.actionForecast, item.justification?.observations).label || (item.justification ? "Geral" : "-"),
        "Motivo da Pendência": item.justification?.reason || "Pendente de justificativa",
        "Quem Autorizou": item.justification?.authorizedBy || "-",
        "Previsão / Condição": item.justification?.actionForecast || "-",
        "Observações Detalhadas": item.justification?.observations || "-",
        "Data de Registro": formatSafeDate(item.justification?.updatedAt || item.justification?.createdAt, "dd/MM/yyyy HH:mm")
      };
    });

    const worksheet = XLSX.utils.json_to_sheet(dataToExport);
    worksheet["!cols"] = [
      { wch: 6 },  // Item
      { wch: 12 }, // Placa
      { wch: 10 }, // Frota
      { wch: 22 }, // Operação
      { wch: 24 }, // Licença / Documento
      { wch: 14 }, // Status
      { wch: 42 }, // Motivo da Pendência
      { wch: 24 }, // Quem Autorizou
      { wch: 30 }, // Previsão / Condição
      { wch: 48 }, // Observações Detalhadas
      { wch: 18 }  // Data de Registro
    ];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Justificativas");
    XLSX.writeFile(workbook, `Justificativas_Licencas_${format(new Date(), "dd-MM-yyyy_HHmm")}.xlsx`);

    // Sincroniza e cria ponto de backup automático no servidor para proteção contra perdas
    try {
      fetch("/api/justifications/backup-snapshot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: justifications,
          reason: `Exportação Excel Licenças`
        })
      }).catch(() => {});
    } catch (_) {}

    setSaveSuccessMsg("Planilha Excel (.xlsx) extraída com sucesso e ponto de backup registrado no servidor para restauração!");
    setTimeout(() => setSaveSuccessMsg(null), 4500);
  };

  const copyTableToClipboard = () => {
    const headers = [
      "Item", "Placa", "Frota", "Operação", "Licença / Documento", "Status",
      "Motivo da Pendência", "Quem Autorizou", "Previsão / Condição", "Observações", "Data Registro"
    ];
    const rows = filteredItems.map((item, idx) => [
      idx + 1,
      item.plate || "-",
      item.fleet || "-",
      formatOperationName(item.operation),
      item.documentType || "-",
      item.status || "VENCIDO",
      item.justification?.reason || "Pendente de justificativa",
      item.justification?.authorizedBy || "-",
      item.justification?.actionForecast || "-",
      (item.justification?.observations || "-").replace(/\n/g, " "),
      item.justification?.updatedAt || "-"
    ]);
    const tsv = [headers.join("\t"), ...rows.map(r => r.join("\t"))].join("\n");
    navigator.clipboard.writeText(tsv).then(() => {
      setCopiedTable(true);
      setTimeout(() => setCopiedTable(false), 2500);
    });
  };

  return (
    <div id="license-justifications-tab" className="space-y-6">
      {/* Top Banner & Action Controls - Padrão de Cor e Estilo Padronizado */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-6 bg-gradient-to-r from-blue-900 via-indigo-900 to-slate-900 rounded-3xl text-white shadow-xl shadow-blue-950/20 border border-blue-700/30 relative overflow-hidden">
        <div className="absolute -right-12 -bottom-12 w-64 h-64 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10 space-y-1">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-blue-500/20 rounded-xl text-blue-300 border border-blue-400/20">
              <FileSignature size={22} />
            </div>
            <h2 className="text-xl md:text-2xl font-display font-black tracking-tight text-white">
              Justificativas e Ocorrências da Frota
            </h2>
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-black bg-blue-500/20 text-blue-200 border border-blue-400/30">
              GOVERNANÇA ATIVA
            </span>
          </div>
          <p className="text-xs text-blue-200/80 font-medium max-w-2xl">
            Controle gerencial e formalização de pendências documentais, autorizações da diretoria e previsões de pagamento.
          </p>
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-500/20 border border-emerald-400/30 text-emerald-300">
              <Database size={12} className="text-emerald-400" />
              Banco de Dados Conectado • Salvamento Automático Ativo
            </span>
            <span className="text-[11px] text-blue-200/70 font-medium">
              • {filteredItems.length} veículos listados ({stats.withJust} com justificativa)
            </span>
          </div>
        </div>

        <div className="relative z-10 flex flex-wrap items-center gap-2">
          <button
            id="btn-view-spreadsheet-table"
            onClick={() => setIsSpreadsheetModalOpen(true)}
            className="flex items-center gap-2 px-3.5 py-2.5 rounded-2xl text-xs font-bold bg-slate-800/90 hover:bg-slate-700/90 border border-slate-600/70 text-slate-100 shadow-sm transition-all cursor-pointer"
            title="Visualizar banco de dados em formato de planilha na tela"
          >
            <Table size={15} className="text-blue-300" />
            <span>Visualizar Planilha</span>
          </button>

          <button
            id="btn-export-justifications-excel"
            onClick={exportJustificationsExcel}
            className="flex items-center gap-2 px-3.5 py-2.5 rounded-2xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-md shadow-emerald-600/20 transition-all cursor-pointer"
            title="Extrair dados das justificativas e ocorrências em planilha Excel (.xlsx)"
          >
            <FileSpreadsheet size={15} />
            <span>Extrair em Excel</span>
          </button>

          <button
            id="btn-restore-points-lic"
            onClick={() => {
              setRestoreTab('server');
              setIsRestoreModalOpen(true);
              setIsLoadingServerBackups(true);
              setServerBackupsError(null);
              fetchServerBackups();
            }}
            className="flex items-center gap-2 px-3.5 py-2.5 rounded-2xl text-xs font-bold bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white shadow-md shadow-indigo-600/25 transition-all cursor-pointer"
            title="Ver e restaurar pontos de backup gravados no servidor"
          >
            <Database size={15} />
            <span>Pontos de Restauração</span>
            {Array.isArray(serverBackups) && serverBackups.length > 0 && (
              <span className="px-1.5 py-0.5 rounded-full text-[10px] font-mono font-black bg-white/20 text-white">
                {serverBackups.length}
              </span>
            )}
          </button>

          <button
            id="btn-restore-excel-lic"
            onClick={() => {
              setRestoreTab('file');
              setIsRestoreModalOpen(true);
              setIsLoadingServerBackups(true);
              setServerBackupsError(null);
              fetchServerBackups();
            }}
            className="flex items-center gap-2 px-3.5 py-2.5 rounded-2xl text-xs font-bold bg-slate-800 hover:bg-slate-700 text-white border border-slate-700 shadow-sm transition-all cursor-pointer"
            title="Restaurar justificativas a partir de uma planilha Excel (.xlsx, .xls) ou backups salvos"
          >
            <RotateCcw size={15} />
            <span>Restaurar do Excel</span>
          </button>

          {/* Flegue para selecionar a impressão dos cards no relatório PDF */}
          <label 
            id="flegue-print-cards-lic"
            className="flex items-center gap-2 px-3.5 py-2.5 rounded-2xl text-xs font-bold bg-slate-800/90 hover:bg-slate-700/90 border border-slate-600/70 text-slate-100 shadow-sm transition-all cursor-pointer select-none"
            title="Flegue para selecionar se os cards de resumo devem ser incluídos na impressão do relatório PDF"
          >
            <input 
              type="checkbox" 
              checked={printCardsInPdf} 
              onChange={(e) => handleTogglePrintCards(e.target.checked)}
              className="w-4 h-4 rounded border-slate-500 text-cyan-500 focus:ring-cyan-500 cursor-pointer accent-cyan-500"
            />
            <span className="text-slate-300">Imprimir Cards:</span>
            <span className={cn(
              "text-[10px] font-black uppercase px-2 py-0.5 rounded-md tracking-wider transition-all",
              printCardsInPdf 
                ? "bg-cyan-500/30 text-cyan-300 border border-cyan-400/40 shadow-xs shadow-cyan-500/20" 
                : "bg-slate-700/60 text-slate-400 border border-slate-600"
            )}>
              {printCardsInPdf ? "SIM" : "NÃO"}
            </span>
          </label>

          {/* Flegue para visualizar também os documentos regulares (sem pendências) no sistema e no relatório PDF */}
          <label 
            id="flegue-include-regular-lic"
            className="flex items-center gap-2 px-3.5 py-2.5 rounded-2xl text-xs font-bold bg-slate-800/90 hover:bg-slate-700/90 border border-slate-600/70 text-slate-100 shadow-sm transition-all cursor-pointer select-none"
            title="Flegue para visualizar no sistema e incluir no relatório PDF os documentos regulares que não possuem pendências"
          >
            <input 
              type="checkbox" 
              checked={includeRegularDocs} 
              onChange={(e) => handleToggleIncludeRegular(e.target.checked)}
              className="w-4 h-4 rounded border-slate-500 text-emerald-500 focus:ring-emerald-500 cursor-pointer accent-emerald-500"
            />
            <span className="text-slate-300">Docs Regulares:</span>
            <span className={cn(
              "text-[10px] font-black uppercase px-2 py-0.5 rounded-md tracking-wider transition-all",
              includeRegularDocs 
                ? "bg-emerald-500/30 text-emerald-300 border border-emerald-400/40 shadow-xs shadow-emerald-500/20" 
                : "bg-slate-700/60 text-slate-400 border border-slate-600"
            )}>
              {includeRegularDocs ? "EXIBINDO" : "OCULTOS"}
            </span>
          </label>

          {/* Flegue para isolar ou incluir justificativas sincronizadas de todas as estações de trabalho */}
          <label 
            id="flegue-include-all-stations-lic"
            className="flex items-center gap-2 px-3.5 py-2.5 rounded-2xl text-xs font-bold bg-slate-800/90 hover:bg-slate-700/90 border border-slate-600/70 text-slate-100 shadow-sm transition-all cursor-pointer select-none"
            title="Flegue para visualizar também justificativas sincronizadas de outras estações de trabalho não presentes na planilha atual"
          >
            <input 
              type="checkbox" 
              checked={includeAllStations} 
              onChange={(e) => handleToggleIncludeAllStations(e.target.checked)}
              className="w-4 h-4 rounded border-slate-500 text-indigo-500 focus:ring-indigo-500 cursor-pointer accent-indigo-500"
            />
            <span className="text-slate-300">Todas as Estações:</span>
            <span className={cn(
              "text-[10px] font-black uppercase px-2 py-0.5 rounded-md tracking-wider transition-all",
              includeAllStations 
                ? "bg-indigo-500/30 text-indigo-300 border border-indigo-400/40 shadow-xs shadow-indigo-500/20" 
                : "bg-slate-700/60 text-slate-400 border border-slate-600"
            )}>
              {includeAllStations ? "SIM" : "FROTA ATUAL"}
            </span>
          </label>

          <button
            id="btn-export-justifications-pdf"
            onClick={() => exportJustificationsPDF(false)}
            className="flex items-center gap-2 px-3.5 py-2.5 rounded-2xl text-xs font-bold bg-white/10 hover:bg-white/20 border border-white/20 text-white backdrop-blur-md transition-all cursor-pointer"
            title={`Exportar relatório em PDF das justificativas (${printCardsInPdf ? 'com cards de resumo' : 'sem cards'})`}
          >
            <Download size={15} />
            <span>Salvar em PDF</span>
          </button>

          <button
            id="btn-print-justifications"
            onClick={() => exportJustificationsPDF(true)}
            className="flex items-center gap-2 px-3.5 py-2.5 rounded-2xl text-xs font-bold bg-white/10 hover:bg-white/20 border border-white/20 text-white backdrop-blur-md transition-all cursor-pointer"
            title={`Imprimir relatório diretamente na impressora (${printCardsInPdf ? 'com cards de resumo' : 'sem cards'})`}
          >
            <Printer size={15} />
            <span>Imprimir</span>
          </button>

          <button
            id="btn-lic-history-modal"
            onClick={() => handleOpenHistory(null)}
            className="flex items-center gap-2 px-3.5 py-2.5 rounded-2xl text-xs font-bold bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 border border-cyan-400/40 backdrop-blur-md transition-all cursor-pointer shadow-xs"
            title="Consultar histórico detalhado de justificativas e ações anteriores por veículo"
          >
            <History size={15} />
            <span>Histórico de Ações</span>
            {effectiveHistory && effectiveHistory.length > 0 && (
              <span className="px-1.5 py-0.5 rounded-full text-[10px] font-black bg-cyan-400 text-slate-950 font-mono">
                {effectiveHistory.length}
              </span>
            )}
          </button>

          <button
            id="btn-add-justification"
            onClick={() => handleOpenModal()}
            className="flex items-center gap-2 px-4 py-2.5 rounded-2xl text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white shadow-md shadow-blue-500/25 transition-all cursor-pointer"
          >
            <Plus size={16} />
            <span>Nova Justificativa</span>
          </button>
        </div>
      </div>

      {saveSuccessMsg && (
        <div className="p-3.5 bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 rounded-2xl text-xs font-bold text-emerald-800 dark:text-emerald-300 flex items-center gap-2 animate-fadeIn">
          <CheckCircle2 size={16} className="text-emerald-600" />
          <span>{saveSuccessMsg}</span>
        </div>
      )}

      {/* 1. CARDS DE GOVERNANÇA & JUSTIFICATIVAS DA FROTA */}
      <div className="space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2 px-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Governança & Justificativas da Frota
            </span>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
              {stats.total} Alertas
            </span>
            <span className="hidden sm:inline-flex items-center gap-1 text-[10px] text-slate-500 dark:text-slate-400 font-medium">
              • <span className="font-bold text-slate-700 dark:text-slate-300">Cards 4, 5 e 6:</span> desdobramentos de "Com Justificativa"
            </span>
          </div>
          {cardFilter !== 'ALL' && (
            <button
              onClick={() => {
                setCardFilter('ALL');
                setOnlyWithJustification(null);
              }}
              className="text-[11px] font-bold text-blue-600 hover:text-blue-800 dark:text-blue-400 flex items-center gap-1 cursor-pointer"
            >
              <X size={12} /> Limpar filtro de governança
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3.5">
          <Card3D 
            variant="blue"
            isSelected={cardFilter === 'ALL' && onlyWithJustification === null}
            onClick={() => {
              setCardFilter('ALL');
              setOnlyWithJustification(null);
            }}
            title="Ver todos os alertas"
          >
            <div className="flex items-center justify-between w-full">
              <div>
                <span className="text-xs font-bold text-slate-500 dark:text-slate-400 block mb-1">Total de Alertas</span>
                <span className="text-2xl font-black text-slate-900 dark:text-white">{stats.total}</span>
                <span className="text-[10px] text-slate-400 dark:text-slate-500 block mt-0.5">Veículos / licenças</span>
              </div>
              <div className="w-11 h-11 rounded-2xl bg-blue-50 dark:bg-blue-950/80 flex items-center justify-center text-blue-600 dark:text-cyan-400 border border-blue-100/60 dark:border-blue-800/60 shrink-0 shadow-xs">
                <Truck size={20} />
              </div>
            </div>
          </Card3D>

          <Card3D 
            variant="emerald"
            isSelected={cardFilter === 'WITH_JUST' || onlyWithJustification === true}
            onClick={() => {
              if (cardFilter === 'WITH_JUST' || onlyWithJustification === true) {
                setCardFilter('ALL');
                setOnlyWithJustification(null);
              } else {
                setCardFilter('WITH_JUST');
                setOnlyWithJustification(true);
              }
            }}
            title="Filtrar com justificativa (inclui desdobramentos de Postergados, Garagem e Sem Previsão)"
          >
            <div className="flex items-center justify-between w-full">
              <div>
                <span className="text-xs font-bold text-slate-500 dark:text-slate-400 block mb-1">Com Justificativa</span>
                <span className="text-2xl font-black text-emerald-600 dark:text-emerald-300">{stats.withJust}</span>
                <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium block mt-0.5" title="Total de justificativas (engloba Próx. Exercício, Garagem e Sem Previsão)">
                  Registros ativos (total)
                </span>
              </div>
              <div className="w-11 h-11 rounded-2xl bg-emerald-50 dark:bg-emerald-950/80 flex items-center justify-center text-emerald-600 dark:text-emerald-300 border border-emerald-100/60 dark:border-emerald-800/60 shrink-0 shadow-xs">
                <ShieldCheck size={20} />
              </div>
            </div>
          </Card3D>

          <Card3D 
            variant="rose"
            isSelected={cardFilter === 'PENDING' || onlyWithJustification === false}
            onClick={() => {
              if (cardFilter === 'PENDING' || onlyWithJustification === false) {
                setCardFilter('ALL');
                setOnlyWithJustification(null);
              } else {
                setCardFilter('PENDING');
                setOnlyWithJustification(false);
              }
            }}
            title={`Filtrar pendentes de justificativa (${pendingStatusesLabel})`}
          >
            <div className="flex items-center justify-between w-full">
              <div>
                <span className="text-xs font-bold text-slate-500 dark:text-slate-400 block mb-1">Pendentes</span>
                <span className="text-2xl font-black text-rose-600 dark:text-rose-400">{stats.pendingJust}</span>
                <span className="text-[10px] text-rose-500 dark:text-rose-400 font-medium block mt-0.5" title={`Critério ativo: ${pendingStatusesLabel}`}>
                  {pendingStatusesLabel}
                </span>
              </div>
              <div className="w-11 h-11 rounded-2xl bg-rose-50 dark:bg-rose-950/80 flex items-center justify-center text-rose-600 dark:text-rose-400 border border-rose-100/60 dark:border-rose-800/60 shrink-0 shadow-xs">
                <AlertOctagon size={20} />
              </div>
            </div>
          </Card3D>

          <Card3D 
            variant="amber"
            isSelected={cardFilter === 'POSTPONED'}
            onClick={() => setCardFilter(prev => prev === 'POSTPONED' ? 'ALL' : 'POSTPONED')}
            title="Filtrar por justificativa: Postergados para o próximo exercício (desdobramento de Com Justificativa)"
          >
            <div className="flex items-center justify-between w-full">
              <div>
                <div className="flex items-center gap-1 mb-1">
                  <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                    ↳ Justificado
                  </span>
                </div>
                <span className="text-xs font-bold text-slate-700 dark:text-slate-200 block mb-1">Postergados</span>
                <span className="text-2xl font-black text-amber-600 dark:text-amber-400">{stats.nextYearPostponed}</span>
                <span className="text-[10px] text-amber-600 dark:text-amber-400 font-medium block mt-0.5">Próx. Exercício</span>
              </div>
              <div className="w-11 h-11 rounded-2xl bg-amber-50 dark:bg-amber-950/80 flex items-center justify-center text-amber-600 dark:text-amber-400 border border-amber-100/60 dark:border-amber-800/60 shrink-0 shadow-xs">
                <Calendar size={20} />
              </div>
            </div>
          </Card3D>

          <Card3D 
            variant="indigo"
            isSelected={cardFilter === 'GARAGEM'}
            onClick={() => setCardFilter(prev => prev === 'GARAGEM' ? 'ALL' : 'GARAGEM')}
            title="Filtrar por justificativa: Parado no Garagem (desdobramento de Com Justificativa)"
          >
            <div className="flex items-center justify-between w-full">
              <div>
                <div className="flex items-center gap-1 mb-1">
                  <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20">
                    ↳ Justificado
                  </span>
                </div>
                <span className="text-xs font-bold text-slate-700 dark:text-slate-200 block mb-1">Parado no Garagem</span>
                <span className="text-2xl font-black text-indigo-600 dark:text-indigo-400">{stats.paradoGaragem}</span>
                <span className="text-[10px] text-indigo-600 dark:text-indigo-400 font-semibold block mt-0.5">Autorizações & Gestão</span>
              </div>
              <div className="w-11 h-11 rounded-2xl bg-indigo-50 dark:bg-indigo-950/80 flex items-center justify-center text-indigo-600 dark:text-indigo-400 border border-indigo-100/60 dark:border-indigo-800/60 shrink-0 shadow-xs">
                <Warehouse size={20} />
              </div>
            </div>
          </Card3D>

          <Card3D 
            variant="sky"
            isSelected={cardFilter === 'SEM_PREVISAO'}
            onClick={() => setCardFilter(prev => prev === 'SEM_PREVISAO' ? 'ALL' : 'SEM_PREVISAO')}
            title="Filtrar por justificativa: Sem Previsão de Renovação (desdobramento de Com Justificativa)"
          >
            <div className="flex items-center justify-between w-full">
              <div>
                <div className="flex items-center gap-1 mb-1">
                  <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-500/20">
                    ↳ Justificado
                  </span>
                </div>
                <span className="text-xs font-bold text-slate-700 dark:text-slate-200 block mb-1">Sem Previsão</span>
                <span className="text-2xl font-black text-sky-600 dark:text-sky-400">{stats.semPrevisao}</span>
                <span className="text-[10px] text-sky-600 dark:text-sky-400 font-semibold block mt-0.5">Prazos & Operação</span>
              </div>
              <div className="w-11 h-11 rounded-2xl bg-sky-50 dark:bg-sky-950/80 flex items-center justify-center text-sky-600 dark:text-sky-400 border border-sky-100/60 dark:border-sky-800/60 shrink-0 shadow-xs">
                <CalendarX size={20} />
              </div>
            </div>
          </Card3D>
        </div>
      </div>

      {/* 2. CARDS DE STATUS OPERACIONAL DOS DOCUMENTOS & PRAZOS (IMAGEM 2 - SEPARADOS) */}
      <div className="space-y-2.5">
        <div className="flex items-center justify-between px-1">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Status Operacional dos Documentos & Prazos (Licenças)
            </span>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
              Status da Frota
            </span>
          </div>
          {statusCardFilter !== 'ALL' && (
            <button
              onClick={() => setStatusCardFilter('ALL')}
              className="text-[11px] font-bold text-rose-600 hover:text-rose-800 dark:text-rose-400 flex items-center gap-1 cursor-pointer"
            >
              <X size={12} /> Limpar filtro de status ({statusCardFilter})
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
          {/* Card Vencido */}
          <Card3D 
            variant="rose"
            isSelected={statusCardFilter === 'VENCIDO'}
            onClick={() => setStatusCardFilter(prev => prev === 'VENCIDO' ? 'ALL' : 'VENCIDO')}
            title="Filtrar licenças vencidas"
          >
            <div className="flex items-center justify-between w-full">
              <div>
                <span className="text-xs font-bold text-slate-500 dark:text-slate-400 block mb-1">Vencidos</span>
                <span className="text-2xl font-black text-rose-600 dark:text-rose-400">{statusStats.vencido}</span>
                <span className="text-[10px] text-rose-500 dark:text-rose-400 font-semibold block mt-0.5">Prazo expirado</span>
              </div>
              <div className="w-11 h-11 rounded-2xl bg-rose-50 dark:bg-rose-950/80 flex items-center justify-center text-rose-600 dark:text-rose-400 border border-rose-100/60 dark:border-rose-800/60 shrink-0 shadow-xs">
                <AlertOctagon size={20} />
              </div>
            </div>
          </Card3D>

          {/* Card Crítico */}
          <Card3D 
            variant="amber"
            isSelected={statusCardFilter === 'CRITICO'}
            onClick={() => setStatusCardFilter(prev => prev === 'CRITICO' ? 'ALL' : 'CRITICO')}
            title="Filtrar licenças com vencimento em até 15 dias"
          >
            <div className="flex items-center justify-between w-full">
              <div>
                <span className="text-xs font-bold text-slate-500 dark:text-slate-400 block mb-1">Crítico (≤ 15d)</span>
                <span className="text-2xl font-black text-amber-600 dark:text-amber-400">{statusStats.critico}</span>
                <span className="text-[10px] text-amber-600 dark:text-amber-400 font-semibold block mt-0.5">Urgência de renovação</span>
              </div>
              <div className="w-11 h-11 rounded-2xl bg-amber-50 dark:bg-amber-950/80 flex items-center justify-center text-amber-600 dark:text-amber-400 border border-amber-100/60 dark:border-amber-800/60 shrink-0 shadow-xs">
                <AlertTriangle size={20} />
              </div>
            </div>
          </Card3D>

          {/* Card Em Atenção */}
          <Card3D 
            variant="blue"
            isSelected={statusCardFilter === 'ATENCAO'}
            onClick={() => setStatusCardFilter(prev => prev === 'ATENCAO' ? 'ALL' : 'ATENCAO')}
            title="Filtrar licenças com vencimento em até 30 dias"
          >
            <div className="flex items-center justify-between w-full">
              <div>
                <span className="text-xs font-bold text-slate-500 dark:text-slate-400 block mb-1">Em Atenção (≤ 30d)</span>
                <span className="text-2xl font-black text-blue-600 dark:text-cyan-400">{statusStats.atencao}</span>
                <span className="text-[10px] text-blue-500 dark:text-blue-400 font-medium block mt-0.5">Acompanhamento prévio</span>
              </div>
              <div className="w-11 h-11 rounded-2xl bg-blue-50 dark:bg-blue-950/80 flex items-center justify-center text-blue-600 dark:text-cyan-400 border border-blue-100/60 dark:border-blue-800/60 shrink-0 shadow-xs">
                <Clock size={20} />
              </div>
            </div>
          </Card3D>

          {/* Card Regular / Em Dia */}
          <Card3D 
            variant="emerald"
            isSelected={statusCardFilter === 'REGULAR' || (includeRegularDocs && statusCardFilter === 'ALL')}
            onClick={() => {
              if (statusCardFilter === 'REGULAR') {
                setStatusCardFilter('ALL');
              } else {
                setStatusCardFilter('REGULAR');
                setIncludeRegularDocs(true);
              }
            }}
            title="Visualizar documentos regulares sem pendências"
          >
            <div className="flex items-center justify-between w-full">
              <div>
                <span className="text-xs font-bold text-slate-500 dark:text-slate-400 block mb-1">Regular / Em Dia</span>
                <span className="text-2xl font-black text-emerald-600 dark:text-emerald-300">{statusStats.regular}</span>
                <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium block mt-0.5">
                  {includeRegularDocs || statusCardFilter === 'REGULAR' ? 'Exibindo na tabela' : 'Clique para visualizar'}
                </span>
              </div>
              <div className="w-11 h-11 rounded-2xl bg-emerald-50 dark:bg-emerald-950/80 flex items-center justify-center text-emerald-600 dark:text-emerald-300 border border-emerald-100/60 dark:border-emerald-800/60 shrink-0 shadow-xs">
                <CheckCircle2 size={20} />
              </div>
            </div>
          </Card3D>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white dark:bg-slate-800 p-4 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-sm flex flex-wrap items-center justify-between gap-3 relative z-50 overflow-visible">
        <div className="flex flex-1 min-w-[240px] items-center gap-2 bg-slate-50 dark:bg-slate-900/60 px-3.5 py-2.5 rounded-2xl border border-slate-200/80 dark:border-slate-700/80">
          <Search size={16} className="text-slate-400 shrink-0" />
          <input
            id="search-justifications"
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar por placa, frota, operação, motivo, autorizador ou detalhes..."
            className="bg-transparent border-none outline-none text-xs text-slate-800 dark:text-slate-200 w-full placeholder:text-slate-400 font-medium"
          />
          {searchTerm && (
            <button onClick={() => setSearchTerm("")} className="text-slate-400 hover:text-slate-600">
              <X size={14} />
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Filtro Placa (Multi-select com flegue) */}
          <MultiSelectFilter
            id="filter-lic-just-placas"
            label="Placa"
            placeholder="Todas as Placas"
            icon={<Search size={14} />}
            options={plateOptions}
            selectedValues={selectedPlates}
            onChange={setSelectedPlates}
            searchPlaceholder="Buscar placa..."
            dropdownWidth="w-72"
          />

          {/* Filtro Frota (Multi-select com flegue) */}
          <MultiSelectFilter
            id="filter-lic-just-frotas"
            label="Frota"
            placeholder="Todas as Frotas"
            icon={<Truck size={14} />}
            options={fleetOptions}
            selectedValues={selectedFleets}
            onChange={setSelectedFleets}
            searchPlaceholder="Buscar número de frota..."
            dropdownWidth="w-72"
          />

          {/* Filtro Licença (Multi-select com flegue) */}
          <MultiSelectFilter
            id="filter-lic-just-licencas"
            label="Licença"
            placeholder="Todas as Licenças"
            icon={<FileText size={14} />}
            options={licenseOptions}
            selectedValues={selectedLicenses}
            onChange={setSelectedLicenses}
            searchPlaceholder="Buscar licença..."
            dropdownWidth="w-72"
          />

          {/* Filtro Status (Multi-select com flegue) */}
          <MultiSelectFilter
            id="filter-lic-just-status"
            label="Status"
            placeholder="Todos os Status"
            icon={<Filter size={14} />}
            options={statusOptions}
            selectedValues={selectedStatuses}
            onChange={setSelectedStatuses}
            searchPlaceholder="Buscar status..."
            showSearchThreshold={99}
            dropdownWidth="w-72"
          />

          {/* Filtro Operação (Multi-select com flegue - Padrão da Imagem 2) */}
          <MultiSelectFilter
            id="filter-lic-just-operacao"
            label="Operação"
            placeholder="Todas as Operações"
            icon={<Building2 size={14} />}
            options={operationOptions}
            selectedValues={selectedOperations}
            onChange={setSelectedOperations}
            searchPlaceholder="Buscar operação..."
            dropdownWidth="w-72 sm:w-80"
          />

          {/* Botão / Seletor de Critério de Pendentes */}
          <PendingStatusSelector
            id="filter-lic-pending-status-rule"
            selectedStatuses={pendingStatuses}
            onChange={handlePendingStatusesChange}
            statusCounts={pendingStatusCounts}
            defaultStatuses={['VENCIDO', 'CRITICO']}
          />

          {/* Botão Limpar Filtros */}
          {(selectedPlates.length > 0 || selectedFleets.length > 0 || selectedOperations.length > 0 || selectedLicenses.length > 0 || selectedStatuses.length > 0 || cardFilter !== 'ALL' || statusCardFilter !== 'ALL' || onlyWithJustification !== null || searchTerm.trim() !== '') && (
            <button
              onClick={() => {
                setSelectedPlates([]);
                setSelectedFleets([]);
                setSelectedOperations([]);
                setSelectedLicenses([]);
                setSelectedStatuses([]);
                setCardFilter('ALL');
                setStatusCardFilter('ALL');
                setOnlyWithJustification(null);
                setSearchTerm("");
              }}
              className="flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-bold text-slate-500 hover:text-rose-600 dark:text-slate-400 dark:hover:text-rose-400 bg-slate-100 dark:bg-slate-900/60 hover:bg-rose-50 dark:hover:bg-rose-950/30 rounded-2xl border border-slate-200/80 dark:border-slate-700/80 transition-all cursor-pointer"
              title="Limpar todos os filtros ativos"
            >
              <X size={12} />
              <span>Limpar</span>
            </button>
          )}

          {/* Quick Filter Buttons */}
          <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-900/80 p-1 rounded-2xl border border-slate-200 dark:border-slate-700">
            <button
              onClick={() => {
                setCardFilter('ALL');
                setOnlyWithJustification(null);
              }}
              className={`px-2.5 py-1.5 rounded-xl text-[11px] font-bold transition-all cursor-pointer ${
                cardFilter === 'ALL' && onlyWithJustification === null
                  ? "bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900"
              }`}
            >
              Todos ({stats.total})
            </button>
            <button
              onClick={() => {
                setCardFilter('WITH_JUST');
                setOnlyWithJustification(true);
              }}
              className={`px-2.5 py-1.5 rounded-xl text-[11px] font-bold transition-all cursor-pointer ${
                cardFilter === 'WITH_JUST' || onlyWithJustification === true
                  ? "bg-emerald-600 text-white shadow-sm"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900"
              }`}
            >
              Com Justificativa ({stats.withJust})
            </button>
            <button
              onClick={() => {
                setCardFilter('PENDING');
                setOnlyWithJustification(false);
              }}
              className={`px-2.5 py-1.5 rounded-xl text-[11px] font-bold transition-all cursor-pointer ${
                cardFilter === 'PENDING' || onlyWithJustification === false
                  ? "bg-rose-600 text-white shadow-sm"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900"
              }`}
            >
              Sem Justificativa ({stats.pendingJust})
            </button>
          </div>

          {/* View Mode Toggle: Tabela / Cards */}
          <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-900/80 p-1 rounded-2xl border border-slate-200 dark:border-slate-700">
            <button
              id="btn-lic-view-table"
              onClick={() => setViewMode("table")}
              title="Visualizar em formato de Tabela"
              className={cn(
                "px-2.5 py-1.5 rounded-xl text-[11px] font-bold transition-all flex items-center gap-1.5 cursor-pointer",
                viewMode === "table"
                  ? "bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-400 shadow-sm"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900"
              )}
            >
              <Table size={13} />
              <span>Tabela</span>
            </button>
            <button
              id="btn-lic-view-cards"
              onClick={() => setViewMode("cards")}
              title="Visualizar em formato de Cards"
              className={cn(
                "px-2.5 py-1.5 rounded-xl text-[11px] font-bold transition-all flex items-center gap-1.5 cursor-pointer",
                viewMode === "cards"
                  ? "bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-400 shadow-sm"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900"
              )}
            >
              <LayoutGrid size={13} />
              <span>Cards</span>
            </button>
          </div>
        </div>
      </div>

      {/* Main Content: Table View or Cards View */}
      {viewMode === "table" ? (
        <div className="bg-white dark:bg-slate-800 rounded-3xl border border-slate-200 dark:border-slate-700 overflow-hidden shadow-sm relative z-10">
          {/* Quick inline edit tip banner */}
          <div className="px-4 py-2 bg-blue-50/60 dark:bg-blue-950/30 border-b border-blue-100 dark:border-blue-900/40 flex items-center justify-between text-[11px] text-blue-700 dark:text-blue-300">
            <div className="flex items-center gap-1.5 font-medium">
              <PenLine size={13} className="text-blue-600 shrink-0" />
              <span>
                <strong>Edição rápida na tabela:</strong> clique diretamente nos campos vazios para digitar (salva automaticamente ao sair do campo ou pressionar Enter).
              </span>
            </div>
            <span className="text-[10px] text-blue-500 font-mono hidden sm:inline">
              {filteredItems.length} registros
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-900/60 border-b border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 font-bold uppercase text-[10px] tracking-wider">
                  <th className="py-3 px-3">Placa / Frota</th>
                  <th className="py-3 px-3">Operação</th>
                  <th className="py-3 px-3">Documento / Licença</th>
                  <th className="py-3 px-3 text-center">Status</th>
                  <th className="py-3 px-3 min-w-[210px]">
                    <span className="flex items-center gap-1">
                      <span>Por que está Vencido? (Motivo)</span>
                      <PenLine size={11} className="text-blue-500" />
                    </span>
                  </th>
                  <th className="py-3 px-3 min-w-[150px]">
                    <span className="flex items-center gap-1">
                      <span>Quem Autorizou?</span>
                      <PenLine size={11} className="text-blue-500" />
                    </span>
                  </th>
                  <th className="py-3 px-3 min-w-[140px]">
                    <span className="flex items-center gap-1">
                      <span>Previsão / Condição</span>
                      <PenLine size={11} className="text-blue-500" />
                    </span>
                  </th>
                  <th className="py-3 px-3 min-w-[190px]">
                    <span className="flex items-center gap-1">
                      <span>Observações</span>
                      <PenLine size={11} className="text-blue-500" />
                    </span>
                  </th>
                  <th className="py-3 px-3 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700/60">
                {filteredItems.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-12 text-center text-slate-400 dark:text-slate-500 font-medium">
                      Nenhum registro encontrado para os filtros selecionados.
                    </td>
                  </tr>
                ) : (
                  paginatedItems.map((item, idx) => {
                    const j = item.justification;
                    const hasJust = !!j;
                    const rowKey = getRowKey(item.plate, item.documentType, item.status);
                    const vals = getCellValues(item);
                    const isSavingRow = savingRowKey === rowKey;
                    const isSavedRow = savedRowKeys.has(rowKey);
                    const cat = getJustificationCategoryInfo(vals.reason, vals.actionForecast, vals.observations);

                    return (
                      <tr 
                        key={`${item.plate}_${item.documentType}_${item.status}_${idx}`}
                        className="hover:bg-slate-50/80 dark:hover:bg-slate-700/40 transition-colors"
                      >
                        <td className="py-2.5 px-3">
                          <div className="font-mono font-black text-slate-900 dark:text-white tracking-wider text-xs">
                            {item.plate}
                          </div>
                          <div className="text-[10px] text-slate-400 font-medium">
                            Frota: <span className="font-bold text-slate-600 dark:text-slate-300">{item.fleet}</span>
                          </div>
                        </td>

                        <td className="py-2.5 px-3 font-bold text-slate-700 dark:text-slate-200 whitespace-nowrap">
                          <span className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-700/70 border border-slate-200 dark:border-slate-600 text-[10px]">
                            {item.operation}
                          </span>
                        </td>

                        <td className="py-2.5 px-3 font-semibold text-slate-800 dark:text-slate-200">
                          {item.documentType}
                          {item.expiryDate && item.expiryDate !== "-" && (
                            <div className="text-[10px] text-slate-400 font-normal">
                              Vence em: {item.expiryDate}
                            </div>
                          )}
                        </td>

                        <td className="py-2.5 px-3 text-center whitespace-nowrap">
                          <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black tracking-wider uppercase inline-block border ${
                            item.status === 'VENCIDO'
                              ? "bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 border-rose-200 dark:border-rose-900"
                              : item.status === 'CRITICO'
                              ? "bg-orange-50 dark:bg-orange-950/60 text-orange-600 dark:text-orange-400 border-orange-200 dark:border-orange-900"
                              : item.status === 'ATENCAO'
                              ? "bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-900"
                              : "bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-900"
                          }`}>
                            {item.status}
                          </span>
                        </td>

                        <td className="py-2.5 px-3 min-w-[210px]">
                          {cat.key && (
                            <div className="mb-1 flex items-center gap-1">
                              <span className={cn(
                                "inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9.5px] font-bold border shadow-2xs",
                                cat.badgeClass
                              )}>
                                {cat.key === 'GARAGEM' && <Warehouse size={10} />}
                                {cat.key === 'SEM_PREVISAO' && <CalendarX size={10} />}
                                {cat.key === 'POSTPONED' && <Calendar size={10} />}
                                <span>{cat.label}</span>
                              </span>
                              <span className="text-[9px] text-slate-400 font-medium">↳ Justificado</span>
                            </div>
                          )}
                          <input
                            type="text"
                            value={vals.reason}
                            onChange={(e) => handleCellChange(item, 'reason', e.target.value)}
                            onBlur={() => handleCellBlur(item)}
                            onKeyDown={handleKeyDown}
                            placeholder="Digitar motivo / justificativa..."
                            className={cn(
                              "w-full px-2.5 py-1.5 text-xs rounded-xl border outline-none transition-all",
                              vals.reason
                                ? "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 font-semibold focus:border-blue-500 focus:ring-1 focus:ring-blue-500 shadow-2xs"
                                : "bg-slate-50/60 hover:bg-white dark:bg-slate-900/30 dark:hover:bg-slate-900/70 border-dashed border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 placeholder:text-slate-400 placeholder:italic focus:border-solid focus:border-blue-500 focus:bg-white dark:focus:bg-slate-900 focus:ring-1 focus:ring-blue-500"
                            )}
                            title="Clique para digitar o motivo diretamente"
                          />
                        </td>

                        <td className="py-2.5 px-3 min-w-[150px]">
                          <input
                            type="text"
                            value={vals.authorizedBy}
                            onChange={(e) => handleCellChange(item, 'authorizedBy', e.target.value)}
                            onBlur={() => handleCellBlur(item)}
                            onKeyDown={handleKeyDown}
                            placeholder="Quem autorizou..."
                            className={cn(
                              "w-full px-2.5 py-1.5 text-xs rounded-xl border outline-none transition-all",
                              vals.authorizedBy
                                ? "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-blue-700 dark:text-blue-300 font-bold focus:border-blue-500 focus:ring-1 focus:ring-blue-500 shadow-2xs"
                                : "bg-slate-50/60 hover:bg-white dark:bg-slate-900/30 dark:hover:bg-slate-900/70 border-dashed border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 placeholder:text-slate-400 placeholder:italic focus:border-solid focus:border-blue-500 focus:bg-white dark:focus:bg-slate-900 focus:ring-1 focus:ring-blue-500"
                            )}
                            title="Informe quem autorizou diretamente"
                          />
                        </td>

                        <td className="py-2.5 px-3 min-w-[140px]">
                          <input
                            type="text"
                            value={vals.actionForecast}
                            onChange={(e) => handleCellChange(item, 'actionForecast', e.target.value)}
                            onBlur={() => handleCellBlur(item)}
                            onKeyDown={handleKeyDown}
                            placeholder="Previsão..."
                            className={cn(
                              "w-full px-2.5 py-1.5 text-xs rounded-xl border outline-none transition-all",
                              vals.actionForecast
                                ? "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-amber-700 dark:text-amber-400 font-semibold focus:border-blue-500 focus:ring-1 focus:ring-blue-500 shadow-2xs"
                                : "bg-slate-50/60 hover:bg-white dark:bg-slate-900/30 dark:hover:bg-slate-900/70 border-dashed border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 placeholder:text-slate-400 placeholder:italic focus:border-solid focus:border-blue-500 focus:bg-white dark:focus:bg-slate-900 focus:ring-1 focus:ring-blue-500"
                            )}
                            title="Informe a previsão diretamente"
                          />
                        </td>

                        <td className="py-2.5 px-3 min-w-[190px]">
                          <input
                            type="text"
                            value={vals.observations}
                            onChange={(e) => handleCellChange(item, 'observations', e.target.value)}
                            onBlur={() => handleCellBlur(item)}
                            onKeyDown={handleKeyDown}
                            placeholder="Observações..."
                            className={cn(
                              "w-full px-2.5 py-1.5 text-xs rounded-xl border outline-none transition-all",
                              vals.observations
                                ? "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-medium focus:border-blue-500 focus:ring-1 focus:ring-blue-500 shadow-2xs"
                                : "bg-slate-50/60 hover:bg-white dark:bg-slate-900/30 dark:hover:bg-slate-900/70 border-dashed border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 placeholder:text-slate-400 placeholder:italic focus:border-solid focus:border-blue-500 focus:bg-white dark:focus:bg-slate-900 focus:ring-1 focus:ring-blue-500"
                            )}
                            title="Adicione observações diretamente"
                          />
                          {hasJust && j.updatedAt && (
                            <div className="text-[9px] text-slate-400 mt-0.5 px-1">
                              Atualizado: {j.updatedAt}
                            </div>
                          )}
                        </td>

                        <td className="py-2.5 px-3 text-right whitespace-nowrap">
                          <div className="flex items-center justify-end gap-1.5">
                            {isSavingRow && (
                              <span className="flex items-center gap-1 text-[10px] font-bold text-blue-600 bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-800 px-2 py-1 rounded-xl animate-pulse">
                                <RefreshCw size={11} className="animate-spin" />
                                <span>Salvando</span>
                              </span>
                            )}
                            {isSavedRow && (
                              <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-600 bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 px-2 py-1 rounded-xl">
                                <CheckCircle2 size={11} />
                                <span>Salvo</span>
                              </span>
                            )}
                            {hasJust ? (
                              <>
                                <button
                                  onClick={() => handleOpenHistory(item.plate)}
                                  className="p-1.5 rounded-xl bg-slate-100 hover:bg-cyan-50 text-slate-600 hover:text-cyan-600 dark:bg-slate-700 dark:hover:bg-slate-600 dark:text-slate-300 transition-colors cursor-pointer"
                                  title={`Ver histórico de ações anteriores da placa ${item.plate}`}
                                >
                                  <History size={14} />
                                </button>
                                <button
                                  onClick={() => handleOpenModal(item)}
                                  className="p-1.5 rounded-xl bg-slate-100 hover:bg-blue-50 text-slate-600 hover:text-blue-600 dark:bg-slate-700 dark:hover:bg-slate-600 dark:text-slate-300 transition-colors cursor-pointer"
                                  title="Editar no formulário completo"
                                >
                                  <Edit3 size={14} />
                                </button>
                                <button
                                  onClick={() => handleDelete(j.id, item.plate)}
                                  className="p-1.5 rounded-xl bg-slate-100 hover:bg-rose-50 text-slate-600 hover:text-rose-600 dark:bg-slate-700 dark:hover:bg-slate-600 dark:text-slate-300 transition-colors cursor-pointer"
                                  title="Excluir justificativa"
                                >
                                  <Trash2 size={14} />
                                </button>
                              </>
                            ) : (
                              <>
                                <button
                                  onClick={() => handleOpenHistory(item.plate)}
                                  className="p-1.5 rounded-xl bg-slate-100 hover:bg-cyan-50 text-slate-600 hover:text-cyan-600 dark:bg-slate-700 dark:hover:bg-slate-600 dark:text-slate-300 transition-colors cursor-pointer"
                                  title={`Ver histórico de ações anteriores da placa ${item.plate}`}
                                >
                                  <History size={14} />
                                </button>
                                <button
                                  onClick={() => handleOpenModal(item)}
                                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:hover:bg-blue-900/80 dark:text-blue-300 text-[11px] font-bold border border-blue-200 dark:border-blue-800 transition-colors cursor-pointer shadow-sm"
                                  title="Abrir formulário de justificativa"
                                >
                                  <Plus size={12} />
                                  <span>Justificar</span>
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Table Pagination Controls */}
          {filteredItems.length > 0 && (
            <div className="px-5 py-3.5 bg-slate-50/80 dark:bg-slate-900/60 border-t border-slate-200 dark:border-slate-700 flex flex-wrap items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400 font-medium">
                <span>Exibindo</span>
                <span className="font-bold text-slate-800 dark:text-slate-200 font-mono">
                  {Math.min((validCurrentPage - 1) * pageSize + 1, filteredItems.length)} - {Math.min(validCurrentPage * pageSize, filteredItems.length)}
                </span>
                <span>de</span>
                <span className="font-bold text-slate-800 dark:text-slate-200 font-mono">{filteredItems.length}</span>
                <span>registros</span>
              </div>

              <div className="flex items-center gap-3">
                {/* Page Size Selector */}
                <div className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400">
                  <span className="text-[11px]">Por página:</span>
                  <select
                    value={pageSize}
                    onChange={(e) => {
                      setPageSize(Number(e.target.value));
                      setCurrentPage(1);
                    }}
                    className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1 text-xs font-bold text-slate-700 dark:text-slate-300 outline-none cursor-pointer"
                  >
                    <option value={25}>25</option>
                    <option value={50}>50</option>
                    <option value={100}>100</option>
                    <option value={200}>200</option>
                    <option value={99999}>Todos</option>
                  </select>
                </div>

                {/* Page Navigation */}
                {totalPages > 1 && (
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                      disabled={validCurrentPage <= 1}
                      className={cn(
                        "p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 transition-colors flex items-center gap-1 text-xs font-bold",
                        validCurrentPage <= 1
                          ? "opacity-40 cursor-not-allowed bg-slate-100 dark:bg-slate-800 text-slate-400"
                          : "bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 cursor-pointer shadow-xs"
                      )}
                      title="Página Anterior"
                    >
                      <ChevronLeft size={14} />
                      <span className="hidden sm:inline">Anterior</span>
                    </button>

                    <div className="px-3 py-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg font-mono font-bold text-slate-800 dark:text-slate-200 text-xs">
                      {validCurrentPage} / {totalPages}
                    </div>

                    <button
                      onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                      disabled={validCurrentPage >= totalPages}
                      className={cn(
                        "p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 transition-colors flex items-center gap-1 text-xs font-bold",
                        validCurrentPage >= totalPages
                          ? "opacity-40 cursor-not-allowed bg-slate-100 dark:bg-slate-800 text-slate-400"
                          : "bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 cursor-pointer shadow-xs"
                      )}
                      title="Próxima Página"
                    >
                      <span className="hidden sm:inline">Próxima</span>
                      <ChevronRight size={14} />
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      ) : (
        /* Grid of Justification Cards */
        filteredItems.length === 0 ? (
          <div className="p-12 text-center bg-white dark:bg-slate-800/60 rounded-3xl border border-slate-200 dark:border-slate-700 space-y-3">
            <ShieldCheck size={40} className="mx-auto text-slate-300 dark:text-slate-600" />
            <h3 className="text-base font-bold text-slate-700 dark:text-slate-200">Nenhuma pendência encontrada</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">
              Não foram encontrados alertas ou justificativas para os filtros selecionados.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {paginatedItems.map((item, idx) => {
                const hasJust = !!item.justification;
                const j = item.justification;

              return (
                <div
                  key={`${item.plate}_${item.documentType}_${item.status}_${idx}`}
                  className={cn(
                    "p-5 rounded-3xl border transition-all flex flex-col justify-between group",
                    hasJust
                      ? "bg-white dark:bg-slate-800/90 border-slate-200 dark:border-slate-700 hover:shadow-lg hover:border-blue-400/60 dark:hover:border-blue-500/60"
                      : "bg-red-50/40 dark:bg-red-950/20 border-red-200/80 dark:border-red-900/50 hover:shadow-lg hover:border-red-400"
                  )}
                >
                  <div>
                    {/* Card Header: Plate & Status */}
                    <div className="flex items-start justify-between gap-2 mb-3">
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2">
                          <span className="text-base font-mono font-black text-slate-900 dark:text-white tracking-wider">
                            {item.plate}
                          </span>
                          {item.fleet && item.fleet !== "-" && (
                            <span className="px-2 py-0.5 rounded-lg text-[10px] font-mono font-bold bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300">
                              Frota {item.fleet}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 text-[11px] font-medium text-slate-500 dark:text-slate-400">
                          <Building2 size={12} className="text-slate-400" />
                          <span>{item.operation}</span>
                        </div>
                      </div>

                      <div className="flex flex-col items-end gap-1">
                        <span className={cn(
                          "px-2.5 py-1 rounded-xl text-[10px] font-mono font-black uppercase tracking-wider",
                          item.status === 'VENCIDO' ? "bg-red-100 text-red-700 dark:bg-red-900/60 dark:text-red-300" :
                          item.status === 'CRITICO' ? "bg-orange-100 text-orange-700 dark:bg-orange-900/60 dark:text-orange-300" :
                          item.status === 'ATENCAO' ? "bg-amber-100 text-amber-700 dark:bg-amber-900/60 dark:text-amber-300" :
                          "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/60 dark:text-emerald-300"
                        )}>
                          {item.status}
                        </span>
                        {item.expiryDate && item.expiryDate !== "-" && (
                          <span className="text-[10px] font-mono text-slate-400">
                            Venc: {item.expiryDate}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Document badge */}
                    <div className="mb-3.5 pb-3 border-b border-slate-100 dark:border-slate-700/60 flex flex-wrap items-center gap-1.5">
                      <span className="text-xs font-bold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/60 px-2.5 py-1 rounded-lg">
                        {item.documentType}
                      </span>
                      {(() => {
                        const cardCat = getJustificationCategoryInfo(j?.reason, j?.actionForecast, j?.observations);
                        if (!cardCat.key) return null;
                        return (
                          <span className={cn(
                            "inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-bold border shadow-2xs",
                            cardCat.badgeClass
                          )}>
                            {cardCat.key === 'GARAGEM' && <Warehouse size={11} />}
                            {cardCat.key === 'SEM_PREVISAO' && <CalendarX size={11} />}
                            {cardCat.key === 'POSTPONED' && <Calendar size={11} />}
                            <span>{cardCat.label}</span>
                          </span>
                        );
                      })()}
                    </div>

                    {/* Justification details or Call to Action */}
                    {hasJust ? (
                      <div className="space-y-2.5 text-xs">
                        <div className="p-3 bg-slate-50 dark:bg-slate-900/50 rounded-2xl border border-slate-200/60 dark:border-slate-700/60 space-y-1.5">
                          <div className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400 text-[10px] font-bold uppercase tracking-wider">
                            <MessageSquare size={12} className="text-blue-500" />
                            <span>Motivo / Justificativa</span>
                          </div>
                          <p className="font-bold text-slate-800 dark:text-slate-100 text-xs leading-relaxed">
                            {j?.reason || "Sem motivo formal informado"}
                          </p>
                        </div>

                        <div className="grid grid-cols-2 gap-2 text-[11px]">
                          <div className="p-2.5 bg-slate-50 dark:bg-slate-900/40 rounded-xl">
                            <span className="text-[10px] font-bold text-slate-400 uppercase block">Autorizado por</span>
                            <span className="font-black text-slate-700 dark:text-slate-200 flex items-center gap-1 mt-0.5">
                              <UserCheck size={12} className="text-emerald-500" />
                              {j?.authorizedBy || "Pendente"}
                            </span>
                          </div>
                          <div className="p-2.5 bg-slate-50 dark:bg-slate-900/40 rounded-xl">
                            <span className="text-[10px] font-bold text-slate-400 uppercase block">Previsão</span>
                            <span className="font-black text-slate-700 dark:text-slate-200 flex items-center gap-1 mt-0.5 truncate">
                              <Clock size={12} className="text-amber-500 shrink-0" />
                              {j?.actionForecast || "Não informada"}
                            </span>
                          </div>
                        </div>

                        {j?.observations && (
                          <div className="p-2.5 bg-amber-50/50 dark:bg-amber-950/20 border border-amber-200/50 dark:border-amber-900/30 rounded-xl text-[11px] text-amber-900 dark:text-amber-200">
                            <span className="font-bold block text-[10px] uppercase text-amber-600 dark:text-amber-400 mb-0.5">Observações:</span>
                            <p className="line-clamp-2">{j.observations}</p>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="p-4 rounded-2xl bg-white/80 dark:bg-slate-900/40 border border-dashed border-red-300 dark:border-red-800/80 text-center space-y-2">
                        <AlertTriangle size={20} className="mx-auto text-red-500" />
                        <p className="text-xs font-bold text-red-700 dark:text-red-400">
                          Pendente de Justificativa
                        </p>
                        <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-tight">
                          Esta licença está vencida ou crítica e ainda não possui autorização ou motivo cadastrado.
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Card Actions */}
                  <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-700/60 flex items-center justify-between gap-2">
                    <span className="text-[10px] font-mono text-slate-400">
                      {hasJust ? `Atualizado: ${j?.updatedAt || "-"}` : "Sem registro"}
                    </span>
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => handleOpenHistory(item.plate)}
                        className="p-2 rounded-xl text-slate-400 hover:text-cyan-600 hover:bg-cyan-50 dark:hover:bg-cyan-950/50 transition-all cursor-pointer"
                        title={`Ver histórico de ações anteriores da placa ${item.plate}`}
                      >
                        <History size={14} />
                      </button>
                      {hasJust && (
                        <button
                          onClick={() => handleDelete(j!.id, item.plate)}
                          className="p-2 rounded-xl text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/50 transition-all cursor-pointer"
                          title="Remover justificativa"
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                      <button
                        onClick={() => handleOpenModal(item)}
                        className={cn(
                          "px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer",
                          hasJust
                            ? "bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 hover:bg-blue-50 dark:hover:bg-blue-900/40 hover:text-blue-600"
                            : "bg-blue-600 hover:bg-blue-700 text-white shadow-sm shadow-blue-500/20"
                        )}
                      >
                        <Edit3 size={13} />
                        <span>{hasJust ? "Editar" : "Justificar"}</span>
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Cards View Pagination Controls */}
          {filteredItems.length > 0 && (
            <div className="px-5 py-3.5 bg-white dark:bg-slate-800/80 rounded-2xl border border-slate-200 dark:border-slate-700 flex flex-wrap items-center justify-between gap-3 text-xs shadow-xs">
              <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400 font-medium">
                <span>Exibindo</span>
                <span className="font-bold text-slate-800 dark:text-slate-200 font-mono">
                  {Math.min((validCurrentPage - 1) * pageSize + 1, filteredItems.length)} - {Math.min(validCurrentPage * pageSize, filteredItems.length)}
                </span>
                <span>de</span>
                <span className="font-bold text-slate-800 dark:text-slate-200 font-mono">{filteredItems.length}</span>
                <span>registros</span>
              </div>

              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400">
                  <span className="text-[11px]">Por página:</span>
                  <select
                    value={pageSize}
                    onChange={(e) => {
                      setPageSize(Number(e.target.value));
                      setCurrentPage(1);
                    }}
                    className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1 text-xs font-bold text-slate-700 dark:text-slate-300 outline-none cursor-pointer"
                  >
                    <option value={25}>25</option>
                    <option value={50}>50</option>
                    <option value={100}>100</option>
                    <option value={200}>200</option>
                    <option value={99999}>Todos</option>
                  </select>
                </div>

                {totalPages > 1 && (
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                      disabled={validCurrentPage <= 1}
                      className={cn(
                        "p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 transition-colors flex items-center gap-1 text-xs font-bold",
                        validCurrentPage <= 1
                          ? "opacity-40 cursor-not-allowed bg-slate-100 dark:bg-slate-800 text-slate-400"
                          : "bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 cursor-pointer shadow-xs"
                      )}
                      title="Página Anterior"
                    >
                      <ChevronLeft size={14} />
                      <span className="hidden sm:inline">Anterior</span>
                    </button>

                    <div className="px-3 py-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg font-mono font-bold text-slate-800 dark:text-slate-200 text-xs">
                      {validCurrentPage} / {totalPages}
                    </div>

                    <button
                      onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                      disabled={validCurrentPage >= totalPages}
                      className={cn(
                        "p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 transition-colors flex items-center gap-1 text-xs font-bold",
                        validCurrentPage >= totalPages
                          ? "opacity-40 cursor-not-allowed bg-slate-100 dark:bg-slate-800 text-slate-400"
                          : "bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 cursor-pointer shadow-xs"
                      )}
                      title="Próxima Página"
                    >
                      <span className="hidden sm:inline">Próxima</span>
                      <ChevronRight size={14} />
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )
    )}

      {/* Modal: Adicionar / Editar Justificativa */}
      {isModalOpen && editingItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-2 sm:p-4 md:p-6 overflow-hidden animate-fadeIn">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl w-full max-w-5xl max-h-[92vh] flex flex-col overflow-hidden">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-900/80 shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-100 dark:bg-blue-950/80 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
                  <FileSignature size={20} />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white">
                    {editingItem.id && justifications.some(j => j.id === editingItem.id) 
                      ? "Editar Justificativa / Ocorrência" 
                      : "Registrar Justificativa / Ocorrência"}
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Detalhe o motivo do vencimento, previsão de pagamento e aprovação
                  </p>
                </div>
              </div>
              <button 
                type="button"
                onClick={handleCloseModal}
                className="p-2 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <X size={20} />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleSave} className="flex-1 flex flex-col overflow-hidden">
              <div className="flex-1 overflow-y-auto p-6 space-y-5">
                {/* 1. Identificação do Veículo e Licença */}
                <div className="p-4 rounded-2xl bg-slate-50/70 dark:bg-slate-900/40 border border-slate-200/80 dark:border-slate-800">
                  <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400 block mb-3">
                    Identificação do Veículo & Licença
                  </span>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                        Placa do Veículo *
                      </label>
                      <input
                        type="text"
                        required
                        value={editingItem.plate || ""}
                        onChange={(e) => setEditingItem({ ...editingItem, plate: e.target.value.toUpperCase() })}
                        placeholder="Ex: CSK3A71"
                        className="w-full px-3 py-2 rounded-xl text-xs font-mono font-bold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                        Número da Frota
                      </label>
                      <input
                        type="text"
                        value={editingItem.fleet || ""}
                        onChange={(e) => setEditingItem({ ...editingItem, fleet: e.target.value })}
                        placeholder="Ex: 5378"
                        className="w-full px-3 py-2 rounded-xl text-xs font-bold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                        Operação
                      </label>
                      <input
                        type="text"
                        value={editingItem.operation || ""}
                        onChange={(e) => setEditingItem({ ...editingItem, operation: e.target.value })}
                        placeholder="Ex: CITROSUCO-SP"
                        className="w-full px-3 py-2 rounded-xl text-xs font-bold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                        Licença / Documento
                      </label>
                      <input
                        type="text"
                        list="modal-available-licenses"
                        value={editingItem.documentType || ""}
                        onChange={(e) => setEditingItem({ ...editingItem, documentType: e.target.value })}
                        placeholder="Ex: TACÓGRAFO, TX INSP TACÓGRAFO, DER..."
                        className="w-full px-3 py-2 rounded-xl text-xs font-bold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      <datalist id="modal-available-licenses">
                        {availableLicenses.map((lic) => (
                          <option key={lic} value={lic} />
                        ))}
                      </datalist>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                        Status do Alerta
                      </label>
                      <select
                        value={editingItem.status || "VENCIDO"}
                        onChange={(e) => setEditingItem({ ...editingItem, status: e.target.value })}
                        className="w-full px-3 py-2 rounded-xl text-xs font-bold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="VENCIDO">VENCIDO</option>
                        <option value="CRITICO">CRÍTICO</option>
                        <option value="ATENCAO">EM ATENÇÃO</option>
                        <option value="REGULAR">REGULARIZADO / OK</option>
                      </select>
                    </div>
                  </div>
                </div>

                {/* 2. Por que está vencido? (Motivo) com Filtros e Cadastro */}
                <div className="space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                        Por que está vencido? / Motivo da Pendência *
                      </label>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">
                        Clique em uma das opções abaixo ou digite seu motivo personalizado
                      </p>
                    </div>

                    {/* Filtros de Visualização e Botão de Cadastrar */}
                    <div className="flex flex-wrap items-center gap-1.5">
                      <div className="inline-flex p-0.5 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                        <button
                          type="button"
                          onClick={() => setReasonTabFilter("ALL")}
                          className={cn(
                            "px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer",
                            reasonTabFilter === "ALL"
                              ? "bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs"
                              : "text-slate-500 hover:text-slate-700 dark:text-slate-400"
                          )}
                        >
                          Exibir Tudo
                        </button>
                        <button
                          type="button"
                          onClick={() => setReasonTabFilter("AUTH")}
                          className={cn(
                            "px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer",
                            reasonTabFilter === "AUTH"
                              ? "bg-blue-600 text-white shadow-xs"
                              : "text-slate-500 hover:text-slate-700 dark:text-slate-400"
                          )}
                        >
                          Autorizações & Gestão
                        </button>
                        <button
                          type="button"
                          onClick={() => setReasonTabFilter("OPS")}
                          className={cn(
                            "px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer",
                            reasonTabFilter === "OPS"
                              ? "bg-amber-600 text-white shadow-xs"
                              : "text-slate-500 hover:text-slate-700 dark:text-slate-400"
                          )}
                        >
                          Prazos & Operação
                        </button>
                      </div>

                      <button
                        type="button"
                        onClick={() => setIsAddingReason(!isAddingReason)}
                        className={cn(
                          "px-2.5 py-1 rounded-xl text-[11px] font-bold transition-all flex items-center gap-1 border cursor-pointer",
                          isAddingReason
                            ? "bg-blue-50 dark:bg-blue-950 border-blue-300 text-blue-700 dark:text-blue-300"
                            : "bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:border-blue-300"
                        )}
                      >
                        <Plus size={13} className={cn("transition-transform", isAddingReason ? "rotate-45" : "")} />
                        <span>{isAddingReason ? "Fechar" : "Cadastrar Novo Motivo"}</span>
                      </button>
                    </div>
                  </div>

                  {/* Form Inline para Cadastrar Novo Motivo */}
                  {isAddingReason && (
                    <div className="p-3.5 rounded-2xl bg-blue-50/60 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900/50 space-y-3 animate-fadeIn">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-blue-900 dark:text-blue-200 flex items-center gap-1.5">
                          <Plus size={14} className="text-blue-600 dark:text-blue-400" />
                          Cadastrar Nova Opção Rápida de Motivo
                        </span>
                        <span className="text-[10px] text-blue-700 dark:text-blue-300">
                          Salvo na memória local do navegador para reutilização
                        </span>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5">
                        <div className="sm:col-span-4">
                          <label className="block text-[10px] font-bold text-slate-600 dark:text-slate-400 mb-1">
                            Categoria do Motivo
                          </label>
                          <select
                            value={newReasonCategory}
                            onChange={(e) => setNewReasonCategory(e.target.value as "AUTH" | "OPS")}
                            className="w-full px-3 py-2 rounded-xl text-xs font-bold bg-white dark:bg-slate-800 border border-blue-200 dark:border-blue-800 text-slate-900 dark:text-white outline-none"
                          >
                            <option value="AUTH">Autorizações & Gestão</option>
                            <option value="OPS">Prazos, Órgãos & Operação</option>
                          </select>
                        </div>
                        <div className="sm:col-span-6">
                          <label className="block text-[10px] font-bold text-slate-600 dark:text-slate-400 mb-1">
                            Descrição do Motivo
                          </label>
                          <input
                            type="text"
                            value={newReasonText}
                            onChange={(e) => setNewReasonText(e.target.value)}
                            placeholder="Ex: Aguardando Agendamento DER, Parado para Reforma..."
                            className="w-full px-3 py-2 rounded-xl text-xs bg-white dark:bg-slate-800 border border-blue-200 dark:border-blue-800 text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500"
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.preventDefault();
                                handleAddCustomReason();
                              }
                            }}
                          />
                        </div>
                        <div className="sm:col-span-2 flex items-end">
                          <button
                            type="button"
                            onClick={handleAddCustomReason}
                            disabled={!newReasonText.trim()}
                            className="w-full px-3 py-2 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50 transition-all cursor-pointer flex items-center justify-center gap-1"
                          >
                            <CheckCircle2 size={13} />
                            <span>Adicionar</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Chips agrupados com exclusão e restauração de opções */}
                  <div className="p-3.5 rounded-2xl bg-slate-50/80 dark:bg-slate-900/50 border border-slate-200/80 dark:border-slate-800 space-y-3">
                    {/* Bloco de Autorizações */}
                    {(reasonTabFilter === "ALL" || reasonTabFilter === "AUTH") && (
                      <div>
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-[10px] font-extrabold uppercase tracking-wider text-blue-600 dark:text-blue-400 flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span>
                            Autorizações & Gestão:
                          </span>
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] text-slate-400">
                              {reasonsAuth.length} opções
                            </span>
                            <button
                              type="button"
                              onClick={() => handleResetReasons("AUTH")}
                              className="text-[10px] text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 flex items-center gap-1 transition-colors cursor-pointer"
                              title="Restaurar lista de motivos originais desta categoria"
                            >
                              <RotateCcw size={10} />
                              <span>Restaurar</span>
                            </button>
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {reasonsAuth.map(r => {
                            const isSelected = editingItem.reason === r;
                            return (
                              <div
                                key={r}
                                onClick={() => {
                                  const updates: any = { ...editingItem, reason: r };
                                  if (r.includes("Letícia") && (!editingItem.authorizedBy || editingItem.authorizedBy === "Esther")) {
                                    updates.authorizedBy = "Letícia";
                                  } else if (r.includes("Esther") && (!editingItem.authorizedBy || editingItem.authorizedBy === "Letícia")) {
                                    updates.authorizedBy = "Esther";
                                  } else if (r.includes("gerência") && !editingItem.authorizedBy) {
                                    updates.authorizedBy = "Gerência de Operações";
                                  } else if (r.includes("diretoria") && !editingItem.authorizedBy) {
                                    updates.authorizedBy = "Diretoria Executiva";
                                  } else if (r.includes("Garagem")) {
                                    if (!editingItem.authorizedBy) updates.authorizedBy = "Gerência de Operações";
                                    if (!editingItem.actionForecast) updates.actionForecast = "Veículo mantido em garagem / sem operação";
                                  }
                                  setEditingItem(updates);
                                }}
                                className={cn(
                                  "group/chip px-2.5 py-1.5 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer select-none",
                                  isSelected
                                    ? "bg-blue-600 text-white shadow-sm ring-2 ring-blue-400/40"
                                    : "bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-blue-50 dark:hover:bg-slate-700/80 border border-slate-200 dark:border-slate-700"
                                )}
                              >
                                <span>{r}</span>
                                <button
                                  type="button"
                                  onClick={(e) => handleDeleteReason(r, "AUTH", e)}
                                  className="p-0.5 rounded-full hover:bg-red-500 hover:text-white text-slate-400 dark:text-slate-400 transition-all opacity-50 group-hover/chip:opacity-100"
                                  title={`Excluir motivo "${r}"`}
                                >
                                  <X size={11} />
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Bloco de Prazos, Órgãos & Operação */}
                    {(reasonTabFilter === "ALL" || reasonTabFilter === "OPS") && (
                      <div className={reasonTabFilter === "ALL" ? "pt-2 border-t border-slate-200/60 dark:border-slate-800/80" : ""}>
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-[10px] font-extrabold uppercase tracking-wider text-amber-600 dark:text-amber-400 flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                            Prazos, Órgãos & Operação:
                          </span>
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] text-slate-400">
                              {reasonsOps.length} opções
                            </span>
                            <button
                              type="button"
                              onClick={() => handleResetReasons("OPS")}
                              className="text-[10px] text-slate-400 hover:text-amber-600 dark:hover:text-amber-400 flex items-center gap-1 transition-colors cursor-pointer"
                              title="Restaurar lista de motivos originais desta categoria"
                            >
                              <RotateCcw size={10} />
                              <span>Restaurar</span>
                            </button>
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {reasonsOps.map(r => {
                            const isSelected = editingItem.reason === r;
                            return (
                              <div
                                key={r}
                                onClick={() => {
                                  const updates: any = { ...editingItem, reason: r };
                                  if (r.includes("próximo ano") && !editingItem.actionForecast) {
                                    updates.actionForecast = "Apenas no próximo ano (exercício seguinte)";
                                  } else if (r.includes("Sem Previsão") && !editingItem.actionForecast) {
                                    updates.actionForecast = "Sem previsão de renovação imediata";
                                  }
                                  setEditingItem(updates);
                                }}
                                className={cn(
                                  "group/chip px-2.5 py-1.5 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer select-none",
                                  isSelected
                                    ? "bg-amber-600 text-white shadow-sm ring-2 ring-amber-400/40"
                                    : "bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-amber-50 dark:hover:bg-slate-700/80 border border-slate-200 dark:border-slate-700"
                                )}
                              >
                                <span>{r}</span>
                                <button
                                  type="button"
                                  onClick={(e) => handleDeleteReason(r, "OPS", e)}
                                  className="p-0.5 rounded-full hover:bg-red-500 hover:text-white text-slate-400 dark:text-slate-400 transition-all opacity-50 group-hover/chip:opacity-100"
                                  title={`Excluir motivo "${r}"`}
                                >
                                  <X size={11} />
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Input do motivo selecionado / texto livre */}
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 mb-1">
                      Texto do Motivo (editável):
                    </label>
                    <input
                      type="text"
                      required
                      value={editingItem.reason || ""}
                      onChange={(e) => setEditingItem({ ...editingItem, reason: e.target.value })}
                      placeholder="Ex: Aguardando Autorização da Letícia, Sem Previsão de Renovação..."
                      className="w-full px-3.5 py-2.5 rounded-xl text-xs font-semibold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>

                {/* 3. Quem Autorizou? e Previsão */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="p-3.5 rounded-2xl bg-slate-50/70 dark:bg-slate-900/40 border border-slate-200/80 dark:border-slate-800 space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                        Quem Autorizou? (Diretoria / Gestão)
                      </label>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => setIsAddingAuthorizer(!isAddingAuthorizer)}
                          className="text-[10px] text-blue-600 hover:text-blue-700 dark:text-blue-400 font-bold flex items-center gap-0.5 cursor-pointer"
                          title="Adicionar novo autorizador à lista rápida"
                        >
                          <Plus size={11} />
                          <span>Nova Opção</span>
                        </button>
                        <button
                          type="button"
                          onClick={handleResetAuthorizers}
                          className="text-[10px] text-slate-400 hover:text-blue-600 flex items-center gap-0.5 cursor-pointer"
                          title="Restaurar autorizadores padrões"
                        >
                          <RotateCcw size={10} />
                        </button>
                      </div>
                    </div>

                    {isAddingAuthorizer && (
                      <div className="flex gap-1.5 p-1.5 rounded-xl bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900">
                        <input
                          type="text"
                          value={newAuthorizerText}
                          onChange={(e) => setNewAuthorizerText(e.target.value)}
                          placeholder="Novo autorizador..."
                          className="flex-1 px-2.5 py-1 text-xs rounded-lg border border-blue-200 dark:border-blue-800 bg-white dark:bg-slate-800 text-slate-900 dark:text-white outline-none"
                          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleAddAuthorizer(); } }}
                        />
                        <button
                          type="button"
                          onClick={handleAddAuthorizer}
                          disabled={!newAuthorizerText.trim()}
                          className="px-2 py-1 text-xs font-bold bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 cursor-pointer"
                        >
                          Salvar
                        </button>
                      </div>
                    )}

                    <div className="flex flex-wrap gap-1">
                      {authorizersList.map(a => {
                        const isSelected = editingItem.authorizedBy === a;
                        return (
                          <div
                            key={a}
                            onClick={() => setEditingItem({ ...editingItem, authorizedBy: a })}
                            className={cn(
                              "group/auth px-2 py-0.5 rounded-lg text-[10px] font-bold transition-all cursor-pointer flex items-center gap-1 select-none",
                              isSelected
                                ? "bg-blue-600 text-white shadow-xs"
                                : "bg-white dark:bg-slate-800 text-blue-700 dark:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-900/50 border border-blue-200 dark:border-blue-900"
                            )}
                          >
                            <span>{a}</span>
                            <button
                              type="button"
                              onClick={(e) => handleDeleteAuthorizer(a, e)}
                              className="p-0.5 rounded-full hover:bg-red-500 hover:text-white text-slate-400 transition-all opacity-40 group-hover/auth:opacity-100 cursor-pointer"
                              title={`Excluir autorizador "${a}"`}
                            >
                              <X size={10} />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                    <input
                      type="text"
                      value={editingItem.authorizedBy || ""}
                      onChange={(e) => setEditingItem({ ...editingItem, authorizedBy: e.target.value })}
                      placeholder="Ex: Letícia, Esther, Diretoria..."
                      className="w-full px-3 py-2 rounded-xl text-xs font-medium bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <div className="p-3.5 rounded-2xl bg-slate-50/70 dark:bg-slate-900/40 border border-slate-200/80 dark:border-slate-800 space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                        Previsão de Pagamento / Regularização
                      </label>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => setIsAddingForecast(!isAddingForecast)}
                          className="text-[10px] text-amber-600 hover:text-amber-700 dark:text-amber-400 font-bold flex items-center gap-0.5 cursor-pointer"
                          title="Adicionar nova previsão à lista rápida"
                        >
                          <Plus size={11} />
                          <span>Nova Opção</span>
                        </button>
                        <button
                          type="button"
                          onClick={handleResetForecasts}
                          className="text-[10px] text-slate-400 hover:text-amber-600 flex items-center gap-0.5 cursor-pointer"
                          title="Restaurar opções padrões de previsão"
                        >
                          <RotateCcw size={10} />
                        </button>
                      </div>
                    </div>

                    {isAddingForecast && (
                      <div className="flex gap-1.5 p-1.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900">
                        <input
                          type="text"
                          value={newForecastText}
                          onChange={(e) => setNewForecastText(e.target.value)}
                          placeholder="Nova previsão..."
                          className="flex-1 px-2.5 py-1 text-xs rounded-lg border border-amber-200 dark:border-amber-800 bg-white dark:bg-slate-800 text-slate-900 dark:text-white outline-none"
                          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleAddForecast(); } }}
                        />
                        <button
                          type="button"
                          onClick={handleAddForecast}
                          disabled={!newForecastText.trim()}
                          className="px-2 py-1 text-xs font-bold bg-amber-600 text-white rounded-lg hover:bg-amber-700 disabled:opacity-50 cursor-pointer"
                        >
                          Salvar
                        </button>
                      </div>
                    )}

                    <div className="flex flex-wrap gap-1">
                      {forecastsList.map(f => {
                        const isSelected = editingItem.actionForecast === f;
                        return (
                          <div
                            key={f}
                            onClick={() => setEditingItem({ ...editingItem, actionForecast: f })}
                            className={cn(
                              "group/fc px-2 py-0.5 rounded-lg text-[10px] font-bold transition-all cursor-pointer flex items-center gap-1 select-none",
                              isSelected
                                ? "bg-amber-600 text-white shadow-xs"
                                : "bg-white dark:bg-slate-800 text-amber-700 dark:text-amber-300 hover:bg-amber-50 dark:hover:bg-amber-900/50 border border-amber-200 dark:border-amber-900"
                            )}
                          >
                            <span>{f}</span>
                            <button
                              type="button"
                              onClick={(e) => handleDeleteForecast(f, e)}
                              className="p-0.5 rounded-full hover:bg-red-500 hover:text-white text-slate-400 transition-all opacity-40 group-hover/fc:opacity-100 cursor-pointer"
                              title={`Excluir previsão "${f}"`}
                            >
                              <X size={10} />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                    <input
                      type="text"
                      value={editingItem.actionForecast || ""}
                      onChange={(e) => setEditingItem({ ...editingItem, actionForecast: e.target.value })}
                      placeholder="Ex: Apenas no próximo ano, Em 15 dias..."
                      className="w-full px-3 py-2 rounded-xl text-xs font-medium bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>

                {/* 4. Observações Detalhadas */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Observações e Histórico Completo
                  </label>
                  <textarea
                    rows={2}
                    value={editingItem.observations || ""}
                    onChange={(e) => setEditingItem({ ...editingItem, observations: e.target.value })}
                    placeholder="Informações adicionais, despachos, histórico operacional ou laudos pendentes..."
                    className="w-full px-3.5 py-2.5 rounded-xl text-xs font-medium bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              {/* Fixed Footer */}
              <div className="flex items-center justify-between px-6 py-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-900/80 shrink-0">
                <div className="text-[11px] text-slate-400">
                  * As justificativas salvas ficam registradas no banco e nos relatórios.
                </div>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={handleCloseModal}
                    className="px-4 py-2.5 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={isSaving}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white shadow-md shadow-blue-500/25 transition-all disabled:opacity-50 cursor-pointer"
                  >
                    {isSaving ? <RefreshCw size={15} className="animate-spin" /> : <CheckCircle2 size={15} />}
                    <span>{isSaving ? "Salvando..." : "Salvar Justificativa"}</span>
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Interactive Spreadsheet Table Modal */}
      {isSpreadsheetModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-6xl w-full max-h-[90vh] flex flex-col shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
            {/* Modal Header */}
            <div className="p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-4 bg-slate-50/70 dark:bg-slate-800/50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 flex items-center justify-center text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">
                  <Table size={20} />
                </div>
                <div>
                  <h3 className="text-base font-display font-black text-slate-900 dark:text-white">
                    Planilha do Banco de Dados - Justificativas da Frota
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Visualização tabular completa com salvamento automático ativo • {filteredItems.length} registros
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={copyTableToClipboard}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-750 transition-all cursor-pointer shadow-xs"
                  title="Copiar dados para colar no Excel ou Google Sheets"
                >
                  {copiedTable ? <CheckCircle2 size={14} className="text-emerald-500" /> : <Copy size={14} />}
                  <span>{copiedTable ? "Copiado!" : "Copiar Dados"}</span>
                </button>
                <button
                  type="button"
                  onClick={exportJustificationsExcel}
                  className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm transition-all cursor-pointer"
                >
                  <FileSpreadsheet size={14} />
                  <span>Baixar Excel (.xlsx)</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsSpreadsheetModalOpen(false);
                    setRestoreTab('server');
                    setIsRestoreModalOpen(true);
                    fetchServerBackups();
                  }}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white shadow-sm transition-all cursor-pointer"
                  title="Restaurar a partir dos pontos de backup gravados no servidor"
                >
                  <Database size={14} />
                  <span>Pontos de Restauração</span>
                  {serverBackups.length > 0 && (
                    <span className="px-1.5 py-0.2 rounded-full text-[10px] font-mono font-bold bg-white/20 text-white">
                      {serverBackups.length}
                    </span>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsSpreadsheetModalOpen(false);
                    setRestoreTab('file');
                    setIsRestoreModalOpen(true);
                    fetchServerBackups();
                  }}
                  className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm transition-all cursor-pointer"
                  title="Restaurar justificativas a partir de uma planilha Excel"
                >
                  <RotateCcw size={14} />
                  <span>Restaurar do Excel</span>
                </button>
                <button
                  type="button"
                  onClick={() => setIsSpreadsheetModalOpen(false)}
                  className="p-2 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                >
                  <X size={20} />
                </button>
              </div>
            </div>

            {/* Modal Table Content */}
            <div className="flex-1 overflow-auto p-4">
              <div className="border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-xs">
                <table className="w-full text-left text-xs text-slate-600 dark:text-slate-300 border-collapse">
                  <thead className="bg-slate-100/90 dark:bg-slate-800/90 text-[11px] font-black text-slate-700 dark:text-slate-200 uppercase tracking-wider sticky top-0 border-b border-slate-200 dark:border-slate-700 z-10">
                    <tr>
                      <th className="px-3 py-2.5 w-12 text-center">#</th>
                      <th className="px-3 py-2.5">Placa</th>
                      <th className="px-3 py-2.5">Frota</th>
                      <th className="px-3 py-2.5">Operação</th>
                      <th className="px-3 py-2.5">Licença</th>
                      <th className="px-3 py-2.5">Status</th>
                      <th className="px-4 py-2.5">Motivo da Pendência</th>
                      <th className="px-3 py-2.5">Autorizado Por</th>
                      <th className="px-3 py-2.5">Previsão</th>
                      <th className="px-4 py-2.5">Observações</th>
                      <th className="px-3 py-2.5">Atualizado</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-sans">
                    {filteredItems.map((item, idx) => {
                      return (
                        <tr key={`${item.plate}_${idx}`} className="hover:bg-blue-50/30 dark:hover:bg-slate-800/50 transition-colors">
                          <td className="px-3 py-2 text-center text-slate-400 text-[10px] font-mono">{idx + 1}</td>
                          <td className="px-3 py-2 font-mono font-black text-slate-900 dark:text-white">{item.plate}</td>
                          <td className="px-3 py-2 font-semibold text-slate-700 dark:text-slate-300">{item.fleet || "-"}</td>
                          <td className="px-3 py-2">{formatOperationName(item.operation)}</td>
                          <td className="px-3 py-2 font-medium">{item.documentType || "Geral"}</td>
                          <td className="px-3 py-2">
                            <span className={cn(
                              "px-2 py-0.5 rounded-md text-[10px] font-black tracking-wider",
                              item.status === 'VENCIDO' ? 'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300' :
                              item.status === 'VENCE HOJE' ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300' :
                              'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                            )}>
                              {item.status}
                            </span>
                          </td>
                          <td className="px-4 py-2 max-w-xs truncate font-medium text-slate-900 dark:text-slate-100" title={item.justification?.reason || ""}>
                            {item.justification?.reason || <span className="text-slate-400 italic">Pendente</span>}
                          </td>
                          <td className="px-3 py-2 text-slate-700 dark:text-slate-300 font-medium">{item.justification?.authorizedBy || "-"}</td>
                          <td className="px-3 py-2 text-slate-700 dark:text-slate-300">{item.justification?.actionForecast || "-"}</td>
                          <td className="px-4 py-2 max-w-sm truncate text-slate-500 dark:text-slate-400" title={item.justification?.observations || ""}>
                            {item.justification?.observations || "-"}
                          </td>
                          <td className="px-3 py-2 text-[10px] text-slate-400 font-mono whitespace-nowrap">{item.justification?.updatedAt || "-"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 flex items-center justify-between text-xs text-slate-500">
              <span>* Todos os dados são salvos continuamente no banco de dados.</span>
              <button
                type="button"
                onClick={() => setIsSpreadsheetModalOpen(false)}
                className="px-4 py-2 rounded-xl font-bold bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-800 dark:text-white transition-colors cursor-pointer"
              >
                Fechar Visualização
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Restauração de Justificativas (Excel & Backups) */}
      {isRestoreModalOpen && (
        <div 
          onClick={(e) => {
            if (e.target === e.currentTarget && !isRestoring) {
              setIsRestoreModalOpen(false);
              setRestoreFeedback(null);
            }
          }}
          className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/80 backdrop-blur-md animate-fadeIn"
        >
          {/* Botão de fechamento rápido no canto superior da sobreposição */}
          <button
            type="button"
            disabled={isRestoring}
            onClick={() => {
              setIsRestoreModalOpen(false);
              setRestoreFeedback(null);
            }}
            className="absolute top-4 right-4 z-50 p-2.5 rounded-2xl bg-slate-800/90 hover:bg-slate-700 text-white shadow-xl border border-slate-600/80 transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            title="Fechar painel (Esc)"
          >
            <X size={18} />
          </button>

          <ErrorBoundary
            fallbackTitle="Painel de Restauração de Justificativas de Licenças"
            fallbackMessage="Ocorreu uma instabilidade ao exibir o painel de restauração. Seus dados continuam preservados no banco de dados."
            onClose={() => {
              setIsRestoreModalOpen(false);
              setRestoreFeedback(null);
            }}
            onReset={() => {
              setIsRestoreModalOpen(false);
              setRestoreFeedback(null);
            }}
          >
            <div className="relative bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden animate-scaleUp">
            {/* Safe Loading Overlay during restoration */}
            {isRestoring && (
              <div className="absolute inset-0 z-50 bg-slate-900/85 backdrop-blur-md flex flex-col items-center justify-center p-6 text-center animate-fadeIn rounded-3xl">
                <div className="p-4 bg-indigo-500/20 rounded-2xl border border-indigo-400/30 text-indigo-400 mb-4 shadow-xl">
                  <RefreshCw size={36} className="animate-spin text-indigo-400" />
                </div>
                <h4 className="text-lg font-bold text-white font-display">
                  Restaurando Ponto de Backup...
                </h4>
                <p className="text-xs text-slate-300 max-w-sm mt-1.5 leading-relaxed">
                  Validando integridade dos dados, conferindo placas e persistindo no banco de dados com segurança.
                </p>
                {restoringFilename && (
                  <span className="mt-3 px-3 py-1 rounded-full text-[11px] font-mono bg-indigo-950 border border-indigo-800 text-indigo-300">
                    Arquivo: {restoringFilename}
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setIsRestoring(false);
                    setRestoringFilename(null);
                    setRestoreFeedback({
                      type: 'info',
                      message: 'Operação de restauração cancelada pelo usuário. Os dados atuais permaneceram inalterados.'
                    });
                  }}
                  className="mt-4 px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-xl text-xs font-bold border border-slate-700 transition-all cursor-pointer"
                >
                  Cancelar Operação
                </button>
              </div>
            )}

            {/* Modal Header */}
            <div className="p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/70 dark:bg-slate-800/50 shrink-0">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-gradient-to-br from-indigo-500 to-blue-600 text-white rounded-2xl shadow-md shadow-indigo-500/20">
                  <RotateCcw size={22} />
                </div>
                <div>
                  <h3 className="font-display font-black text-slate-900 dark:text-white text-lg flex items-center gap-2">
                    <span>Restaurar Justificativas de Licenças</span>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-black bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 border border-indigo-300 dark:border-indigo-800">
                      EXCEL / BACKUP
                    </span>
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Recupere dados preenchidos em outras estações a partir de planilhas Excel (.xlsx, .xls) ou backups salvos no servidor
                  </p>
                </div>
              </div>

              <button
                type="button"
                disabled={isRestoring}
                onClick={() => {
                  setIsRestoreModalOpen(false);
                  setParsedRestorationData(null);
                  setSelectedBackupFile(null);
                  setRestoreFeedback(null);
                }}
                className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-all cursor-pointer disabled:opacity-40"
              >
                <X size={20} />
              </button>
            </div>

            {/* Modal Tabs */}
            <div className="px-6 pt-3 border-b border-slate-200 dark:border-slate-800 bg-slate-50/40 dark:bg-slate-900/40 flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => {
                  setRestoreTab('server');
                  setIsLoadingServerBackups(true);
                  setServerBackupsError(null);
                  fetchServerBackups();
                }}
                className={cn(
                  "px-4 py-2.5 text-xs font-bold rounded-t-xl transition-all flex items-center gap-2 border-b-2 cursor-pointer",
                  restoreTab === 'server'
                    ? "border-blue-600 text-blue-600 dark:text-blue-400 bg-white dark:bg-slate-800 shadow-xs"
                    : "border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400"
                )}
              >
                <HardDrive size={15} />
                <span>Pontos de Restauração (Servidor)</span>
                {Array.isArray(serverBackups) && serverBackups.length > 0 && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-black bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300">
                    {serverBackups.length} disponíveis
                  </span>
                )}
              </button>

              <button
                type="button"
                onClick={() => setRestoreTab('file')}
                className={cn(
                  "px-4 py-2.5 text-xs font-bold rounded-t-xl transition-all flex items-center gap-2 border-b-2 cursor-pointer",
                  restoreTab === 'file'
                    ? "border-indigo-500 text-indigo-600 dark:text-indigo-400 bg-white dark:bg-slate-800 shadow-xs"
                    : "border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400"
                )}
              >
                <FileSpreadsheet size={15} />
                <span>Importar Planilha Excel (.xlsx, .xls) / JSON</span>
              </button>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto p-6 space-y-5">
              {restoreFeedback && (
                <div className={cn(
                  "p-3.5 rounded-2xl text-xs font-bold flex items-center gap-2.5 animate-fadeIn",
                  restoreFeedback.type === 'error' ? "bg-red-50 dark:bg-red-950/50 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800" :
                  restoreFeedback.type === 'success' ? "bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800" :
                  "bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800"
                )}>
                  {restoreFeedback.type === 'error' ? <AlertTriangle size={16} className="shrink-0 text-red-500" /> :
                   restoreFeedback.type === 'success' ? <CheckCircle2 size={16} className="shrink-0 text-emerald-500" /> :
                   <CheckCircle2 size={16} className="shrink-0 text-blue-500" />}
                  <span>{restoreFeedback.message}</span>
                </div>
              )}

              {restoreTab === 'file' ? (
                <div className="space-y-5">
                  {/* Dropzone */}
                  <label 
                    className={cn(
                      "flex flex-col items-center justify-center p-8 border-2 border-dashed rounded-3xl transition-all cursor-pointer",
                      selectedBackupFile
                        ? "border-emerald-400 dark:border-emerald-600 bg-emerald-50/30 dark:bg-emerald-950/10"
                        : "border-slate-300 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/40 hover:bg-slate-100/60 dark:hover:bg-slate-800/70"
                    )}
                  >
                    <input 
                      type="file" 
                      accept=".xlsx,.xls,.json,.csv"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleFileSelected(file);
                      }}
                      className="hidden" 
                    />
                    <div className="p-3.5 bg-indigo-500/10 dark:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 rounded-2xl mb-3">
                      <Upload size={28} />
                    </div>
                    <p className="text-sm font-bold text-slate-800 dark:text-slate-200">
                      {selectedBackupFile ? selectedBackupFile.name : "Clique para selecionar ou arraste a planilha aqui"}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                      Suporta planilhas Excel (.xlsx, .xls) exportadas pelo sistema (Licenças ou Documentação) ou arquivos JSON
                    </p>
                    {selectedBackupFile && (
                      <span className="mt-3 px-3 py-1 rounded-full text-[11px] font-mono font-bold bg-emerald-100 dark:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300">
                        {(selectedBackupFile.size / 1024).toFixed(1)} KB • Pronto para restauração
                      </span>
                    )}
                  </label>

                  {/* Parsed summary & preview */}
                  {parsedRestorationData && parsedRestorationData.items.length > 0 && (
                    <div className="space-y-4 animate-fadeIn">
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div className="p-3 bg-slate-50 dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700">
                          <span className="text-[10px] uppercase font-bold text-slate-400 block">Linhas Lidas</span>
                          <span className="text-lg font-black text-slate-800 dark:text-slate-100 font-mono">
                            {parsedRestorationData.totalRows}
                          </span>
                        </div>
                        <div className="p-3 bg-emerald-50 dark:bg-emerald-950/40 rounded-2xl border border-emerald-200 dark:border-emerald-800">
                          <span className="text-[10px] uppercase font-bold text-emerald-600 dark:text-emerald-400 block">Justificativas Válidas</span>
                          <span className="text-lg font-black text-emerald-700 dark:text-emerald-300 font-mono">
                            {parsedRestorationData.items.length}
                          </span>
                        </div>
                        <div className="p-3 bg-blue-50 dark:bg-blue-950/40 rounded-2xl border border-blue-200 dark:border-blue-800">
                          <span className="text-[10px] uppercase font-bold text-blue-600 dark:text-blue-400 block">Veículos / Placas</span>
                          <span className="text-lg font-black text-blue-700 dark:text-blue-300 font-mono">
                            {new Set(parsedRestorationData.items.map(i => i.plate)).size}
                          </span>
                        </div>
                      </div>

                      {/* Restore Mode Option */}
                      <div className="p-4 bg-slate-50 dark:bg-slate-800/80 rounded-2xl border border-slate-200 dark:border-slate-700 space-y-2">
                        <span className="text-xs font-bold text-slate-700 dark:text-slate-300 block">
                          Modo de Restauração:
                        </span>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                          <label className={cn(
                            "flex items-start gap-2.5 p-3 rounded-xl border transition-all cursor-pointer",
                            restoreMode === 'merge' 
                              ? "bg-indigo-50/70 dark:bg-indigo-950/30 border-indigo-300 dark:border-indigo-700 text-indigo-900 dark:text-indigo-200" 
                              : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400"
                          )}>
                            <input 
                              type="radio" 
                              name="restoreModeLic" 
                              checked={restoreMode === 'merge'} 
                              onChange={() => setRestoreMode('merge')}
                              className="mt-0.5 accent-indigo-600 cursor-pointer"
                            />
                            <div>
                              <strong className="block font-bold">Mesclar e Atualizar (Recomendado)</strong>
                              <span className="text-[11px] opacity-80">Preserva dados atuais e atualiza/adiciona os registros contidos no arquivo.</span>
                            </div>
                          </label>

                          <label className={cn(
                            "flex items-start gap-2.5 p-3 rounded-xl border transition-all cursor-pointer",
                            restoreMode === 'overwrite' 
                              ? "bg-rose-50/70 dark:bg-rose-950/30 border-rose-300 dark:border-rose-700 text-rose-900 dark:text-rose-200" 
                              : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400"
                          )}>
                            <input 
                              type="radio" 
                              name="restoreModeLic" 
                              checked={restoreMode === 'overwrite'} 
                              onChange={() => setRestoreMode('overwrite')}
                              className="mt-0.5 accent-rose-600 cursor-pointer"
                            />
                            <div>
                              <strong className="block font-bold">Substituir Completamente</strong>
                              <span className="text-[11px] opacity-80">Substitui a base de licenças exatamente pelos dados contidos no arquivo.</span>
                            </div>
                          </label>
                        </div>
                      </div>

                      {/* Preview Table */}
                      <div className="space-y-2">
                        <span className="text-xs font-bold text-slate-700 dark:text-slate-300 block">
                          Pré-visualização dos Registros Encontrados:
                        </span>
                        <div className="max-h-52 overflow-auto border border-slate-200 dark:border-slate-700 rounded-2xl">
                          <table className="w-full text-left text-xs border-collapse">
                            <thead>
                              <tr className="bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-bold border-b border-slate-200 dark:border-slate-700">
                                <th className="py-2 px-3">Placa</th>
                                <th className="py-2 px-3">Frota</th>
                                <th className="py-2 px-3">Licença / Doc</th>
                                <th className="py-2 px-3">Status</th>
                                <th className="py-2 px-3">Motivo / Pendência</th>
                                <th className="py-2 px-3">Quem Autorizou</th>
                                <th className="py-2 px-3">Previsão</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                              {parsedRestorationData.items.map((it, idx) => (
                                <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                                  <td className="py-2 px-3 font-mono font-black text-slate-900 dark:text-white">{it.plate}</td>
                                  <td className="py-2 px-3 font-mono text-slate-500">{it.fleet}</td>
                                  <td className="py-2 px-3 font-bold text-indigo-600 dark:text-indigo-400">{it.documentType}</td>
                                  <td className="py-2 px-3">
                                    <span className="px-2 py-0.5 rounded-full text-[9px] font-mono font-bold uppercase bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                                      {it.status}
                                    </span>
                                  </td>
                                  <td className="py-2 px-3 font-medium text-slate-800 dark:text-slate-100 max-w-[200px] truncate" title={it.reason}>
                                    {it.reason || "-"}
                                  </td>
                                  <td className="py-2 px-3 text-slate-700 dark:text-slate-300">{it.authorizedBy || "-"}</td>
                                  <td className="py-2 px-3 text-slate-700 dark:text-slate-300">{it.actionForecast || "-"}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                /* Tab 2: Server Backups */
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-xs font-black uppercase tracking-wider text-slate-700 dark:text-slate-300">
                        Pontos de Restauração Armazenados no Servidor
                      </h4>
                      <p className="text-[11px] text-slate-500">
                        Histórico de snapshots e backups gravados no servidor
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={fetchServerBackups}
                      disabled={isLoadingServerBackups}
                      className="px-3 py-1.5 rounded-xl text-xs font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 transition-all flex items-center gap-1.5 cursor-pointer"
                    >
                      <RefreshCw size={13} className={cn(isLoadingServerBackups ? "animate-spin" : "")} />
                      <span>Atualizar Lista</span>
                    </button>
                  </div>

                  {/* Informational Guidance Box */}
                  <div className="p-4 rounded-2xl bg-blue-50/80 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 space-y-2.5">
                    <div className="flex items-center gap-2 text-blue-700 dark:text-blue-300 font-bold text-xs">
                      <AlertCircle size={16} className="shrink-0" />
                      <span>Como recuperar justificativas que foram digitadas anteriormente:</span>
                    </div>
                    <div className="text-xs text-slate-600 dark:text-slate-300 space-y-1.5 leading-relaxed">
                      <p>
                        <strong>1. Digitações feitas em outra máquina:</strong> A sincronização em nuvem (Firestore + Servidor) já está ativa! Assim que aquela pessoa acessar o sistema na máquina dela, os dados gravados localmente no navegador dela são sincronizados automaticamente e aparecerão aqui na hora.
                      </p>
                      <p>
                        <strong>2. Se você tem a planilha salva (ex: <em>Justificativas Licenças</em>):</strong> Vá na aba <em>"Importar Planilha Excel"</em> ao lado, selecione seu arquivo <code>.xlsx</code> ou <code>.xls</code> e clique em <em>Confirmar Restauração</em> para recuperar 100% das linhas imediatamente.
                      </p>
                      <p>
                        <strong>3. Pontos de backup gravados no servidor:</strong> Clique no botão <strong>"Restaurar Este Ponto"</strong> em qualquer um dos backups listados abaixo.
                      </p>
                    </div>
                  </div>

                  {isLoadingServerBackups ? (
                    <div className="py-14 px-6 text-center text-slate-400 flex flex-col items-center justify-center gap-3 bg-slate-50/60 dark:bg-slate-800/40 rounded-2xl border border-slate-200/80 dark:border-slate-700/80 animate-pulse">
                      <div className="p-3 bg-blue-500/10 dark:bg-blue-500/20 rounded-2xl text-blue-500">
                        <RefreshCw size={26} className="animate-spin text-blue-500" />
                      </div>
                      <div>
                        <p className="font-bold text-slate-800 dark:text-slate-200 text-sm">
                          Consultando pontos de restauração no servidor...
                        </p>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                          Verificando snapshots salvos e arquivos de banco de dados
                        </p>
                      </div>
                    </div>
                  ) : serverBackupsError ? (
                    <div className="p-6 text-center bg-amber-50/70 dark:bg-amber-950/30 rounded-2xl border border-amber-200 dark:border-amber-900/50 space-y-3">
                      <div className="flex items-center justify-center gap-2 text-amber-700 dark:text-amber-400 font-bold text-xs">
                        <AlertTriangle size={18} className="shrink-0 text-amber-500" />
                        <span>Aviso ao carregar backups do servidor</span>
                      </div>
                      <p className="text-xs text-slate-600 dark:text-slate-300 max-w-md mx-auto leading-relaxed">
                        {serverBackupsError}
                      </p>
                      <div className="flex items-center justify-center gap-2 pt-1">
                        <button
                          type="button"
                          onClick={fetchServerBackups}
                          className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl text-xs transition-all cursor-pointer inline-flex items-center gap-1.5 shadow-sm"
                        >
                          <RefreshCw size={13} />
                          <span>Tentar Novamente</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setRestoreTab('file')}
                          className="px-4 py-2 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-800 dark:text-slate-200 font-bold rounded-xl text-xs transition-all cursor-pointer inline-flex items-center gap-1.5"
                        >
                          <FileSpreadsheet size={13} />
                          <span>Importar Planilha</span>
                        </button>
                      </div>
                    </div>
                  ) : (!Array.isArray(serverBackups) || serverBackups.length === 0) ? (
                    <div className="p-8 text-center bg-slate-50 dark:bg-slate-800/40 rounded-2xl border border-dashed border-slate-200 dark:border-slate-700 text-xs text-slate-500 space-y-2">
                      <HardDrive size={24} className="mx-auto text-slate-400 mb-1" />
                      <p className="font-bold text-slate-700 dark:text-slate-300">
                        Nenhum ponto de restauração anterior encontrado no servidor.
                      </p>
                      <p className="text-[11px] text-slate-500">
                        Você pode recuperar seus dados importando sua planilha Excel (.xlsx, .xls) ou arquivo JSON na primeira aba.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-2.5 max-h-72 overflow-y-auto pr-1">
                      {serverBackups.map((bk, idx) => {
                        if (!bk) return null;
                        const samplePlates = Array.isArray(bk.samplePlates) ? bk.samplePlates : [];
                        const isCurrentRestoring = isRestoring && restoringFilename === bk.filename;

                        return (
                          <div 
                            key={bk.id || bk.filename || idx}
                            className={cn(
                              "p-4 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-all shadow-xs border",
                              isCurrentRestoring
                                ? "bg-blue-50/70 dark:bg-blue-950/40 border-blue-400 dark:border-blue-600 ring-2 ring-blue-500/30"
                                : "bg-slate-50 dark:bg-slate-800/70 border-slate-200 dark:border-slate-700 hover:border-blue-400 dark:hover:border-blue-500"
                            )}
                          >
                            <div className="space-y-1">
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-slate-900 dark:text-white text-xs">
                                  {bk.title || bk.filename || "Backup"}
                                </span>
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-black bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300">
                                  {typeof bk.count === 'number' ? bk.count : 0} registros
                                </span>
                              </div>
                              <p className="text-[11px] font-mono text-slate-400">
                                Data: {formatSafeDate(bk.timestamp)} • Arquivo: {bk.filename || "-"}
                              </p>
                              {samplePlates.length > 0 && (
                                <div className="flex items-center gap-1.5 pt-1">
                                  <span className="text-[10px] text-slate-500">Placas de exemplo:</span>
                                  {samplePlates.slice(0, 5).map((p: string, pIdx: number) => (
                                    <span key={pIdx} className="px-1.5 py-0.2 rounded bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 font-mono text-[9px] font-black">
                                      {String(p || "")}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>

                            <button
                              type="button"
                              disabled={isRestoring}
                              onClick={() => handleRestoreFromSnapshot(bk.filename)}
                              className={cn(
                                "px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 shrink-0 cursor-pointer",
                                isCurrentRestoring
                                  ? "bg-blue-600 text-white cursor-wait opacity-90 shadow-md shadow-blue-500/30"
                                  : "bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white shadow-md shadow-blue-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
                              )}
                            >
                              {isCurrentRestoring ? (
                                <>
                                  <RefreshCw size={14} className="animate-spin" />
                                  <span>Restaurando...</span>
                                </>
                              ) : (
                                <>
                                  <RotateCcw size={14} />
                                  <span>Restaurar Este Ponto</span>
                                </>
                              )}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/70 dark:bg-slate-800/50 shrink-0">
              <span className="text-xs text-slate-500">
                {parsedRestorationData ? `${parsedRestorationData.items.length} justificativas prontas para restauração` : "Selecione a fonte de restauração"}
              </span>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsRestoreModalOpen(false);
                    setParsedRestorationData(null);
                    setSelectedBackupFile(null);
                    setRestoreFeedback(null);
                  }}
                  className="px-4 py-2 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 text-slate-800 dark:text-slate-200 font-bold rounded-xl transition-all cursor-pointer text-xs"
                >
                  Cancelar
                </button>

                {restoreTab === 'file' && parsedRestorationData && parsedRestorationData.items.length > 0 && (
                  <button
                    type="button"
                    disabled={isRestoring}
                    onClick={handleConfirmRestore}
                    className="flex items-center gap-2 px-5 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold rounded-xl shadow-md shadow-emerald-600/20 transition-all cursor-pointer text-xs"
                  >
                    {isRestoring ? <RefreshCw size={14} className="animate-spin" /> : <Check size={14} />}
                    <span>Confirmar Restauração ({parsedRestorationData.items.length})</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        </ErrorBoundary>
      </div>
    )}

      {/* Modal de Histórico de Justificativas e Ações por Veículo */}
      <VehicleJustificationHistoryModal
        isOpen={isHistoryModalOpen}
        onClose={() => setIsHistoryModalOpen(false)}
        selectedPlate={historyTargetPlate}
        historyItems={effectiveHistory}
        activeJustifications={justifications}
        baseFleet={baseFleet}
        onAddHistoryItem={onAddHistoryItem}
        renderModernPDFHeader={renderModernPDFHeader}
        loadPDFLogo={loadPDFLogo}
        theme={theme}
        title="Histórico de Justificativas - Licenças"
        sourceType="LICENCAS"
      />
    </div>
  );
};
