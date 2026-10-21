import "dotenv/config";
process.env.DISABLE_HMR = "true";
import express from "express";
import fs from "fs";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import Papa from "papaparse";
import { differenceInDays, parse, startOfDay, isValid, format, subHours } from "date-fns";
import { ptBR } from "date-fns/locale";
import { google } from "googleapis";
import cookieParser from "cookie-parser";
import { Readable } from "stream";
import sgMail from "@sendgrid/mail";

console.log("Starting server process...");

const __filename = typeof import.meta !== "undefined" && import.meta.url
  ? fileURLToPath(import.meta.url)
  : "";
const __dirname = __filename ? path.dirname(__filename) : "";

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const APP_URL = process.env.APP_URL || "http://localhost:3000";

let oauth2Client: any = null;
if (GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET) {
  try {
    oauth2Client = new google.auth.OAuth2(
      GOOGLE_CLIENT_ID,
      GOOGLE_CLIENT_SECRET,
      `${APP_URL}/api/auth/google/callback`
    );
    console.log("Google OAuth2 client initialized.");
  } catch (err) {
    console.error("Error initializing Google OAuth2 client:", err);
  }
} else {
  console.warn("Google OAuth credentials missing. OAuth features will be disabled.");
}

// Business Logic: Document Classification
function classifyDocument(expiryDateStr: string) {
  if (!expiryDateStr || typeof expiryDateStr !== 'string' || expiryDateStr.trim() === "" || expiryDateStr.toLowerCase().includes("definir")) {
    return { status: 'ok' as const, daysRemaining: 999 };
  }

  const cleanStr = expiryDateStr.trim().replace(/-/g, '/').replace(/\./g, '/');
  const today = startOfDay(new Date());
  let expiryDate: Date | null = null;

  // Try different date formats
  // Based on user feedback, we MUST prioritize BR format (DD/MM/YYYY)
  // to avoid misinterpreting ambiguous dates like 02/12/2026 as US format.
  const formats = [
    "dd/MM/yyyy",
    "d/M/yyyy",
    "dd/MM/yy",
    "d/M/yy",
    "yyyy/MM/dd",
    "MM/dd/yyyy",
    "M/d/yyyy"
  ];
  
  // Special case for "RENOVAR" or "RESERVA" - treat as expired or critical
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
    // Check if it's a month/year string like "03/2026" or "03/26"
    // We look for MM/YYYY or MM/YY
    const match = cleanStr.match(/(?:^|\s|-)(\d{1,2})\/(\d{2,4})$/);
    if (match) {
      const month = parseInt(match[1]);
      let year = parseInt(match[2]);
      if (year < 100) year += 2000; 
      if (month >= 1 && month <= 12) {
        expiryDate = startOfDay(new Date(year, month, 0)); // Last day of that month
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
}

function isDespachanteType(val: string | null | undefined): boolean {
  if (!val) return false;
  const s = String(val).toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  return s.includes("DESPACHANTE") || s.includes("DEPACHANTE") || s.includes("DESP.");
}

function formatBRDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "-";
  const s = String(dateStr).trim();
  if (s === "" || s === "-") return "-";
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(s)) return s;
  const classification = classifyDocument(s);
  return classification.formattedDate || s;
}

