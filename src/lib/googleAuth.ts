import { 
  signInWithPopup, 
  GoogleAuthProvider, 
  onAuthStateChanged, 
  User 
} from 'firebase/auth';
import { auth } from './firebase';
import firebaseConfig from '../../firebase-applet-config.json';

const provider = new GoogleAuthProvider();
provider.addScope('https://www.googleapis.com/auth/drive.file');
provider.addScope('https://www.googleapis.com/auth/spreadsheets');
provider.setCustomParameters({
  prompt: 'select_account'
});

let inMemoryToken: string | null = null;
const TOKEN_STORAGE_KEY = 'logifleet_google_access_token';

export const getStoredGoogleToken = (): string | null => {
  if (inMemoryToken) return inMemoryToken;
  try {
    const stored = sessionStorage.getItem(TOKEN_STORAGE_KEY);
    if (stored) {
      inMemoryToken = stored;
      return stored;
    }
  } catch (_) {}
  return null;
};

export const setStoredGoogleToken = (token: string | null) => {
  inMemoryToken = token;
  try {
    if (token) {
      sessionStorage.setItem(TOKEN_STORAGE_KEY, token);
    } else {
      sessionStorage.removeItem(TOKEN_STORAGE_KEY);
    }
  } catch (_) {}
};

export const isGoogleSignedIn = (): boolean => {
  return !!getStoredGoogleToken() || !!auth.currentUser;
};

// Client-side authentication with Google Workspace using Firebase Auth popup
export const signInWithGoogleWorkspace = async (): Promise<{ token: string; user?: User }> => {
  // First check if token is already stored
  const existingToken = getStoredGoogleToken();
  if (existingToken) {
    return { token: existingToken, user: auth.currentUser || undefined };
  }

  // 1. Try Firebase Auth popup
  try {
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (credential?.accessToken) {
      setStoredGoogleToken(credential.accessToken);
      return { token: credential.accessToken, user: result.user };
    }
  } catch (popupErr: any) {
    console.warn("Firebase signInWithPopup failed or was blocked, trying GSI token client:", popupErr);
  }

  // 2. Fallback to Google Identity Services (GSI) Token Client if available
  const clientId = firebaseConfig.oAuthClientId;
  if (typeof window !== 'undefined' && (window as any).google?.accounts?.oauth2 && clientId) {
    return new Promise((resolve, reject) => {
      try {
        const tokenClient = (window as any).google.accounts.oauth2.initTokenClient({
          client_id: clientId,
          scope: 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/spreadsheets',
          callback: (tokenResponse: any) => {
            if (tokenResponse?.error) {
              reject(new Error(tokenResponse.error_description || tokenResponse.error));
              return;
            }
            if (tokenResponse?.access_token) {
              setStoredGoogleToken(tokenResponse.access_token);
              resolve({ token: tokenResponse.access_token });
            } else {
              reject(new Error("Não foi possível obter o token de autorização."));
            }
          },
          error_callback: (err: any) => {
            reject(new Error(err?.message || "Erro no fluxo de login do Google."));
          }
        });
        tokenClient.requestAccessToken({ prompt: 'consent' });
      } catch (gsiErr) {
        reject(gsiErr);
      }
    });
  }

  throw new Error("Não foi possível autenticar com o Google. Por favor, permita popups no navegador.");
};

export const logoutGoogleWorkspace = async () => {
  try {
    await auth.signOut();
  } catch (_) {}
  setStoredGoogleToken(null);
};
