import type { ModelToolCall } from './types.js';

const MAX_CALLS = 3;
const MAX_NAME = 64;

function asCall(value: unknown): ModelToolCall | null {
  if (typeof value !== 'object' || value === null) {
    return null;
  }
  const record = value as { name?: unknown; arguments?: unknown; parameters?: unknown };
  if (typeof record.name !== 'string' || record.name.length === 0 || record.name.length > MAX_NAME) {
    return null;
  }
  // Sans champ d'arguments, ce n'est pas un appel mais un objet quelconque qui a un « name ».
  if (record.arguments === undefined && record.parameters === undefined) {
    return null;
  }
  return { name: record.name, arguments: record.arguments ?? record.parameters };
}

/** Fin de la valeur JSON qui commence à `start` (objet ou tableau), ou -1 si elle n'est pas fermée. */
function jsonEnd(text: string, start: number): number {
  let depth = 0;
  let inString = false;
  for (let i = start; i < text.length; i += 1) {
    const ch = text[i]!;
    if (inString) {
      if (ch === '\\') {
        i += 1;
      } else if (ch === '"') {
        inString = false;
      }
    } else if (ch === '"') {
      inString = true;
    } else if (ch === '[' || ch === '{') {
      depth += 1;
    } else if (ch === ']' || ch === '}') {
      depth -= 1;
      if (depth === 0) {
        return i + 1;
      }
    }
  }
  return -1;
}

/**
 * Certains modèles locaux écrivent l'appel d'outil en texte (`[{"name": "calculator", ...}]`)
 * au lieu d'utiliser le champ prévu, parfois avec une phrase avant ou après. On le retrouve et
 * on le retire de la réponse. Ce n'est qu'une manière de lire la demande : elle passe ensuite
 * par les mêmes vérifications qu'un appel normal (outil connu, arguments valides, accord de
 * l'utilisateur pour les actions sensibles).
 */
export function extractTextToolCalls(
  text: string,
): { calls: ModelToolCall[]; cleanText: string } | null {
  const starts = [...text.matchAll(/[[{]\s*\{?\s*"name"\s*:/g)].map((m) => m.index!);
  for (const start of starts) {
    const end = jsonEnd(text, start);
    if (end === -1) {
      continue;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(text.slice(start, end));
    } catch {
      continue;
    }
    const items = Array.isArray(parsed) ? parsed : [parsed];
    const calls = items.slice(0, MAX_CALLS).map(asCall);
    if (calls.length === 0 || calls.some((c) => c === null)) {
      continue;
    }
    const before = text.slice(0, start).replace(/```[a-z]*\s*$/i, '').trimEnd();
    const after = text.slice(end).replace(/^\s*```/, '').trim();
    return { calls: calls as ModelToolCall[], cleanText: [before, after].filter(Boolean).join('\n\n') };
  }
  return null;
}
