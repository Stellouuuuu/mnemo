import type { MemoryItem } from '../types/memory';

/** Libellé affiché pour chaque clé que le backend sait retenir (ordre = ordre d'affichage). */
const MEMORY_LABELS: Record<string, string> = {
  user_name: 'Prénom',
  occupation: 'Métier',
  field_of_study: 'Études',
  location: 'Lieu',
  language: 'Langue',
  preference: 'Préférence',
  goal: 'Objectif',
};

const ORDER = Object.keys(MEMORY_LABELS);

export function memoryLabel(key: string): string {
  return MEMORY_LABELS[key] ?? key;
}

/** Trie dans l'ordre des libellés ci-dessus, les clés inconnues à la fin. */
export function sortMemories(memories: MemoryItem[]): MemoryItem[] {
  const rank = (key: string) => {
    const index = ORDER.indexOf(key);
    return index === -1 ? ORDER.length : index;
  };

  return [...memories].sort(
    (a, b) => rank(a.key) - rank(b.key) || a.key.localeCompare(b.key),
  );
}

/** Vrai si la valeur saisie peut être envoyée : non vide et différente de l'actuelle. */
export function canSaveMemoryEdit(current: string, draft: string): boolean {
  const next = draft.trim();
  return next !== '' && next !== current.trim();
}
