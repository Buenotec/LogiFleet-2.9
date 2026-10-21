import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { 
  getFirestore, 
  doc, 
  getDocFromServer, 
  setDoc as originalSetDoc, 
  type SetOptions,
  disableNetwork,
  setLogLevel
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';

// Silence Firestore internal logger immediately so backoff/retry errors never output to console.error
try {
  setLogLevel('silent');
} catch (_) {}

const app = initializeApp(firebaseConfig);
export const db = (firebaseConfig as any).firestoreDatabaseId ? getFirestore(app, (firebaseConfig as any).firestoreDatabaseId) : getFirestore(app);
export const auth = getAuth(app);

const QUOTA_STORAGE_KEY = 'logifleet_firestore_quota_status_v1';

let firestoreQuotaExceeded = false;
let networkDisabled = false;

export function isFirestoreQuotaExceeded(): boolean {
  return firestoreQuotaExceeded;
}

export function setFirestoreQuotaExceeded(val: boolean = true) {
  if (val) {
    markQuotaExceeded('Manual trigger or event');
  } else {
    firestoreQuotaExceeded = false;
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        localStorage.removeItem(QUOTA_STORAGE_KEY);
      }
    } catch (_) {}
  }
}

export function markQuotaExceeded(reason?: string) {
  firestoreQuotaExceeded = true;
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const today = new Date().toISOString().slice(0, 10);
      localStorage.setItem(QUOTA_STORAGE_KEY, JSON.stringify({
        exceeded: true,
        date: today,
        timestamp: Date.now(),
        reason: reason || 'Free daily write units per project exceeded'
      }));
    }
  } catch (_) {}

  if (!networkDisabled && db) {
    networkDisabled = true;
    try {
      disableNetwork(db).catch(() => {});
    } catch (_) {}
  }
}

// Global browser window handler to catch any async Firestore quota rejections
if (typeof window !== 'undefined') {
  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason;
    const msg = (reason && (reason.message || String(reason))) || '';
    if (
      msg.includes('resource-exhausted') ||
      msg.includes('Quota limit exceeded') ||
      msg.includes('Free daily write units') ||
      (reason && reason.code === 'resource-exhausted')
    ) {
      event.preventDefault();
      markQuotaExceeded(msg);
    }
  });
}

export async function safeSetDoc(docRef: any, data: any, options?: SetOptions): Promise<boolean> {
  // If quota is reached or offline, do not enqueue mutations to avoid backoff loops
  if (firestoreQuotaExceeded) {
    return false;
  }
  try {
    if (options) {
      await originalSetDoc(docRef, data, options);
    } else {
      await originalSetDoc(docRef, data);
    }
    return true;
  } catch (err: any) {
    const errMsg = err instanceof Error ? err.message : String(err);
    if (
      err?.code === 'resource-exhausted' || 
      errMsg.includes('Quota limit exceeded') || 
      errMsg.includes('resource-exhausted') ||
      errMsg.includes('Free daily write units')
    ) {
      markQuotaExceeded(errMsg);
      return false;
    }
    return false;
  }
}

// Re-export safeSetDoc as setDoc to automatically protect all setDoc usages
export { safeSetDoc as setDoc };

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errMsg = error instanceof Error ? error.message : String(error);
  if (
    errMsg.includes('resource-exhausted') || 
    errMsg.includes('Quota limit exceeded') ||
    errMsg.includes('Free daily write units') ||
    (error as any)?.code === 'resource-exhausted'
  ) {
    markQuotaExceeded(errMsg);
    return {
      error: errMsg,
      operationType,
      path,
      authInfo: {}
    };
  }

  const errInfo: FirestoreErrorInfo = {
    error: errMsg,
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  };
  return errInfo;
}

async function testConnection() {
  if (firestoreQuotaExceeded) return;
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error: any) {
    const errMsg = error instanceof Error ? error.message : String(error);
    if (
      error?.code === 'resource-exhausted' ||
      errMsg.includes('resource-exhausted') || 
      errMsg.includes('Quota limit exceeded') ||
      errMsg.includes('Free daily write units')
    ) {
      markQuotaExceeded(errMsg);
    }
  }
}
testConnection();
