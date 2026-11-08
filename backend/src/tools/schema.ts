import type { ToolSchema } from './types.js';

export type ValidationResult =
  | { ok: true; args: Record<string, unknown> }
  | { ok: false; error: string };

/**
 * Vérifie les arguments donnés par le modèle : objet, champs connus uniquement, types, bornes.
 * Un champ inattendu est refusé (un modèle manipulé pourrait tenter d'ajouter `userId`).
 */
export function validateArguments(schema: ToolSchema, raw: unknown): ValidationResult {
  let value = raw;
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value);
    } catch {
      return { ok: false, error: 'Les arguments ne sont pas du JSON valide.' };
    }
  }
  if (value === undefined || value === null) {
    value = {};
  }
  if (typeof value !== 'object' || Array.isArray(value)) {
    return { ok: false, error: 'Les arguments doivent être un objet.' };
  }

  const input = value as Record<string, unknown>;
  for (const key of Object.keys(input)) {
    if (!(key in schema.properties)) {
      return { ok: false, error: `Argument inconnu : « ${key} ».` };
    }
  }
  for (const key of schema.required ?? []) {
    if (input[key] === undefined) {
      return { ok: false, error: `Argument obligatoire manquant : « ${key} ».` };
    }
  }

  const clean: Record<string, unknown> = {};
  for (const [key, prop] of Object.entries(schema.properties)) {
    const item = input[key];
    if (item === undefined) {
      continue;
    }
    if (prop.type === 'string') {
      if (typeof item !== 'string') {
        return { ok: false, error: `« ${key} » doit être un texte.` };
      }
      if (prop.maxLength !== undefined && item.length > prop.maxLength) {
        return { ok: false, error: `« ${key} » dépasse ${prop.maxLength} caractères.` };
      }
    } else if (prop.type === 'boolean') {
      if (typeof item !== 'boolean') {
        return { ok: false, error: `« ${key} » doit être vrai ou faux.` };
      }
    } else {
      if (typeof item !== 'number' || !Number.isFinite(item)) {
        return { ok: false, error: `« ${key} » doit être un nombre.` };
      }
      if (prop.type === 'integer' && !Number.isInteger(item)) {
        return { ok: false, error: `« ${key} » doit être un entier.` };
      }
      if (prop.minimum !== undefined && item < prop.minimum) {
        return { ok: false, error: `« ${key} » est trop petit.` };
      }
      if (prop.maximum !== undefined && item > prop.maximum) {
        return { ok: false, error: `« ${key} » est trop grand.` };
      }
    }
    if (prop.enum && !prop.enum.includes(item as string | number)) {
      return { ok: false, error: `« ${key} » doit être l'une des valeurs : ${prop.enum.join(', ')}.` };
    }
    clean[key] = item;
  }
  return { ok: true, args: clean };
}
