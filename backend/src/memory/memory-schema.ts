import type { MemoryCandidate } from './types.js';

/**
 * Schéma strict des clés mémoire autorisées.
 */
export const ALLOWED_MEMORY_KEYS = [
  'user_name',
  'occupation',
  'field_of_study',
  'location',
  'language',
  'preference',
  'goal',
] as const;

export type AllowedMemoryKey = (typeof ALLOWED_MEMORY_KEYS)[number];

const ALLOWED_KEY_SET = new Set<string>(ALLOWED_MEMORY_KEYS);

/** Alias → clé canonique. */
const KEY_ALIASES: Record<string, AllowedMemoryKey> = {
  user_name: 'user_name',
  name: 'user_name',
  prenom: 'user_name',
  prénom: 'user_name',
  mon_prenom: 'user_name',
  mon_prénom: 'user_name',
  first_name: 'user_name',
  full_name: 'user_name',
  username: 'user_name',

  occupation: 'occupation',
  profession: 'occupation',
  job: 'occupation',
  metier: 'occupation',
  métier: 'occupation',

  field_of_study: 'field_of_study',
  studies: 'field_of_study',
  etudes: 'field_of_study',
  études: 'field_of_study',
  domaine: 'field_of_study',
  mon_domaine: 'field_of_study',

  location: 'location',
  city: 'location',
  ville: 'location',
  pays: 'location',

  language: 'language',
  langue: 'language',

  preference: 'preference',
  preferences: 'preference',
  préférences: 'preference',

  goal: 'goal',
  objectif: 'goal',
  goals: 'goal',
};

/** Valeurs génériques / non informatives à rejeter. */
const GENERIC_VALUES = new Set(
  [
    // Pronoms / déterminants
    'mon',
    'ma',
    'mes',
    'moi',
    'je',
    'tu',
    'ton',
    'ta',
    'tes',
    'son',
    'sa',
    'ses',
    'me',
    'te',
    // Interrogatifs
    'quel',
    'quelle',
    'quels',
    'quelles',
    'quoi',
    'qui',
    'ou',
    'où',
    'comment',
    'combien',
    'pourquoi',
    'quand',
    // Libellés / mots méta
    'prenom',
    'prénom',
    'nom',
    'domaine',
    'etude',
    'étude',
    'etudes',
    'études',
    'occupation',
    'profession',
    'metier',
    'métier',
    'langue',
    'preference',
    'préférence',
    'objectif',
    'goal',
    'location',
    'ville',
    'pays',
    // Phrases génériques
    'mon prenom',
    'mon prénom',
    'mon nom',
    'mon domaine',
    'mon occupation',
    'ma profession',
    'mon métier',
    'mon metier',
    'mon prénom / nom',
    'mon domaine d etude',
    'mon domaine d étude',
    'unknown',
    'n/a',
    'na',
    'none',
    'null',
    'undefined',
    // Clés internes
    'user_name',
    'occupation',
    'field_of_study',
    'location',
    'language',
    'preference',
    'goal',
  ].map((value) => normalizeText(value)),
);

/** Libellés humains pour le prompt (évite d'exposer les clés brutes comme "valeurs"). */
export const MEMORY_KEY_LABELS: Record<AllowedMemoryKey, string> = {
  user_name: 'Prénom / nom',
  occupation: 'Occupation',
  field_of_study: 'Domaine d’études',
  location: 'Lieu',
  language: 'Langue',
  preference: 'Préférence',
  goal: 'Objectif',
};

function normalizeText(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ');
}

function normalizeKeyToken(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[\s-]+/g, '_');
}

/**
 * Détecte une question / demande d'info (ne doit jamais produire de mémoire).
 */
export function isInformationSeekingQuestion(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed === '') {
    return false;
  }

  if (trimmed.endsWith('?')) {
    return true;
  }

  const normalized = normalizeText(trimmed);

  const questionStarters = [
    /^quel(le|s|les)?\b/,
    /^qui\b/,
    /^quoi\b/,
    /^ou\b/,
    /^comment\b/,
    /^combien\b/,
    /^pourquoi\b/,
    /^quand\b/,
    /^est ce que\b/,
    /^est-ce que\b/,
    /^tu (connais|sais|souviens|te souviens)\b/,
    /^vous (connaissez|savez|souvenez)\b/,
    /^que (sais|connais|savons|savez)\b/,
    /^peux tu\b/,
    /^pouvez vous\b/,
    /^c est quoi\b/,
    /^dis moi\b/,
    /^donne moi\b/,
    /^explique moi\b/,
    /^raconte moi\b/,
    /^ecris moi\b/,
    /^rappelle moi\b/,
  ];

  return questionStarters.some((pattern) => pattern.test(normalized));
}

