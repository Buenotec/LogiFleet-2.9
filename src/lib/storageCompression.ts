import { gzip, ungzip } from "pako";
import type { JustificationHistoryItem } from "../types";

export const STORAGE_KEY_LICENSE_HISTORY = "uni_license_justifications_history";
export const STORAGE_KEY_DOC_HISTORY = "uni_doc_justifications_history";

const GZIP_PREFIX = "__gz:";

/**
 * Converts a Uint8Array into a standard Base64 string in a browser-safe chunked manner.
 */
function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = "";
  const len = bytes.byteLength;
  const chunkSize = 8192;
  for (let i = 0; i < len; i += chunkSize) {
    const chunk = bytes.subarray(i, Math.min(i + chunkSize, len));
    binary += String.fromCharCode.apply(null, Array.from(chunk));
  }
  return btoa(binary);
}

/**
 * Converts a standard Base64 string back into a Uint8Array.
 */
function base64ToUint8Array(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

/**
 * Strips superfluous empty string fields or undefined values from history items
 * to produce the leanest possible JSON payload before compression.
 */
function sanitizeHistoryItem(item: any): any {
  if (!item || typeof item !== "object") return item;
  const cleaned: Record<string, any> = {};
  for (const [key, value] of Object.entries(item)) {
    if (value !== undefined && value !== null) {
      cleaned[key] = value;
    }
  }
  return cleaned;
}

/**
 * Compresses an array of history items using minified JSON + Gzip with Base64 encoding.
 * Returns the compressed string prefixed with '__gz:', or standard minified JSON if
 * compression is not advantageous (e.g. tiny lists).
 */
export function compressHistoryData(items: any[]): string {
  if (!items || !Array.isArray(items)) {
    return "[]";
  }

  try {
    const sanitized = items.map(sanitizeHistoryItem);
    const minifiedJson = JSON.stringify(sanitized);

    // For very small strings (< 150 bytes), overhead of base64 + gzip header may not save space
    if (minifiedJson.length < 150) {
      return minifiedJson;
    }

    const compressedBytes = gzip(minifiedJson, { level: 6 });
    const base64 = uint8ArrayToBase64(compressedBytes);
    const compressedResult = `${GZIP_PREFIX}${base64}`;

    // Only use compressed version if it effectively reduces byte size
    if (compressedResult.length < minifiedJson.length) {
      return compressedResult;
    }

    return minifiedJson;
  } catch (err) {
    console.warn("Storage compression failed, falling back to minified JSON:", err);
    try {
      return JSON.stringify(items);
    } catch {
      return "[]";
    }
  }
}

/**
 * Decompresses and parses stored history data.
 * Fully backwards-compatible: automatically detects whether the stored string
 * is gzipped ('__gz:...'), standard JSON ('[...]'), or empty.
 */
export function decompressHistoryData<T = JustificationHistoryItem>(
  storedValue: string | null | undefined,
  defaultItems: T[] = []
): T[] {
  if (!storedValue || typeof storedValue !== "string") {
    return defaultItems;
  }

  const trimmed = storedValue.trim();
  if (!trimmed || trimmed === "[]") {
    return defaultItems;
  }

  // 1. Gzip-compressed payload
  if (trimmed.startsWith(GZIP_PREFIX)) {
    try {
      const base64 = trimmed.slice(GZIP_PREFIX.length);
      const uint8 = base64ToUint8Array(base64);
      const decompressedBytes = ungzip(uint8);
      const decompressedStr = new TextDecoder().decode(decompressedBytes);
      const parsed = JSON.parse(decompressedStr);
      if (Array.isArray(parsed)) {
        return parsed.length > 0 ? parsed : defaultItems;
      }
    } catch (err) {
      console.warn("Failed to decompress gzipped history data, trying direct JSON parse:", err);
    }
  }

  // 2. Direct or legacy JSON payload
  try {
    const parsed = JSON.parse(trimmed);
    if (Array.isArray(parsed)) {
      return parsed.length > 0 ? parsed : defaultItems;
    }
  } catch (err) {
    console.error("Failed to parse history data from localStorage:", err);
  }

  return defaultItems;
}

/**
 * Saves history to localStorage using compression to optimize browser quota.
 */
export function saveCompressedHistory(key: string, items: any[]): void {
  try {
    if (typeof window === "undefined" || !window.localStorage) return;
    const compressed = compressHistoryData(items);
    window.localStorage.setItem(key, compressed);
  } catch (err) {
    console.error(`Error saving compressed history for key ${key}:`, err);
  }
}

/**
 * Loads and decompresses history from localStorage with fallback to default items.
 */
export function loadCompressedHistory<T = JustificationHistoryItem>(
  key: string,
  defaultItems: T[] = []
): T[] {
  try {
    if (typeof window === "undefined" || !window.localStorage) return defaultItems;
    const stored = window.localStorage.getItem(key);
    return decompressHistoryData<T>(stored, defaultItems);
  } catch (err) {
    console.error(`Error loading compressed history for key ${key}:`, err);
    return defaultItems;
  }
}

/**
 * Specialized helpers for License Justifications History
 */
export function saveLicenseHistoryToStorage(items: JustificationHistoryItem[]): void {
  saveCompressedHistory(STORAGE_KEY_LICENSE_HISTORY, items);
}

export function loadLicenseHistoryFromStorage(
  defaultItems: JustificationHistoryItem[] = []
): JustificationHistoryItem[] {
  return loadCompressedHistory<JustificationHistoryItem>(
    STORAGE_KEY_LICENSE_HISTORY,
    defaultItems
  );
}

/**
 * Specialized helpers for Doc Justifications History
 */
export function saveDocHistoryToStorage(items: JustificationHistoryItem[]): void {
  saveCompressedHistory(STORAGE_KEY_DOC_HISTORY, items);
}

export function loadDocHistoryFromStorage(
  defaultItems: JustificationHistoryItem[] = []
): JustificationHistoryItem[] {
  return loadCompressedHistory<JustificationHistoryItem>(
    STORAGE_KEY_DOC_HISTORY,
    defaultItems
  );
}
