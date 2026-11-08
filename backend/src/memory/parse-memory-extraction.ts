import type { MemoryCandidate } from '../memory/types.js';
import { normalizeMemoryCandidate } from './memory-schema.js';

export const MEMORY_EXTRACTION_LIMITS = {
  maxMemories: 5,
  maxKeyLength: 64,
  maxValueLength: 500,
} as const;

/**
 * Parse et valide strictement la sortie LLM d'extraction.
 * Applique le schéma de clés canoniques.
 * En cas d'échec → tableau vide (aucune mémoire enregistrée).
 */
export function parseMemoryExtractionResponse(raw: string): MemoryCandidate[] {
  const jsonText = extractJsonObject(raw);
  if (jsonText === null) {
    return [];
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText) as unknown;
  } catch {
    return [];
  }

  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return [];
  }

  const memoriesRaw = (parsed as { memories?: unknown }).memories;
  if (!Array.isArray(memoriesRaw)) {
    return [];
  }

  const candidates: MemoryCandidate[] = [];
  const seenKeys = new Set<string>();

  for (const item of memoriesRaw) {
    if (candidates.length >= MEMORY_EXTRACTION_LIMITS.maxMemories) {
      break;
    }

    if (item === null || typeof item !== 'object' || Array.isArray(item)) {
      continue;
    }

    const record = item as Record<string, unknown>;
    if (typeof record.key !== 'string' || typeof record.value !== 'string') {
      continue;
    }

    const key = record.key.trim();
    const value = record.value.trim();

    if (key === '' || value === '') {
      continue;
    }

    if (key.length > MEMORY_EXTRACTION_LIMITS.maxKeyLength) {
      continue;
    }

    if (value.length > MEMORY_EXTRACTION_LIMITS.maxValueLength) {
      continue;
    }

    const normalized = normalizeMemoryCandidate(key, value);
    if (normalized === null) {
      continue;
    }

    if (seenKeys.has(normalized.key)) {
      continue;
    }

    seenKeys.add(normalized.key);
    candidates.push(normalized);
  }

  return candidates;
}

function extractJsonObject(raw: string): string | null {
  const trimmed = raw.trim();
  if (trimmed === '') {
    return null;
  }

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = (fenced?.[1] ?? trimmed).trim();

  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) {
    return null;
  }

  return candidate.slice(start, end + 1);
}