const POSITIVE_DECLARATION_PATTERNS: RegExp[] = [
  /\bje m['']appelle\b/i,
  /\bmon pr[eé]nom est\b/i,
  /\bmon nom est\b/i,
  /\bje suis\b/i,
  /\bj['']habite\b/i,
  /\bje vis (a|à)\b/i,
  /\bje parle\b/i,
  /\bj[''][eé]tudie\b/i,
  /\bma langue (pr[eé]f[eé]r[eé]e )?est\b/i,
  /\bmon objectif est\b/i,
  /\bje pr[eé]f[eè]re\b/i,
];

const NEGATION_PATTERNS: RegExp[] = [
  /\bje ne m['']appelle pas\b/i,
  /\bmon pr[eé]nom n['']est pas\b/i,
  /\bje ne suis pas\b/i,
  /\bje n['']habite pas\b/i,
  /\bje ne vis pas\b/i,
  /\bce n['']est pas mon pr[eé]nom\b/i,
  /\bpas mon pr[eé]nom\b/i,
];

function hasPositiveDeclaration(text: string): boolean {
  return POSITIVE_DECLARATION_PATTERNS.some((pattern) => pattern.test(text));
}

function hasIdentityNegation(text: string): boolean {
  return NEGATION_PATTERNS.some((pattern) => pattern.test(text));
}

/**
 * True si le message peut légitimement produire une mémoire.
 * Uniquement les déclarations (ou corrections) explicites.
 * Questions, salutations, consignes et négations pures → false.
 */
export function isEligibleForMemoryExtraction(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed === '') {
    return false;
  }

  if (isInformationSeekingQuestion(trimmed)) {
    return false;
  }

  if (hasIdentityNegation(trimmed) && !hasPositiveDeclaration(trimmed)) {
    return false;
  }

  return hasPositiveDeclaration(trimmed);
}

/**
 * Normalise une clé brute vers une clé canonique, ou null si inconnue.
 * Ex. "mon_prenom" → "user_name"
 */
export function normalizeMemoryKey(rawKey: string): AllowedMemoryKey | null {
  const token = normalizeKeyToken(rawKey);
  if (token === '') {
    return null;
  }

  const aliased = KEY_ALIASES[token];
  if (aliased) {
    return aliased;
  }

  if (ALLOWED_KEY_SET.has(token)) {
    return token as AllowedMemoryKey;
  }

  return null;
}

export function isGenericMemoryValue(value: string): boolean {
  const normalized = normalizeText(value);
  if (normalized === '') {
    return true;
  }

  if (GENERIC_VALUES.has(normalized)) {
    return true;
  }

  // Rejette les valeurs qui ne sont que le libellé de la question ("mon prénom", etc.)
  if (/^(mon|ma|mes)\s+\w+(\s+\w+)?$/.test(normalized)) {
    return true;
  }

  // Un seul token trop court / pronominal
  if (!normalized.includes(' ') && normalized.length <= 3 && GENERIC_VALUES.has(normalized)) {
    return true;
  }

  return false;
}

/**
 * Valide et normalise un candidat mémoire.
 * Retourne null si la clé est inconnue ou la valeur générique/invalide.
 */
export function normalizeMemoryCandidate(
  rawKey: string,
  rawValue: string,
): MemoryCandidate | null {
  const key = normalizeMemoryKey(rawKey);
  if (key === null) {
    return null;
  }

  const value = rawValue.trim();
  if (value === '' || isGenericMemoryValue(value)) {
    return null;
  }

  // Une clé n'est jamais une valeur acceptable.
  if (normalizeKeyToken(value) === key || normalizeText(value) === normalizeText(key)) {
    return null;
  }

  // Rejette les valeurs qui ressemblent à une question entière
  if (isInformationSeekingQuestion(value)) {
    return null;
  }

  return { key, value };
}
