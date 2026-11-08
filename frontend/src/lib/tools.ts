import type { PendingAction, StepInfo } from '../types/chat';

const TOOL_LABELS: Record<string, string> = {
  calculator: 'Calculatrice',
  list_documents: 'Liste de vos documents',
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

const STEP_STATUS: Record<StepInfo['status'], string> = {
  result: 'exécuté',
  rejected: 'refusé par le serveur',
  confirmation: 'en attente de votre accord',
};

export function stepStatusLabel(status: StepInfo['status']): string {
  return STEP_STATUS[status];
}

/** Ajoute une étape reçue en cours de réponse, sans doublon. */
export function addStep(steps: StepInfo[], step: StepInfo): StepInfo[] {
  return steps.some((s) => s.step === step.step) ? steps : [...steps, step];
}

/** Phrase de bilan d'une réponse à étapes. */
export function stepsSummary(steps: StepInfo[], budgetExhausted: boolean): string {
  const refused = steps.filter((s) => s.status !== 'result').length;
  const base = `${steps.length} étape${steps.length > 1 ? 's' : ''}`;
  const extra = refused > 0 ? `, dont ${refused} non exécutée${refused > 1 ? 's' : ''}` : '';
  return budgetExhausted ? `${base}${extra} (budget atteint)` : `${base}${extra}`;
}
