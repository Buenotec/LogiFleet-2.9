import rawLic from './default_license_justifications.json';
import rawDoc from './default_doc_justifications.json';
import rawLicHist from './default_license_history.json';
import rawDocHist from './default_doc_history.json';

export const defaultLicenseJustifications: any[] = Array.isArray(rawLic?.items) ? rawLic.items : [];
export const defaultDocJustifications: any[] = Array.isArray(rawDoc?.items) ? rawDoc.items : [];
export const defaultLicenseHistory: any[] = Array.isArray(rawLicHist?.items) ? rawLicHist.items : [];
export const defaultDocHistory: any[] = Array.isArray(rawDocHist?.items) ? rawDocHist.items : [];