async function startServer() {
  console.log("Initializing startServer function...");
  const app = express();
  const PORT = 3000;

  // Sheet URLs from environment variables or defaults
  const SHEET_URLS = {
    "BAYER MT": process.env.SHEET_URL_BAYER_MT || "https://docs.google.com/spreadsheets/d/1oMQutBfRI1amf6-E05Q1p3elKzlRpx5a6Qo_zpiXPd4/gviz/tq?tqx=out:csv&sheet=BAYER.%20M.T",
    "BAYER GO": process.env.SHEET_URL_BAYER_GO || "https://docs.google.com/spreadsheets/d/1oMQutBfRI1amf6-E05Q1p3elKzlRpx5a6Qo_zpiXPd4/gviz/tq?tqx=out:csv&sheet=BAYER%20-%20G.O",
    "CITROSUCO - UBERLANDIA": process.env.SHEET_URL_CITROSUCO_UBE || process.env.SHEET_URL_CITROSUCO_UBERLANDIA || "https://docs.google.com/spreadsheets/d/1oMQutBfRI1amf6-E05Q1p3elKzlRpx5a6Qo_zpiXPd4/gviz/tq?tqx=out:csv&sheet=CITROSUCO%20-%20UBERLANDIA",
    "CITROSUCO - SÃO PAULO": process.env["SHEET_URL_CITROSUCO - SP"] || process.env.SHEET_URL_CITROSUCO_SP || process.env.SHEET_URL_CITROSUCO_SAO_PAULO || "https://docs.google.com/spreadsheets/d/1oMQutBfRI1amf6-E05Q1p3elKzlRpx5a6Qo_zpiXPd4/gviz/tq?tqx=out:csv&sheet=CITROSUCO%20-%20S%C3%83O%20PAULO",
    "DOC_SISTEMA": process.env.SHEET_URL_DOC_SISTEMA || "https://docs.google.com/spreadsheets/d/1_Wy2mIjpz-muAyDmDADm05C4kBUYo7dbVdkAY08MXhQ/gviz/tq?tqx=out:csv&sheet=DOC_SISTEMA_ETL"
  };

function extractCleanDocTypeAndValidity(rawKey: string, initialValidity: string): { cleanType: string; validityPeriod: string } {
  let validityPeriod = (initialValidity || "").trim();
  let cleanType = (rawKey || "").trim();

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

  const cleanUpper = cleanType.toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if ((cleanUpper.includes("INSP") || cleanUpper.includes("TX") || cleanUpper.includes("TAXA")) && cleanUpper.includes("TACO")) {
    cleanType = "TX INSP TACOGRAFO";
  }

  return { cleanType, validityPeriod };
}

  app.use(express.json({ limit: '50mb' }));
  app.use(cookieParser());

  app.use((req, res, next) => {
    if (req.url && req.url.startsWith("/api/")) {
      console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
    }
    next();
  });

  // Resolve SendGrid credentials dynamically (handling case where user may have inverted SENDGRID_API_KEY and SENDGRID_FROM_EMAIL)
  let sendgridApiKey = process.env.SENDGRID_API_KEY || "";
  let sendgridFromEmail = process.env.SENDGRID_FROM_EMAIL || "";

  if (sendgridFromEmail.startsWith("SG.") && (!sendgridApiKey || !sendgridApiKey.startsWith("SG."))) {
    console.log("Detected swapped SendGrid configuration. Swapping values to correctly set up SendGrid...");
    const temp = sendgridApiKey;
    sendgridApiKey = sendgridFromEmail;
    sendgridFromEmail = temp;
  }

  // Ensure "from" email has a valid format (contains '@'), fallback to user's email if invalid
  if (!sendgridFromEmail || !sendgridFromEmail.includes("@")) {
    console.warn("SendGrid FROM email is invalid or missing or swapped. Using user fallback vivi.digo2026@gmail.com.");
    sendgridFromEmail = "vivi.digo2026@gmail.com";
  }

  // Initialize SendGrid with corrected credentials
  if (sendgridApiKey) {
    sgMail.setApiKey(sendgridApiKey);
  }

  // Helper to dynamically calculate current application URL for OAuth callbacks
  const getAppUrl = (req: express.Request) => {
    if (process.env.APP_URL) {
      return process.env.APP_URL;
    }
    const proto = req.headers["x-forwarded-proto"] || req.protocol;
    const host = req.get("host");
    return `${proto}://${host}`;
  };

  // Health check
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  const SETTINGS_FILE = path.join(process.cwd(), "settings.json");

  app.get("/api/settings", (req, res) => {
    try {
      if (fs.existsSync(SETTINGS_FILE)) {
        const data = fs.readFileSync(SETTINGS_FILE, "utf-8");
        return res.json(JSON.parse(data));
      }
      return res.json({});
    } catch (err) {
      console.error("Error reading settings.json:", err);
      return res.status(500).json({ error: "Failed to read settings" });
    }
  });

  app.post("/api/settings", (req, res) => {
    try {
      fs.writeFileSync(SETTINGS_FILE, JSON.stringify(req.body, null, 2), "utf-8");
      return res.json({ success: true });
    } catch (err) {
      console.error("Error writing settings.json:", err);
      return res.status(500).json({ error: "Failed to save settings" });
    }
  });

  const JUSTIFICATIONS_FILE = path.join(process.cwd(), "justifications_db.json");
  const DOC_JUSTIFICATIONS_FILE = path.join(process.cwd(), "doc_justifications_db.json");

  function safeSaveToSrcData(filename: string, content: string) {
    try {
      const dataDir = path.join(process.cwd(), "src", "data");
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }
      fs.writeFileSync(path.join(dataDir, filename), content, "utf-8");
    } catch (_) {}
  }

  // Load Firebase Config for Firestore REST persistence across any machine/user
  let firebaseConfig: any = null;
  try {
    const cfgPath = path.join(process.cwd(), "firebase-applet-config.json");
    if (fs.existsSync(cfgPath)) {
      firebaseConfig = JSON.parse(fs.readFileSync(cfgPath, "utf-8"));
      console.log("Firebase config loaded successfully for server-side persistence.");
    }
  } catch (e) {
    console.warn("Could not load firebase-applet-config.json:", e);
  }

  function toFirestoreValue(val: any): any {
    if (val === null || val === undefined) return { nullValue: null };
    if (typeof val === "boolean") return { booleanValue: val };
    if (typeof val === "number") {
      if (Number.isInteger(val)) return { integerValue: String(val) };
      return { doubleValue: val };
    }
    if (typeof val === "string") return { stringValue: val };
    if (Array.isArray(val)) {
      return { arrayValue: { values: val.map(toFirestoreValue) } };
    }
    if (typeof val === "object") {
      const fields: Record<string, any> = {};
      for (const [k, v] of Object.entries(val)) {
        if (v !== undefined) {
          fields[k] = toFirestoreValue(v);
        }
      }
      return { mapValue: { fields } };
    }
    return { stringValue: String(val) };
  }

  function fromFirestoreValue(val: any): any {
    if (!val) return null;
    if ("stringValue" in val) return val.stringValue;
    if ("booleanValue" in val) return val.booleanValue;
    if ("integerValue" in val) return parseInt(val.integerValue, 10);
    if ("doubleValue" in val) return parseFloat(val.doubleValue);
    if ("nullValue" in val) return null;
    if ("arrayValue" in val) {
      return (val.arrayValue.values || []).map(fromFirestoreValue);
    }
    if ("mapValue" in val) {
      const obj: Record<string, any> = {};
      for (const [k, v] of Object.entries(val.mapValue.fields || {})) {
        obj[k] = fromFirestoreValue(v);
      }
      return obj;
    }
    return null;
  }

  async function getFirestoreDoc(collection: string, docId: string): Promise<any | null> {
    if (isServerFirestoreQuotaExceeded) return null;
    if (!firebaseConfig?.projectId || !firebaseConfig?.apiKey) return null;
    try {
      const dbId = firebaseConfig.firestoreDatabaseId || "(default)";
      const url = `https://firestore.googleapis.com/v1/projects/${firebaseConfig.projectId}/databases/${dbId}/documents/${collection}/${docId}?key=${firebaseConfig.apiKey}`;
      const res = await fetch(url);
      if (!res.ok) {
        if (res.status === 429 || res.status === 403) {
          isServerFirestoreQuotaExceeded = true;
        }
        return null;
      }
      const json: any = await res.json();
      if (!json.fields) return null;
      const docData: Record<string, any> = {};
      for (const [k, v] of Object.entries(json.fields)) {
        docData[k] = fromFirestoreValue(v);
      }
      return docData;
    } catch (err) {
      return null;
    }
  }

  let isServerFirestoreQuotaExceeded = false;
  async function setFirestoreDoc(collection: string, docId: string, data: Record<string, any>): Promise<boolean> {
    if (isServerFirestoreQuotaExceeded) return false;
    if (!firebaseConfig?.projectId || !firebaseConfig?.apiKey) return false;
    try {
      const dbId = firebaseConfig.firestoreDatabaseId || "(default)";
      const url = `https://firestore.googleapis.com/v1/projects/${firebaseConfig.projectId}/databases/${dbId}/documents/${collection}/${docId}?key=${firebaseConfig.apiKey}`;
      const fields: Record<string, any> = {};
      for (const [k, v] of Object.entries(data)) {
        fields[k] = toFirestoreValue(v);
      }
      const res = await fetch(url, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fields })
      });
      if (!res.ok) {
        let errText = "";
        try { errText = await res.text(); } catch (_) {}
        if (
          res.status === 429 || 
          res.status === 403 || 
          errText.includes("RESOURCE_EXHAUSTED") || 
          errText.includes("Quota limit exceeded") ||
          errText.includes("Quota exceeded") ||
          errText.includes("Free daily write units")
        ) {
          isServerFirestoreQuotaExceeded = true;
          console.warn(`[Firestore REST] Cota de gravação gratuita do Firestore excedida (${res.status}). Persistência em disco segura ativada no servidor.`);
        }
        return false;
      }
      return true;
    } catch (err) {
      console.warn(`[Firestore REST] Error saving ${collection}/${docId}:`, err);
      return false;
    }
  }

  app.get("/api/justifications", async (req, res) => {
    try {
      // 1. Read from Firestore cloud database (guarantees cross-machine / cross-user consistency)
      const firestoreData = await getFirestoreDoc("license_justifications", "all");
      if (firestoreData && Array.isArray(firestoreData.items)) {
        try {
          fs.writeFileSync(JUSTIFICATIONS_FILE, JSON.stringify(firestoreData, null, 2), "utf-8");
        } catch (_) {}
        return res.json(firestoreData);
      }

      // 2. Fallback to local cache if offline or starting up
      if (fs.existsSync(JUSTIFICATIONS_FILE)) {
        const data = fs.readFileSync(JUSTIFICATIONS_FILE, "utf-8");
        return res.json(JSON.parse(data));
      }
      return res.json({ items: [], lastUpdated: null });
    } catch (err) {
      console.error("Error reading justifications:", err);
      if (fs.existsSync(JUSTIFICATIONS_FILE)) {
        try {
          return res.json(JSON.parse(fs.readFileSync(JUSTIFICATIONS_FILE, "utf-8")));
        } catch (_) {}
      }
      return res.status(500).json({ error: "Failed to read justifications" });
    }
  });

  app.post("/api/justifications", async (req, res) => {
    try {
      const items = Array.isArray(req.body?.items) ? req.body.items : (Array.isArray(req.body) ? req.body : []);
      const payload = {
        items,
        lastUpdated: new Date().toISOString(),
        count: items.length
      };

      // 1. Cloud persistence to Firestore (stored permanently in Firebase)
      await setFirestoreDoc("license_justifications", "all", payload);

      // 2. Local disk fallback and static seed sync
      try {
        fs.writeFileSync(JUSTIFICATIONS_FILE, JSON.stringify(payload, null, 2), "utf-8");
        safeSaveToSrcData("default_license_justifications.json", JSON.stringify(payload, null, 2));
      } catch (_) {}

      // 3. Auto-save snapshot if items > 0
      if (items.length > 0) {
        try {
          const snapshotFile = path.join(BACKUPS_DIR, `license_justifications_backup_${Date.now()}.json`);
          const latestFile = path.join(BACKUPS_DIR, "license_justifications_backup_latest.json");
          fs.writeFileSync(snapshotFile, JSON.stringify(payload, null, 2), "utf-8");
          fs.writeFileSync(latestFile, JSON.stringify(payload, null, 2), "utf-8");
        } catch (_) {}
      }

      return res.json({ success: true, count: items.length, lastUpdated: payload.lastUpdated });
    } catch (err) {
      console.error("Error writing justifications:", err);
      return res.status(500).json({ error: "Failed to save justifications" });
    }
  });

  const BACKUPS_DIR = path.join(process.cwd(), "backups");
  if (!fs.existsSync(BACKUPS_DIR)) {
    try { fs.mkdirSync(BACKUPS_DIR, { recursive: true }); } catch (_) {}
  }

  // Dedicated Restore Route for License Justifications
  app.post("/api/justifications/restore", async (req, res) => {
    try {
      const items = Array.isArray(req.body?.items) ? req.body.items : [];
      const source = req.body?.source || "excel_restore";
      const payload = {
        items,
        lastUpdated: new Date().toISOString(),
        count: items.length,
        source
      };

      // 1. Write to main license justifications file
      try {
        fs.writeFileSync(JUSTIFICATIONS_FILE, JSON.stringify(payload, null, 2), "utf-8");
      } catch (e) {
        console.error("Error writing JUSTIFICATIONS_FILE during restore:", e);
      }

      // 2. Create persistent timestamped backup file
      try {
        const snapPath = path.join(BACKUPS_DIR, `license_justifications_backup_restored_${Date.now()}.json`);
        const latestPath = path.join(BACKUPS_DIR, "license_justifications_backup_latest.json");
        fs.writeFileSync(snapPath, JSON.stringify(payload, null, 2), "utf-8");
        fs.writeFileSync(latestPath, JSON.stringify(payload, null, 2), "utf-8");
      } catch (_) {}

      // 3. Sync to Firestore
      await setFirestoreDoc("license_justifications", "all", payload);

      return res.json({ success: true, count: items.length, lastUpdated: payload.lastUpdated, source });
    } catch (err) {
      console.error("Error restoring license justifications:", err);
      return res.status(500).json({ error: "Failed to restore license justifications" });
    }
  });

  // Snapshot route for License Justifications (triggered on Excel save or manual backup)
  app.post("/api/justifications/backup-snapshot", async (req, res) => {
    try {
      const items = Array.isArray(req.body?.items) ? req.body.items : [];
      const reason = req.body?.reason || "excel_export";
      const payload = {
        items,
        lastUpdated: new Date().toISOString(),
        count: items.length,
        reason
      };

      const filename = `license_justifications_snapshot_${Date.now()}.json`;
      const fullPath = path.join(BACKUPS_DIR, filename);
      const latestPath = path.join(BACKUPS_DIR, "license_justifications_backup_latest.json");

      fs.writeFileSync(fullPath, JSON.stringify(payload, null, 2), "utf-8");
      if (items.length > 0) {
        fs.writeFileSync(latestPath, JSON.stringify(payload, null, 2), "utf-8");
      }

      return res.json({ success: true, filename, count: items.length, timestamp: payload.lastUpdated });
    } catch (err) {
      console.error("Error creating license backup snapshot:", err);
      return res.status(500).json({ error: "Failed to create snapshot" });
    }
  });

  // List all available backups for License Justifications
  app.get("/api/justifications/backups", async (req, res) => {
    try {
      const backupsList: Array<{
        id: string;
        filename: string;
        title: string;
        timestamp: string;
        count: number;
        samplePlates: string[];
      }> = [];

      // Check backups directory for License-specific backups
      if (fs.existsSync(BACKUPS_DIR)) {
        const files = fs.readdirSync(BACKUPS_DIR).filter(f => f.endsWith(".json") && !f.includes("doc"));
        for (const file of files) {
          try {
            const content = JSON.parse(fs.readFileSync(path.join(BACKUPS_DIR, file), "utf-8"));
            const items = Array.isArray(content?.items) ? content.items : [];
            const plates = Array.from(new Set(items.map((it: any) => it.plate).filter(Boolean))).slice(0, 5) as string[];
            backupsList.push({
              id: file,
              filename: file,
              title: file.includes("restored")
                ? "Backup Restaurado do Excel (Licenças)"
                : file.includes("snapshot")
                ? "Ponto ao Salvar em Excel (Licenças)"
                : "Backup Automático de Licenças",
              timestamp: content.lastUpdated || new Date(fs.statSync(path.join(BACKUPS_DIR, file)).mtime).toISOString(),
              count: items.length,
              samplePlates: plates
            });
          } catch (_) {}
        }
      }

      // Check justifications_db.json (Licenças)
      if (fs.existsSync(JUSTIFICATIONS_FILE)) {
        try {
          const licContent = JSON.parse(fs.readFileSync(JUSTIFICATIONS_FILE, "utf-8"));
          const licItems = Array.isArray(licContent?.items) ? licContent.items : [];
          if (licItems.length > 0) {
            const plates = Array.from(new Set(licItems.map((it: any) => it.plate).filter(Boolean))).slice(0, 5) as string[];
            backupsList.push({
              id: "justifications_db.json",
              filename: "justifications_db.json",
              title: "Banco Atual de Licenças (justifications_db.json)",
              timestamp: licContent.updatedAt || new Date().toISOString(),
              count: licItems.length,
              samplePlates: plates
            });
          }
        } catch (_) {}
      }

      backupsList.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      return res.json({ backups: backupsList });
    } catch (err) {
      console.error("Error listing license backups:", err);
      return res.status(500).json({ error: "Failed to list backups" });
    }
  });

  // Restore snapshot for License Justifications
  app.post("/api/justifications/restore-snapshot", async (req, res) => {
    try {
      const { filename } = req.body;
      if (!filename) return res.status(400).json({ error: "Filename is required" });

      let targetPath = path.join(BACKUPS_DIR, filename);
      if (!fs.existsSync(targetPath)) {
        if (filename === "justifications_db.json" && fs.existsSync(JUSTIFICATIONS_FILE)) {
          targetPath = JUSTIFICATIONS_FILE;
        } else if (filename === "doc_justifications_db.json" && fs.existsSync(DOC_JUSTIFICATIONS_FILE)) {
          targetPath = DOC_JUSTIFICATIONS_FILE;
        } else if (fs.existsSync(path.join(process.cwd(), filename))) {
          targetPath = path.join(process.cwd(), filename);
        } else {
          return res.status(404).json({ error: "Backup file not found" });
        }
      }

      let content: any = null;
      try {
        content = JSON.parse(fs.readFileSync(targetPath, "utf-8"));
      } catch (parseErr) {
        return res.status(400).json({ error: "Arquivo de backup contém JSON inválido ou corrompido" });
      }
      const items = Array.isArray(content?.items) ? content.items : [];
      const payload = {
        items,
        lastUpdated: new Date().toISOString(),
        count: items.length,
        restoredFrom: filename
      };

      fs.writeFileSync(JUSTIFICATIONS_FILE, JSON.stringify(payload, null, 2), "utf-8");
      try {
        await setFirestoreDoc("license_justifications", "all", payload);
      } catch (fErr) {
        console.warn("Firestore sync optional warning during license restore:", fErr);
      }

      return res.json({ success: true, count: items.length, items, filename });
    } catch (err) {
      console.error("Error restoring license snapshot:", err);
      return res.status(500).json({ error: "Falha ao restaurar ponto de backup de licenças." });
    }
  });

  app.get("/api/doc-justifications", async (req, res) => {
    try {
      // 1. Read from Firestore cloud database
      const firestoreData = await getFirestoreDoc("doc_justifications", "all");
      if (firestoreData && Array.isArray(firestoreData.items) && firestoreData.items.length > 0) {
        try {
          fs.writeFileSync(DOC_JUSTIFICATIONS_FILE, JSON.stringify(firestoreData, null, 2), "utf-8");
        } catch (_) {}
        return res.json(firestoreData);
      }

      // 2. Fallback to local cache
      if (fs.existsSync(DOC_JUSTIFICATIONS_FILE)) {
        const data = fs.readFileSync(DOC_JUSTIFICATIONS_FILE, "utf-8");
        const parsed = JSON.parse(data);
        if (parsed && Array.isArray(parsed.items) && parsed.items.length > 0) {
          return res.json(parsed);
        }
      }

      // 3. Fallback to latest backup if local file is empty
      const latestBackupFile = path.join(BACKUPS_DIR, "doc_justifications_backup_latest.json");
      if (fs.existsSync(latestBackupFile)) {
        const backupData = fs.readFileSync(latestBackupFile, "utf-8");
        const parsed = JSON.parse(backupData);
        if (parsed && Array.isArray(parsed.items) && parsed.items.length > 0) {
          try {
            fs.writeFileSync(DOC_JUSTIFICATIONS_FILE, JSON.stringify(parsed, null, 2), "utf-8");
          } catch (_) {}
          return res.json(parsed);
        }
      }

      return res.json({ items: [], lastUpdated: null });
    } catch (err) {
      console.error("Error reading doc justifications:", err);
      if (fs.existsSync(DOC_JUSTIFICATIONS_FILE)) {
        try {
          return res.json(JSON.parse(fs.readFileSync(DOC_JUSTIFICATIONS_FILE, "utf-8")));
        } catch (_) {}
      }
      return res.status(500).json({ error: "Failed to read doc justifications" });
    }
  });

  app.post("/api/doc-justifications", async (req, res) => {
    try {
      const items = Array.isArray(req.body?.items) ? req.body.items : (Array.isArray(req.body) ? req.body : []);
      const payload = {
        items,
        lastUpdated: new Date().toISOString(),
        count: items.length
      };

      // 1. Cloud persistence to Firestore
      await setFirestoreDoc("doc_justifications", "all", payload);

      // 2. Local disk fallback and static seed sync
      try {
        fs.writeFileSync(DOC_JUSTIFICATIONS_FILE, JSON.stringify(payload, null, 2), "utf-8");
        safeSaveToSrcData("default_doc_justifications.json", JSON.stringify(payload, null, 2));
      } catch (_) {}

      // 3. Auto-save snapshot if items > 0
      if (items.length > 0) {
        try {
          const snapshotFile = path.join(BACKUPS_DIR, `doc_justifications_backup_${Date.now()}.json`);
          const latestFile = path.join(BACKUPS_DIR, "doc_justifications_backup_latest.json");
          fs.writeFileSync(snapshotFile, JSON.stringify(payload, null, 2), "utf-8");
          fs.writeFileSync(latestFile, JSON.stringify(payload, null, 2), "utf-8");
        } catch (_) {}
      }

      return res.json({ success: true, count: items.length, lastUpdated: payload.lastUpdated });
    } catch (err) {
      console.error("Error writing doc justifications:", err);
      return res.status(500).json({ error: "Failed to save doc justifications" });
    }
  });

  // Dedicated Restore Route: saves restored items from Excel or backup file
  app.post("/api/doc-justifications/restore", async (req, res) => {
    try {
      const items = Array.isArray(req.body?.items) ? req.body.items : [];
      const source = req.body?.source || "excel_restore";
      const payload = {
        items,
        lastUpdated: new Date().toISOString(),
        count: items.length,
        source
      };

      // 1. Write to main doc justifications file
      try {
        fs.writeFileSync(DOC_JUSTIFICATIONS_FILE, JSON.stringify(payload, null, 2), "utf-8");
      } catch (e) {
        console.error("Error writing DOC_JUSTIFICATIONS_FILE during restore:", e);
      }

      // 2. Create persistent timestamped backup file
      try {
        const snapPath = path.join(BACKUPS_DIR, `doc_justifications_backup_restored_${Date.now()}.json`);
        const latestPath = path.join(BACKUPS_DIR, "doc_justifications_backup_latest.json");
        fs.writeFileSync(snapPath, JSON.stringify(payload, null, 2), "utf-8");
        fs.writeFileSync(latestPath, JSON.stringify(payload, null, 2), "utf-8");
      } catch (_) {}

      // 3. Sync to Firestore
      await setFirestoreDoc("doc_justifications", "all", payload);

      return res.json({ success: true, count: items.length, lastUpdated: payload.lastUpdated, source });
    } catch (err) {
      console.error("Error restoring doc justifications:", err);
      return res.status(500).json({ error: "Failed to restore doc justifications" });
    }
  });

  // Manual or automatic snapshot route (triggered on Excel save or manual backup)
  app.post("/api/doc-justifications/backup-snapshot", async (req, res) => {
    try {
      const items = Array.isArray(req.body?.items) ? req.body.items : [];
      const reason = req.body?.reason || "excel_export";
      const payload = {
        items,
        lastUpdated: new Date().toISOString(),
        count: items.length,
        reason
      };

      const filename = `doc_justifications_snapshot_${Date.now()}.json`;
      const fullPath = path.join(BACKUPS_DIR, filename);
      const latestPath = path.join(BACKUPS_DIR, "doc_justifications_backup_latest.json");

      fs.writeFileSync(fullPath, JSON.stringify(payload, null, 2), "utf-8");
      if (items.length > 0) {
        fs.writeFileSync(latestPath, JSON.stringify(payload, null, 2), "utf-8");
      }

      return res.json({ success: true, filename, count: items.length, timestamp: payload.lastUpdated });
    } catch (err) {
      console.error("Error creating backup snapshot:", err);
      return res.status(500).json({ error: "Failed to create snapshot" });
    }
  });

  // List all available backups
  app.get("/api/doc-justifications/backups", async (req, res) => {
    try {
      const backupsList: Array<{
        id: string;
        filename: string;
        title: string;
        timestamp: string;
        count: number;
        samplePlates: string[];
      }> = [];

      // Check backups directory for Documentação-specific backups
      if (fs.existsSync(BACKUPS_DIR)) {
        const files = fs.readdirSync(BACKUPS_DIR).filter(f => f.endsWith(".json") && !f.includes("license"));
        for (const file of files) {
          try {
            const content = JSON.parse(fs.readFileSync(path.join(BACKUPS_DIR, file), "utf-8"));
            const items = Array.isArray(content?.items) ? content.items : [];
            const plates = Array.from(new Set(items.map((it: any) => it.plate).filter(Boolean))).slice(0, 5) as string[];
            backupsList.push({
              id: file,
              filename: file,
              title: file.includes("restored") 
                ? "Backup Restaurado do Excel (Documentação)" 
                : file.includes("snapshot") 
                ? "Ponto ao Salvar em Excel (Documentação)" 
                : "Backup Automático de Documentação",
              timestamp: content.lastUpdated || new Date(fs.statSync(path.join(BACKUPS_DIR, file)).mtime).toISOString(),
              count: items.length,
              samplePlates: plates
            });
          } catch (_) {}
        }
      }

      // Check doc_justifications_db.json (Documentação)
      if (fs.existsSync(DOC_JUSTIFICATIONS_FILE)) {
        try {
          const docContent = JSON.parse(fs.readFileSync(DOC_JUSTIFICATIONS_FILE, "utf-8"));
          const docItems = Array.isArray(docContent?.items) ? docContent.items : [];
          if (docItems.length > 0) {
            const plates = Array.from(new Set(docItems.map((it: any) => it.plate).filter(Boolean))).slice(0, 5) as string[];
            backupsList.push({
              id: "doc_justifications_db.json",
              filename: "doc_justifications_db.json",
              title: "Banco Atual de Documentação (doc_justifications_db.json)",
              timestamp: docContent.lastUpdated || docContent.updatedAt || new Date().toISOString(),
              count: docItems.length,
              samplePlates: plates
            });
          }
        } catch (_) {}
      }

      // Sort newest first
      backupsList.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

      return res.json({ backups: backupsList });
    } catch (err) {
      console.error("Error listing backups:", err);
      return res.status(500).json({ error: "Failed to list backups" });
    }
  });

  // Restore a specific backup snapshot by filename
  app.post("/api/doc-justifications/restore-snapshot", async (req, res) => {
    try {
      const { filename } = req.body;
      if (!filename || typeof filename !== 'string') {
        return res.status(400).json({ error: "Nome de arquivo de backup inválido ou ausente." });
      }

      const safeFilename = path.basename(filename);
      let targetPath = path.join(BACKUPS_DIR, safeFilename);
      if (!fs.existsSync(targetPath)) {
        if (safeFilename === "doc_justifications_db.json" && fs.existsSync(DOC_JUSTIFICATIONS_FILE)) {
          targetPath = DOC_JUSTIFICATIONS_FILE;
        } else if (fs.existsSync(path.join(process.cwd(), safeFilename))) {
          targetPath = path.join(process.cwd(), safeFilename);
        } else {
          return res.status(404).json({ error: `O ponto de backup "${safeFilename}" não foi localizado no servidor.` });
        }
      }

      let content: any = null;
      try {
        content = JSON.parse(fs.readFileSync(targetPath, "utf-8"));
      } catch (parseErr) {
        return res.status(400).json({ error: `O arquivo "${safeFilename}" contém dados corrompidos ou formato incompatível.` });
      }

      const rawItems = Array.isArray(content?.items) ? content.items : (Array.isArray(content) ? content : []);
      const validItems = rawItems.filter((it: any) => it && typeof it === 'object' && (it.plate || it.placa));

      if (validItems.length === 0) {
        return res.status(400).json({ error: `O ponto de backup "${safeFilename}" não contém justificativas válidas.` });
      }

      const payload = {
        items: validItems,
        lastUpdated: new Date().toISOString(),
        count: validItems.length,
        restoredFrom: filename
      };

      fs.writeFileSync(DOC_JUSTIFICATIONS_FILE, JSON.stringify(payload, null, 2), "utf-8");
      try {
        await setFirestoreDoc("doc_justifications", "all", payload);
      } catch (fErr) {
        console.warn("Firestore sync optional warning during doc restore:", fErr);
      }

      return res.json({ success: true, count: validItems.length, items: validItems, filename: safeFilename });
    } catch (err) {
      console.error("Error restoring snapshot:", err);
      return res.status(500).json({ error: "Falha ao restaurar ponto de backup no servidor." });
    }
  });

  const JUSTIFICATIONS_HISTORY_FILE = path.join(process.cwd(), "justifications_history_db.json");
  const DOC_JUSTIFICATIONS_HISTORY_FILE = path.join(process.cwd(), "doc_justifications_history_db.json");

  // History routes for License Justifications
  app.get("/api/justifications/history", async (req, res) => {
    try {
      const firestoreData = await getFirestoreDoc("license_justifications_history", "all");
      if (firestoreData && Array.isArray(firestoreData.items)) {
        try {
          fs.writeFileSync(JUSTIFICATIONS_HISTORY_FILE, JSON.stringify(firestoreData, null, 2), "utf-8");
        } catch (_) {}
        return res.json(firestoreData);
      }
      if (fs.existsSync(JUSTIFICATIONS_HISTORY_FILE)) {
        const data = fs.readFileSync(JUSTIFICATIONS_HISTORY_FILE, "utf-8");
        return res.json(JSON.parse(data));
      }
      return res.json({ items: [], lastUpdated: null });
    } catch (err) {
      console.error("Error reading justifications history:", err);
      if (fs.existsSync(JUSTIFICATIONS_HISTORY_FILE)) {
        try {
          return res.json(JSON.parse(fs.readFileSync(JUSTIFICATIONS_HISTORY_FILE, "utf-8")));
        } catch (_) {}
      }
      return res.status(500).json({ error: "Failed to read justifications history" });
    }
  });

  app.post("/api/justifications/history", async (req, res) => {
    try {
      const items = Array.isArray(req.body?.items) ? req.body.items : (Array.isArray(req.body) ? req.body : []);
      const payload = {
        items,
        lastUpdated: new Date().toISOString(),
        count: items.length
      };
      await setFirestoreDoc("license_justifications_history", "all", payload);
      try {
        fs.writeFileSync(JUSTIFICATIONS_HISTORY_FILE, JSON.stringify(payload, null, 2), "utf-8");
        safeSaveToSrcData("default_license_history.json", JSON.stringify(payload, null, 2));
      } catch (_) {}
      return res.json({ success: true, count: items.length, lastUpdated: payload.lastUpdated });
    } catch (err) {
      console.error("Error writing justifications history:", err);
      return res.status(500).json({ error: "Failed to save justifications history" });
    }
  });

  // History routes for Document Justifications
  app.get("/api/doc-justifications/history", async (req, res) => {
    try {
      const firestoreData = await getFirestoreDoc("doc_justifications_history", "all");
      if (firestoreData && Array.isArray(firestoreData.items)) {
        try {
          fs.writeFileSync(DOC_JUSTIFICATIONS_HISTORY_FILE, JSON.stringify(firestoreData, null, 2), "utf-8");
        } catch (_) {}
        return res.json(firestoreData);
      }
      if (fs.existsSync(DOC_JUSTIFICATIONS_HISTORY_FILE)) {
        const data = fs.readFileSync(DOC_JUSTIFICATIONS_HISTORY_FILE, "utf-8");
        return res.json(JSON.parse(data));
      }
      return res.json({ items: [], lastUpdated: null });
    } catch (err) {
      console.error("Error reading doc justifications history:", err);
      if (fs.existsSync(DOC_JUSTIFICATIONS_HISTORY_FILE)) {
        try {
          return res.json(JSON.parse(fs.readFileSync(DOC_JUSTIFICATIONS_HISTORY_FILE, "utf-8")));
        } catch (_) {}
      }
      return res.status(500).json({ error: "Failed to read doc justifications history" });
    }
  });

  app.post("/api/doc-justifications/history", async (req, res) => {
    try {
      const items = Array.isArray(req.body?.items) ? req.body.items : (Array.isArray(req.body) ? req.body : []);
      const payload = {
        items,
        lastUpdated: new Date().toISOString(),
        count: items.length
      };
      await setFirestoreDoc("doc_justifications_history", "all", payload);
      try {
        fs.writeFileSync(DOC_JUSTIFICATIONS_HISTORY_FILE, JSON.stringify(payload, null, 2), "utf-8");
        safeSaveToSrcData("default_doc_history.json", JSON.stringify(payload, null, 2));
      } catch (_) {}
      return res.json({ success: true, count: items.length, lastUpdated: payload.lastUpdated });
    } catch (err) {
      console.error("Error writing doc justifications history:", err);
      return res.status(500).json({ error: "Failed to save doc justifications history" });
    }
  });

  // Google OAuth Routes
  app.get("/api/auth/google/url", (req, res) => {
    if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
      return res.status(500).json({ error: "Google OAuth credentials not configured" });
    }

    const currentAppUrl = getAppUrl(req);
    const client = new google.auth.OAuth2(
      GOOGLE_CLIENT_ID,
      GOOGLE_CLIENT_SECRET,
      `${currentAppUrl}/api/auth/google/callback`
    );

    const url = client.generateAuthUrl({
      access_type: "offline",
      scope: [
        "https://www.googleapis.com/auth/drive.file",
        "https://www.googleapis.com/auth/spreadsheets"
      ],
      prompt: "consent"
    });
    res.json({ url });
  });

  app.get("/api/auth/google/callback", async (req, res) => {
    const { code } = req.query;
    if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
      return res.status(500).send("Google OAuth not configured");
    }
    try {
      const currentAppUrl = getAppUrl(req);
      const client = new google.auth.OAuth2(
        GOOGLE_CLIENT_ID,
        GOOGLE_CLIENT_SECRET,
        `${currentAppUrl}/api/auth/google/callback`
      );

      const { tokens } = await client.getToken(code as string);
      
      // Store tokens in a secure cookie
      res.cookie("google_tokens", JSON.stringify(tokens), {
        httpOnly: true,
        secure: true,
        sameSite: "none",
        maxAge: 30 * 24 * 60 * 60 * 1000 // 30 days
      });

      res.send(`
        <html>
          <body>
            <script>
              if (window.opener) {
                window.opener.postMessage({ type: 'GOOGLE_AUTH_SUCCESS' }, '*');
                window.close();
              } else {
                window.location.href = '/';
              }
            </script>
            <p>Autenticação bem-sucedida! Esta janela fechará automaticamente.</p>
          </body>
        </html>
      `);
    } catch (error) {
      console.error("Error exchanging code for tokens:", error);
      res.status(500).send("Authentication failed");
    }
  });

  // Helper to get Google Auth Client from Bearer header, body, or cookie
  function getGoogleAuthClient(req: express.Request) {
    let accessToken: string | null = null;
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith("Bearer ")) {
      accessToken = authHeader.substring(7);
    } else if (req.body?.accessToken) {
      accessToken = req.body.accessToken;
    } else if (req.cookies?.google_tokens) {
      try {
        const parsed = JSON.parse(req.cookies.google_tokens);
        accessToken = parsed.access_token || parsed;
      } catch (_) {
        accessToken = req.cookies.google_tokens;
      }
    }

    if (!accessToken) {
      return null;
    }

    const client = new google.auth.OAuth2();
    client.setCredentials({ access_token: accessToken });
    return client;
  }

  app.get("/api/auth/google/status", (req, res) => {
    const authHeader = req.headers.authorization;
    const hasHeaderToken = !!(authHeader && authHeader.startsWith("Bearer ") && authHeader.length > 10);
    const hasCookie = !!req.cookies.google_tokens;
    res.json({ connected: hasHeaderToken || hasCookie });
  });

  app.post("/api/drive/upload", async (req, res) => {
    const client = getGoogleAuthClient(req);
    if (!client) {
      return res.status(401).json({ error: "Conta Google não conectada. Conecte sua conta primeiro." });
    }

    const { pdfBase64, fileName } = req.body;
    if (!pdfBase64) {
      return res.status(400).json({ error: "No PDF data provided" });
    }

    try {
      const drive = google.drive({ version: "v3", auth: client });
      
      // Convert base64 to buffer
      const base64Data = pdfBase64.includes("base64,") 
        ? pdfBase64.split("base64,")[1] 
        : pdfBase64;
      const buffer = Buffer.from(base64Data, "base64");
      const stream = Readable.from(buffer);

      const response = await drive.files.create({
        requestBody: {
          name: fileName || `Relatorio_Diretoria_${format(new Date(), "dd-MM-yyyy")}.pdf`,
          mimeType: "application/pdf",
        },
        media: {
          mimeType: "application/pdf",
          body: stream,
        },
        fields: 'id, webViewLink',
      });

      // Optional: Make file readable by anyone with the link
      try {
        await drive.permissions.create({
          fileId: response.data.id!,
          requestBody: {
            role: 'reader',
            type: 'anyone',
          },
        });
      } catch (permError) {
        console.warn("Could not set public permissions on Drive file:", permError);
      }

      const fileData = await drive.files.get({
        fileId: response.data.id!,
        fields: 'webViewLink',
      });

      res.json({ 
        success: true, 
        fileId: response.data.id, 
        webViewLink: fileData.data.webViewLink 
      });
    } catch (error: any) {
      console.error("Error uploading to Drive:", error);
      const message = error.response?.data?.error?.message || error.message || "Failed to upload to Google Drive";
      res.status(500).json({ error: message });
    }
  });

  // Google Sheets Justifications DB Endpoints
  app.get("/api/sheets/justifications-info", (req, res) => {
    try {
      let spreadsheetId = null;
      let spreadsheetUrl = null;
      let lastSyncedAt = null;

      if (fs.existsSync(SETTINGS_FILE)) {
        const settings = JSON.parse(fs.readFileSync(SETTINGS_FILE, "utf-8"));
        spreadsheetId = settings.googleSheetsJustificationsId || null;
        spreadsheetUrl = settings.googleSheetsJustificationsUrl || null;
        lastSyncedAt = settings.googleSheetsJustificationsLastSync || null;
      }

      res.json({
        connected: !!req.cookies.google_tokens || !!req.headers.authorization,
        spreadsheetId,
        spreadsheetUrl,
        lastSyncedAt
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/sheets/sync-justifications", async (req, res) => {
    const client = getGoogleAuthClient(req);
    if (!client) {
      return res.status(401).json({ error: "Conta Google não conectada. Conecte sua conta primeiro." });
    }

    try {
      const { items } = req.body;
      if (!Array.isArray(items)) {
        return res.status(400).json({ error: "Lista de justificativas é obrigatória" });
      }

      const sheets = google.sheets({ version: "v4", auth: client });
      const drive = google.drive({ version: "v3", auth: client });

      let spreadsheetId: string | null = null;
      let spreadsheetUrl: string | null = null;
      let settings: any = {};

      if (fs.existsSync(SETTINGS_FILE)) {
        try {
          settings = JSON.parse(fs.readFileSync(SETTINGS_FILE, "utf-8"));
          spreadsheetId = settings.googleSheetsJustificationsId || null;
        } catch (_) {}
      }

      // Check if existing spreadsheet is accessible
      if (spreadsheetId) {
        try {
          const check = await sheets.spreadsheets.get({ spreadsheetId });
          spreadsheetUrl = check.data.spreadsheetUrl || `https://docs.google.com/spreadsheets/d/${spreadsheetId}`;
        } catch (err) {
          console.warn("Existing spreadsheet inaccessible, creating a new one...", err);
          spreadsheetId = null;
        }
      }

      // Create new spreadsheet if needed
      if (!spreadsheetId) {
        const createRes = await sheets.spreadsheets.create({
          requestBody: {
            properties: {
              title: "LogiFleet - Banco de Dados de Justificativas e Licenças",
            },
            sheets: [
              {
                properties: {
                  title: "Justificativas",
                  gridProperties: {
                    frozenRowCount: 1,
                  }
                }
              }
            ]
          }
        });

        spreadsheetId = createRes.data.spreadsheetId!;
        spreadsheetUrl = createRes.data.spreadsheetUrl || `https://docs.google.com/spreadsheets/d/${spreadsheetId}`;

        try {
          await drive.permissions.create({
            fileId: spreadsheetId,
            requestBody: {
              role: 'reader',
              type: 'anyone',
            },
          });
        } catch (pErr) {
          console.warn("Could not set reader permission on sheet:", pErr);
        }

        settings.googleSheetsJustificationsId = spreadsheetId;
        settings.googleSheetsJustificationsUrl = spreadsheetUrl;
        fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2), "utf-8");
      }

      // Header row and records
      const nowStr = format(subHours(new Date(), 3), "dd/MM/yyyy HH:mm:ss");
      const headers = [
        "Item",
        "Placa",
        "Frota",
        "Operação",
        "Licença / Documento",
        "Status",
        "Motivo da Pendência",
        "Quem Autorizou",
        "Previsão / Condição",
        "Observações Detalhadas",
        "Data de Registro",
        "Última Sincronização"
      ];

      const rows = items.map((it: any, idx: number) => [
        it.itemNumber || idx + 1,
        (it.plate || "").toUpperCase(),
        it.fleet || "-",
        it.operation || "-",
        it.documentType || "-",
        it.status || "VENCIDO",
        it.reason || "Pendente de justificativa",
        it.authorizedBy || "-",
        it.actionForecast || "-",
        it.observations || "-",
        it.createdAt ? format(new Date(it.createdAt), "dd/MM/yyyy HH:mm") : "-",
        nowStr
      ]);

      const allValues = [headers, ...rows];

      // Clear previous rows up to row 3000 to keep clean
      try {
        await sheets.spreadsheets.values.clear({
          spreadsheetId,
          range: "Justificativas!A1:L3000"
        });
      } catch (_) {}

      // Write updated values
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: "Justificativas!A1",
        valueInputOption: "USER_ENTERED",
        requestBody: {
          values: allValues
        }
      });

      // Format headers and resize columns
      try {
        const sheetMeta = await sheets.spreadsheets.get({ spreadsheetId });
        const sheetObj = sheetMeta.data.sheets?.find(s => s.properties?.title === "Justificativas") || sheetMeta.data.sheets?.[0];
        const targetSheetId = sheetObj?.properties?.sheetId || 0;

        await sheets.spreadsheets.batchUpdate({
          spreadsheetId,
          requestBody: {
            requests: [
              {
                updateSheetProperties: {
                  properties: {
                    sheetId: targetSheetId,
                    gridProperties: {
                      frozenRowCount: 1
                    }
                  },
                  fields: "gridProperties.frozenRowCount"
                }
              },
              {
                repeatCell: {
                  range: {
                    sheetId: targetSheetId,
                    startRowIndex: 0,
                    endRowIndex: 1,
                    startColumnIndex: 0,
                    endColumnIndex: 12
                  },
                  cell: {
                    userEnteredFormat: {
                      backgroundColor: { red: 0.12, green: 0.28, blue: 0.58 },
                      textFormat: { bold: true, foregroundColor: { red: 1, green: 1, blue: 1 }, fontSize: 10 },
                      horizontalAlignment: "CENTER",
                      verticalAlignment: "MIDDLE"
                    }
                  },
                  fields: "userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment)"
                }
              },
              {
                autoResizeDimensions: {
                  dimensions: {
                    sheetId: targetSheetId,
                    dimension: "COLUMNS",
                    startIndex: 0,
                    endIndex: 12
                  }
                }
              }
            ]
          }
        });
      } catch (styleErr) {
        console.warn("Could not apply formatting to sheet:", styleErr);
      }

      settings.googleSheetsJustificationsLastSync = new Date().toISOString();
      settings.googleSheetsJustificationsUrl = spreadsheetUrl;
      fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2), "utf-8");

      res.json({
        success: true,
        spreadsheetId,
        spreadsheetUrl,
        count: items.length,
        syncedAt: nowStr
      });
    } catch (error: any) {
      console.error("Error syncing to Google Sheets:", error);
      const message = error.response?.data?.error?.message || error.message || "Failed to sync to Google Sheets";
      res.status(500).json({ error: message });
    }
  });

  app.post("/api/send-report", async (req, res) => {
    const { pdfBase64, fileName, recipients, driveLink } = req.body;
    
    if (!sendgridApiKey || !sendgridFromEmail) {
      return res.status(500).json({ error: "SendGrid not configured" });
    }

    try {
      const base64Data = pdfBase64.includes("base64,") 
        ? pdfBase64.split("base64,")[1] 
        : pdfBase64;

      const reportDate = subHours(new Date(), 3);

      const msg = {
        to: recipients, // Can be array or string
        from: sendgridFromEmail,
        subject: `Relatório de Frota - ${format(reportDate, "dd/MM/yyyy")}`,
        text: `Segue em anexo o relatório de frota atualizado.${driveLink ? `\n\nLink do Google Drive: ${driveLink}` : ''}`,
        html: `
          <div style="font-family: sans-serif; color: #333;">
            <h2 style="color: #1e40af;">Relatório de Frota Atualizado</h2>
            <p>Olá,</p>
            <p>Segue em anexo o relatório executivo de frota e conformidade gerado em <strong>${format(reportDate, "dd/MM/yyyy HH:mm")}</strong>.</p>
            ${driveLink ? `<p>Você também pode visualizar o arquivo diretamente no Google Drive: <a href="${driveLink}">${driveLink}</a></p>` : ''}
            <p style="margin-top: 20px; font-size: 12px; color: #666;">Este é um e-mail automático enviado pelo sistema LogiFleet.</p>
          </div>
        `,
        attachments: [
          {
            content: base64Data,
            filename: fileName || "Relatorio_Frota.pdf",
            type: "application/pdf",
            disposition: "attachment",
          },
        ],
      };

      await sgMail.send(msg);
      res.json({ success: true });
    } catch (error: any) {
      console.error("Error sending email via SendGrid:", error);
      let message = error.message || "Failed to send email";
      
      if (error.response) {
        const body = error.response.body;
        console.error("SendGrid Error Body:", JSON.stringify(body, null, 2));
        
        if (error.code === 403) {
          message = "Erro 403 (Forbidden): O e-mail de remetente não está verificado no SendGrid ou a API Key não tem permissão de envio. Verifique o 'Sender Authentication' no painel do SendGrid.";
        } else if (body && body.errors) {
          message = body.errors.map((e: any) => e.message).join(", ");
        }
      }
      
      res.status(500).json({ error: message });
    }
  });

  // Helper to find value by multiple possible keys (case-insensitive and accent-insensitive)
  const getVal = (row: any, keys: string[]) => {
    const rowKeys = Object.keys(row);
    const normalizedSearchKeys = keys.map(k => k.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim());
    
    // 1. Exact matches first
    for (const search of normalizedSearchKeys) {
      for (const actualKey of rowKeys) {
        const normalizedActual = actualKey.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
        if (normalizedActual === search) {
          const val = row[actualKey];
          if (val !== undefined && val !== null && val.toString().trim() !== "") return val.toString().trim();
        }
      }
    }
    
    // 2. Partial matches (only for longer search keys)
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

  // API Routes
  app.get("/api/fleet", async (req, res) => {
    const debugInfo: any = {};
    try {
      const fetchAndNormalize = async (name: string, url: string) => {
        console.log(`Fetching data for ${name} from ${url}`);
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000);
        
        try {
          const response = await fetch(url, {
            signal: controller.signal,
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            }
          });
          clearTimeout(timeoutId);
          
          if (!response.ok) {
            console.error(`Failed to fetch ${name}: ${response.status} ${response.statusText}`);
            debugInfo[name] = `Error: ${response.status} ${response.statusText}`;
            return [];
          }
          
          console.log(`${name}: Fetch successful, status ${response.status}`);
          
          let csvText = await response.text();
          csvText = csvText.trim();
          
          if (csvText.includes("<!DOCTYPE html>") || csvText.includes("<html")) {
            console.error(`Error: ${name} returned HTML instead of CSV. Check the sheet name in the URL.`);
            debugInfo[name] = "Error: Sheet not found or access denied (returned HTML)";
            return [];
          }

          if (csvText.length < 50) {
            console.warn(`Warning: ${name} returned very short CSV (${csvText.length} bytes): "${csvText}"`);
          }

          if (name.includes("CITROSUCO")) {
            console.log(`[DEBUG] ${name} CSV Length: ${csvText.length}`);
            console.log(`[DEBUG] ${name} CSV First 500 chars: ${csvText.substring(0, 500)}`);
          }

          // Parse all rows first to find the header row and validity row
          const rawParsed = Papa.parse(csvText, { 
            skipEmptyLines: 'greedy',
            transform: (val) => val.trim()
          });
          const rows = rawParsed.data as string[][];
          
          if (rows.length < 1) {
            console.error(`Error: No rows found in ${name}`);
            return [];
          }

          if (name === "DOC_SISTEMA") {
            console.log(`[DEBUG] DOC_SISTEMA First 10 rows:`, JSON.stringify(rows.slice(0, 10)));
          }

          // Find header row: look for the row with the most matches for common headers
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

          console.log(`${name}: Found header at index ${headerRowIndex} with ${maxMatches} matches`);
          
          // For DOC_SISTEMA ETL, we expect headers on the first few rows. 
          // If maxMatches is low, we might be missing it, but let's trust the detection.
          let effectiveHeaderRowIndex = headerRowIndex;
          
          const validityRow = effectiveHeaderRowIndex > 0 ? rows[effectiveHeaderRowIndex - 1] : [];
          const dataRows = rows.slice(effectiveHeaderRowIndex + 1);

          const rawHeaders = rows[effectiveHeaderRowIndex].map(h => h.trim());
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

          console.log(`${name}: Processed ${parsedData.length} data rows`);
          if (parsedData.length > 0) {
            console.log(`${name} Sample Row:`, JSON.stringify(parsedData[0]).substring(0, 200));
          }

          const stats = {
            totalRows: parsedData.length,
            extracted: 0,
            filteredByMultiplePlates: 0,
            filteredByInvalidTerm: 0,
            filteredByNoIdentifier: 0,
            filteredByPedidoPattern: 0,
            rejectedFleets: [] as string[]
          };

          const result = parsedData.map((row: any) => {
            // Aggressive extraction: look for anything that looks like a plate or fleet in any column
            let plate = "";
            let fleet = "";

            // 1. Try known headers first
            const plateKeys = ["Placa", "placa", "PLATE", "VEICULO", "EQUIPAMENTO", "IDENTIFICACAO", "PLACA/VEICULO", "PLACA CAVALO", "CAVALO"];
            const fleetKeys = ["Frota", "FROTA", "PREFIXO", "Nº FROTA", "NRO FROTA", "FROTA/PREFIXO", "PREFIXO/FROTA", "fleet", "CODIGO", "NUMERO"];

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
              // Order IDs/Pedidos in this system are typically 5-7 digits and start with 38 or 32
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
                if (stats.rejectedFleets.length < 50) stats.rejectedFleets.push(result);
                return "";
              }
              const currentYear = new Date().getFullYear();
              const possibleYears = [currentYear - 2, currentYear - 1, currentYear, currentYear + 1, currentYear + 2].map(String);
              if (possibleYears.includes(result) && cleaned.length === 4) return "";
              return result;
            };

            const rawPlateVal = getVal(row, plateKeys).toString().trim();
            const rawFleetVal = getVal(row, fleetKeys).toString().trim();
            const obsVal = getVal(row, ["Observações", "OBSERVACOES", "OBS", "Observação", "Descrição", "DESCRICAO", "DESC"]).toString().toUpperCase();
            
            const cleanObsForFleet = (s: string) => {
              return s
                .replace(/PEDIDO\s*\d+/gi, "")
                .replace(/\d{1,2}\/\d{1,2}\/\d{2,4}/g, "")
                .replace(/\d{1,2}\.\d{1,2}\.\d{2,4}/g, "")
                .replace(/\d{1,2}-\d{1,2}-\d{2,4}/g, "");
            };

            if (countPlates(obsVal) > 1) {
              plate = "";
              fleet = "";
              stats.filteredByMultiplePlates++;
            } else {
              plate = extractPlate(rawPlateVal);
              fleet = rawFleetVal.replace(/^0+/, "");
              if (isLikelyPedido(fleet)) {
                fleet = "";
                stats.filteredByPedidoPattern++;
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
                      // Avoid treating installments like "11/34" as fleets
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
            const docVal = getVal(row, ["Documento", "DOC", "Doc", "Nº Documento"]).toString().trim();
            const pedMatch = obsVal.match(/PEDIDO\s*[:\-#]?\s*([0-9]{4,8})/i) || docVal.match(/^([0-9]{4,8})$/);
            const rowPedido = pedMatch ? pedMatch[1] : (getVal(row, ["Pedido", "PEDIDO"]).toString().trim() || (/^\d{4,8}$/.test(docVal) ? docVal : ""));
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

            const lastUpdate = getVal(row, ["Data Atualização", "updated_at", "Last Update", "Data"]) || new Date().toISOString();
            let docs: any[] = [];

            if (name.startsWith("DOC_SISTEMA")) {
              const pagamento = getVal(row, ["Pagamento", "PAGAMENTO", "Pag", "Data Pagamento", "DT PAGAMENTO", "Dt Pag", "Data Pgto", "Data Pag", "Pago em", "Baixa", "Data Baixa", "DT BAIXA", "Pagto", "PGTO", "Dt Pgto"]);
              const vencimento = getVal(row, ["Vencimento", "VENCIMENTO", "Venc", "Prox Venc", "Data Vencimento", "DT VENCIMENTO", "Dt Venc"]);
              const rawDesc = getVal(row, ["Descrição", "DESCRICAO", "Desc", "Documento", "_Tipo Documento"]) || "Documento";
              let descricao = String(rawDesc).trim();
              if (descricao.toUpperCase().includes("SERVIÇO DE MONITORAMENTO") || descricao.toUpperCase().includes("SERVICO DE MONITORAMENTO")) {
                descricao = descricao.replace(/SERVIÇO DE MONITORAMENTO/gi, "SERV. MONITORAMENTO")
                                     .replace(/SERVICO DE MONITORAMENTO/gi, "SERV. MONITORAMENTO");
              }
              row["Descrição"] = descricao;
              
              const isPaid = (s: string) => {
                if (!s) return false;
                const val = s.toString().trim().toUpperCase();
                return !(val === "" || val === "-" || val.includes("DEFINIR") || val === "NÃO" || val === "NAO");
              };

              const statusColStr = getVal(row, ["Status", "STATUS", "Situação", "SITUACAO", "Situacao Titulo", "Status Pagamento", "Situação do Pagamento"]).toString().toUpperCase();
              const isStatusPaid = statusColStr.includes("PAGO") || statusColStr.includes("BAIXADO") || statusColStr.includes("QUITADO");
              const hasPaidValue = isPaid(pagamento) || (getVal(row, ["Valor Pago", "VALOR PAGO", "Pago", "Vlr Pago"]).toString().trim() !== "");
              const paid = hasPaidValue || isStatusPaid;

              const isDesp = isDespachanteType(descricao) || isDespachanteType(getVal(row, ["Documento"]));

              let status: 'pagos' | 'vencido' | 'critico' | 'atencao' | 'ok' = 'ok';
              let daysRemaining = 999;
              let classification: any = { formattedDate: "", status: "ok", daysRemaining: 999 };

              if (isDesp) {
                // Despachante é serviço/custo operacional dinâmico, nunca deve ser puxado como vencido documentalmente
                status = paid ? 'pagos' : 'ok';
                daysRemaining = 999;
                classification = {
                  formattedDate: formatBRDate(paid ? (pagamento || vencimento) : vencimento),
                  status,
                  daysRemaining
                };
              } else {
                const refDate = (paid && pagamento) ? pagamento : vencimento;
                classification = classifyDocument(refDate);
                status = paid ? 'pagos' : classification.status;
                daysRemaining = paid ? 999 : classification.daysRemaining;
              }

              docs.push({
                type: descricao,
                expiryDate: classification.formattedDate || (paid ? pagamento : vencimento),
                rawExpiryDate: paid ? pagamento : vencimento,
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

              const docKeys = Object.keys(row).filter(k => {
                if (isFinancialKey(k)) return false;
                const uk = k.toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
                if (uk.includes("LIBERACAO")) return false;
                return uk.includes("SEGURO") || uk.includes("TACO") || uk.includes("INSP") || uk.includes("VISTORIA") || uk.includes("CNH") || uk.includes("ANTT") || uk.includes("DER") || uk.includes("AGR") || uk.includes("AUTORIZACAO") || uk.includes("REGISTRO") || uk.includes("CADASTRAL") || uk.includes("CRV") || uk.includes("CRC") || uk.includes("CRLV") || uk.includes("CIV") || uk.includes("CIPP") || uk.includes("OPP") || uk.includes("LAUDO") || uk.includes("LICENCA") || uk.includes("LICENÇA") || uk.includes("ANEXO") || uk.includes("FRET") || uk.includes("EMPR");
              });

              docs = docKeys.map(key => {
                let val = row[key];
                if (val && typeof val === "string" && (val.includes("R$") || val.includes("r$"))) {
                  val = "-";
                }
                const classification = classifyDocument(val);
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
            const overallStatus = docs.length > 0 
              ? docs.reduce((prev, curr) => (statusPriority[curr.status] ?? 3) < (statusPriority[prev] ?? 3) ? curr.status : prev, docs[0].status as any)
              : 'ok';

            let driver = getVal(row, ["Motorista", "driver", "MOTORISTA"]);
            if (plate === "EFO1936" || fleet === "733") {
              if (driver === "5448") driver = "Jean";
            }

            return {
              id: `${name}-${plate || 'NOPLATE'}-${fleet || 'NOFLEET'}-${Math.random().toString(36).substr(2, 5)}`,
              fleet, plate, driver,
              operation: name,
              client: name.split(" ")[0],
              cityBase: getVal(row, ["Cidade/Base", "city", "CIDADE", "Base"]),
              vehicleType: getVal(row, ["Tipo de veículo", "type", "TIPO"]),
              status: getVal(row, ["Status", "STATUS", "Situação"]) || "Ativo",
              hasBathroom: getVal(row, ["Banheiro", "BANHEIRO", "WC"]),
              origin: name,
              source: name === "DOC_SISTEMA" ? "DOCUMENTACAO" : "LICENCAS",
              lastUpdate,
              lat: parseFloat(getVal(row, ["Latitude", "lat", "LAT"]) || "0"),
              lng: parseFloat(getVal(row, ["Longitude", "lng", "LNG"]) || "0"),
              documents: docs,
              overallStatus,
              extraData: row
            };
          }).filter(v => {
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
            const hasIdentifier = (p.length >= 7) || (f.length >= 2);
            if (p === "CUD3486" || f === "5434" || p === "CUD2903" || f === "5409") return true;
            
            const rejected = (!p.startsWith("PED.") && isInvalid(p)) || isInvalid(f) || p === "RESERVA" || f === "RESERVA" || f === "6372" || p === "-" || p === "–" || p === "NOPLATE" || (!p && !f);
            if (rejected) {
                if (isInvalid(p) || isInvalid(f)) stats.filteredByInvalidTerm++;
                else if (!p && !f) stats.filteredByNoIdentifier++;
                return false;
            }
            stats.extracted++;
            return true;
          });

          // Safely store debug information
          debugInfo[name] = {
            rowCount: parsedData.length,
            headers: headers,
            validityRow: validityRow,
            sample: parsedData.length > 0 ? parsedData[0] : null,
            stats: stats
          };
          
          return result;
        } catch (e) {
          clearTimeout(timeoutId);
          console.error(`Error processing ${name}:`, e);
          debugInfo[name] = `Exception: ${e instanceof Error ? e.message : String(e)}`;
          return [];
        }
      };

      const allData = await Promise.all([
        fetchAndNormalize("BAYER MT", SHEET_URLS["BAYER MT"]),
        fetchAndNormalize("BAYER GO", SHEET_URLS["BAYER GO"]),
        fetchAndNormalize("CITROSUCO - UBERLANDIA", SHEET_URLS["CITROSUCO - UBERLANDIA"]),
        fetchAndNormalize("CITROSUCO - SÃO PAULO", SHEET_URLS["CITROSUCO - SÃO PAULO"]),
        fetchAndNormalize("DOC_SISTEMA", SHEET_URLS["DOC_SISTEMA"]),
      ]);

      allData.forEach((data, i) => {
        const names = ["BAYER MT", "BAYER GO", "CITROSUCO - UBERLANDIA", "CITROSUCO - SÃO PAULO", "DOC_SISTEMA"];
        console.log(`${names[i]}: Found ${data.length} valid vehicles`);
      });

      const flatData = allData.flat();
      console.log(`Total vehicles before consolidation: ${flatData.length}`);

      // Dynamic bidirectional plate <-> fleet resolution across all vehicles
      const isPlateFormat = (s: string) => /^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/.test(s) || /^[A-Z]{3}[0-9]{4}$/.test(s);
      const isLikelyPedido = (s: string) => /^(38|32)\d{3,5}$/.test(s.toString().trim().replace(/^0+/, ""));

      const plateFleetVotes = new Map<string, Map<string, number>>();
      const fleetPlateVotes = new Map<string, Map<string, number>>();

      flatData.forEach(v => {
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
      flatData.forEach(v => {
        const p = (v.plate || "").toUpperCase().trim();
        const f = (v.fleet || "").toString().trim().replace(/^0+/, "");

        if (isPlateFormat(p) && plateToFleetMap.has(p)) {
          v.fleet = plateToFleetMap.get(p)!;
        } else if (f && (!p || !isPlateFormat(p)) && fleetToPlateMap.has(f)) {
          v.plate = fleetToPlateMap.get(f)!;
        }
      });

      // Stage 1: Consolidation by Fleet and Plate (Scoped by Source)
      const consolidatedMap = new Map();
      
      flatData.forEach(v => {
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
          // Merge logic: keep the one with more documents or more recent update
          const existingScore = (existing.documents?.length || 0) + (existing.driver ? 1 : 0);
          const currentScore = (v.documents?.length || 0) + (v.driver ? 1 : 0);
          
          if (currentScore >= existingScore) {
            // Merge documents if they are different
            const docTypes = new Set(existing.documents.map((d: any) => d.type));
            v.documents.forEach((d: any) => {
              // For DOC_SISTEMA, we might have multiple records for the same type (e.g. multiple IPVAs)
              // So we should probably check the date too
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
      console.log(`Final consolidated fleet count: ${result.length}`);
      
      // If result is empty, return debug info to help diagnose
      if (result.length === 0) {
        return res.json({ debug: debugInfo, message: "No data consolidated. Check headers and plate values." });
      }

      res.json(result);
    } catch (error) {
      console.error("Consolidation Error:", error);
      res.status(500).json({ error: "Failed to consolidate fleet data", debug: debugInfo });
    }
  });

  // Vite middleware for development (must be mounted BEFORE app.listen)
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: false,
      },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  console.log(`Attempting to start server on port ${PORT}...`);
  const server = app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server is now listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch(err => {
  console.error("CRITICAL ERROR: Failed to start server:", err);
  process.exit(1);
});
