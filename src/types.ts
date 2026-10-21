export type DocumentStatus = 'vencido' | 'critico' | 'atencao' | 'ok' | 'pagos' | 'regular' | 'alerta';

export interface Document {
  id?: string;
  type: string;
  expiryDate: string;
  rawExpiryDate?: string;
  status: DocumentStatus;
  daysRemaining: number;
  validityPeriod?: string;
}

export interface Vehicle {
  id: string;
  fleet: string;
  plate: string;
  driver: string;
  operation: string;
  client: string;
  cityBase: string;
  vehicleType: string;
  status: string;
  hasBathroom?: string;
  documents: Document[];
  lastUpdate: string;
  origin: string;
  lat?: number;
  lng?: number;
  overallStatus: DocumentStatus;
  source?: "LICENCAS" | "DOCUMENTACAO";
  extraData?: any;
  isDefaultLocation?: boolean;
  isPreferredLocation?: boolean;
  defaultLocationName?: string;
  rawCity?: string;
  rawDriver?: string;
  resolvedCoords?: [number, number] | null;
}

export interface FleetStats {
  totalVehicles: number;
  totalDocuments?: number;
  activeOperations: number;
  expiringDocs: number;
  expiredDocs: number;
  ok: number;
  atencao: number;
  critico: number;
  vencido: number;
  expiredDocuments: { plate: string, type: string, expiryDate: string, driver: string }[];
}

export interface LicenseJustification {
  id: string;
  plate: string;
  fleet: string;
  operation: string;
  documentType: string;
  status: string;
  reason: string;
  authorizedBy: string;
  actionForecast: string;
  observations: string;
  updatedAt: string;
  createdAt?: string;
  updatedBy?: string;
}

export interface JustificationHistoryItem {
  id: string;
  justificationId?: string;
  plate: string;
  fleet: string;
  operation: string;
  documentType: string;
  status: string;
  reason: string;
  authorizedBy: string;
  actionForecast: string;
  observations: string;
  updatedAt: string;
  updatedBy?: string;
  actionType?: 'CRIADA' | 'ATUALIZADA' | 'EXCLUIDA' | 'REGISTRO_DIRETO' | 'HISTORICO' | 'JUSTIFICATIVA ATIVA';
  categoryKey?: 'GARAGEM' | 'SEM_PREVISAO' | 'POSTPONED' | null;
}

/**
 * Normalizes document type strings into canonical keys for strict 1:1 matching.
 * Guarantees that EVERY single document is 100% individual and strictly isolated:
 * Tacógrafo will NEVER match or replicate to Tx Insp Tacógrafo, Registro Cadastral,
 * Seguro, or any other license of the same vehicle plate.
 */
export function normalizeDocKey(str?: string): string {
  if (!str) return "";
  return str
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .replace(/[^A-Z0-9]/g, "");
}
