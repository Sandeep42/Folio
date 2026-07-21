/**
 * Native file picker bridge (Android only).
 * Uses custom FilePickerModule instead of react-native-document-picker.
 */

import { NativeModules, Platform } from 'react-native';

const { FolioFilePicker } = NativeModules;

export async function pickPdf(): Promise<{ canceled: boolean; uri?: string }> {
  if (Platform.OS !== 'android' || !FolioFilePicker) {
    return { canceled: true };
  }
  try {
    const uris: string[] = await FolioFilePicker.pickPdf();
    if (!uris.length) return { canceled: true };
    return { canceled: false, uri: uris[0] };
  } catch {
    return { canceled: true };
  }
}

export async function pickCsvs(): Promise<{ canceled: boolean; uris?: string[] }> {
  if (Platform.OS !== 'android' || !FolioFilePicker) {
    return { canceled: true };
  }
  try {
    const uris: string[] = await FolioFilePicker.pickCsv(true);
    if (!uris.length) return { canceled: true };
    return { canceled: false, uris };
  } catch {
    return { canceled: true };
  }
}

export async function pickCsv(): Promise<{ canceled: boolean; uri?: string }> {
  if (Platform.OS !== 'android' || !FolioFilePicker) {
    return { canceled: true };
  }
  try {
    const uris: string[] = await FolioFilePicker.pickCsv(false);
    if (!uris.length) return { canceled: true };
    return { canceled: false, uri: uris[0] };
  } catch {
    return { canceled: true };
  }
}

export async function readFileAsBase64(uri: string): Promise<ArrayBuffer> {
  const b64: string = await FolioFilePicker.readFileAsBase64(uri);
  const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
  return bytes.buffer;
}

export async function readFileAsText(uri: string): Promise<string> {
  return await FolioFilePicker.readFileAsText(uri);
}

export async function readPdfAsText(uri: string, password?: string): Promise<string> {
  return await FolioFilePicker.readPdfAsText(uri, password || '');
}
