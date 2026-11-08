import { env } from '../config/env.js';
import type { TextSegment } from './chunking.js';
import { ocrEnabled, recognizePages } from './ocr.js';

/** Une page avec moins de caractères que cela est considérée comme une image sans texte. */
const MIN_PAGE_CHARS = 20;

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

/** Remplace le texte des pages vides par celui que lit la reconnaissance de texte. */
async function withOcr(pdf: unknown, segments: TextSegment[]): Promise<TextSegment[]> {
  const blank = segments.filter((s) => s.text.trim().length < MIN_PAGE_CHARS).map((s) => s.page!);
  if (blank.length === 0 || !ocrEnabled()) {
    return segments;
  }
  if (blank.length > env.OCR_MAX_PAGES) {
    throw new UnsupportedDocumentError(
      `Ce PDF scanné a ${blank.length} pages sans texte : la reconnaissance est limitée à ${env.OCR_MAX_PAGES} pages.`,
      413,
    );
  }

  const recognized = await recognizePages(pdf, blank);
  return segments.map((segment) =>
    recognized.has(segment.page!) ? { page: segment.page, text: recognized.get(segment.page!) ?? '' } : segment,
  );
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
      const segments = pages.map((pageText, index) => ({ page: index + 1, text: pageText }));
      return await withOcr(pdf, segments);
    } catch (error) {
      if (error instanceof UnsupportedDocumentError) {
        throw error;
      }
      throw new UnsupportedDocumentError("Impossible de lire ce PDF (fichier abîmé ou protégé).");
    }
  }

  const text = decodeText(buffer);
  if (text.includes('\u0000')) {
    throw new UnsupportedDocumentError('Le fichier contient des données binaires.');
  }
  return [{ page: null, text }];
}
