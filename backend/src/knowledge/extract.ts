import type { TextSegment } from './chunking.js';

export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

export const SUPPORTED_MIME_TYPES = ['application/pdf', 'text/plain', 'text/markdown'] as const;
export type SupportedMimeType = (typeof SUPPORTED_MIME_TYPES)[number];

export class UnsupportedDocumentError extends Error {
  readonly statusCode: number;

  constructor(message: string, statusCode = 422) {
    super(message);
    this.name = 'UnsupportedDocumentError';
    this.statusCode = statusCode;
  }
}

export function normalizeMimeType(raw: string | undefined): SupportedMimeType | null {
  const base = (raw ?? '').split(';')[0]?.trim().toLowerCase() ?? '';
  return (SUPPORTED_MIME_TYPES as readonly string[]).includes(base)
    ? (base as SupportedMimeType)
    : null;
}

/** Garde le nom de fichier seul : pas de chemin, pas de caractères de contrôle, longueur bornée. */
export function sanitizeTitle(raw: string | undefined): string {
  const base = (raw ?? '').split(/[\\/]/).pop() ?? '';
  // eslint-disable-next-line no-control-regex
  const cleaned = base.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 120);
  return cleaned === '' ? 'Document sans titre' : cleaned;
}

function decodeText(buffer: Buffer): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer);
  } catch {
    throw new UnsupportedDocumentError('Le fichier texte doit être encodé en UTF-8.');
  }
}

/** Texte brut d'un document, page par page pour un PDF. */
export async function extractSegments(
  buffer: Buffer,
  mimeType: SupportedMimeType,
): Promise<TextSegment[]> {
  if (buffer.length === 0) {
    throw new UnsupportedDocumentError('Le fichier est vide.');
  }

  if (mimeType === 'application/pdf') {
    if (buffer.subarray(0, 5).toString('latin1') !== '%PDF-') {
      throw new UnsupportedDocumentError("Ce fichier n'est pas un PDF valide.");
    }
    try {
      const { extractText, getDocumentProxy } = await import('unpdf');
      const pdf = await getDocumentProxy(new Uint8Array(buffer));
      const { text } = await extractText(pdf, { mergePages: false });
      const pages = Array.isArray(text) ? text : [text];
      return pages.map((pageText, index) => ({ page: index + 1, text: pageText }));
    } catch {
      throw new UnsupportedDocumentError("Impossible de lire ce PDF (fichier abîmé ou protégé).");
    }
  }

  const text = decodeText(buffer);
  if (text.includes('\u0000')) {
    throw new UnsupportedDocumentError('Le fichier contient des données binaires.');
  }
  return [{ page: null, text }];
}
