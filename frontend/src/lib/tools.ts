import type { PendingAction } from '../types/chat';

const TOOL_LABELS: Record<string, string> = {
  calculator: 'Calculatrice',
  search_documents: 'Recherche dans vos documents',
  delete_memory: 'Effacement d’un souvenir',
};

export function toolLabel(name: string): string {
  return TOOL_LABELS[name] ?? name;
}

/** Noms lisibles des outils réellement utilisés, sans doublon, dans l'ordre. */
export function usedToolLabels(names: string[]): string[] {
  return [...new Set(names)].map(toolLabel);
}

/** Actions en attente qui concernent la conversation affichée (une nouvelle conversation n'en a pas). */
export function pendingForConversation(
  actions: PendingAction[],
  conversationId: string | null,
): PendingAction[] {
  return conversationId === null ? [] : actions.filter((a) => a.conversationId === conversationId);
}

/** Ajoute une action en attente sans doublon. */
export function addPending(actions: PendingAction[], action: PendingAction): PendingAction[] {
  return actions.some((a) => a.id === action.id) ? actions : [...actions, action];
}
