import { describe, expect, it } from 'vitest';
import type { PendingAction } from '../types/chat';
import { addPending, addStep, pendingForConversation, stepStatusLabel, stepsSummary, toolLabel, usedToolLabels } from './tools';

function action(id: string, conversationId: string): PendingAction {
  return { id, tool: 'delete_memory', summary: 'Effacer', conversationId, expiresAt: '2026-01-01T00:00:00.000Z' };
}

describe('outils', () => {
  it('nomme les outils connus et garde les autres tels quels', () => {
    expect(toolLabel('calculator')).toBe('Calculatrice');
    expect(toolLabel('inconnu')).toBe('inconnu');
  });

  it('liste les outils utilisés sans doublon', () => {
    expect(usedToolLabels(['calculator', 'calculator', 'search_documents'])).toEqual([
      'Calculatrice',
      'Recherche dans vos documents',
    ]);
  });

  it('ne montre que les actions de la conversation affichée', () => {
    const all = [action('a', 'c1'), action('b', 'c2')];
    expect(pendingForConversation(all, 'c1').map((x) => x.id)).toEqual(['a']);
    expect(pendingForConversation(all, null)).toEqual([]);
  });

  it('n’ajoute pas deux fois la même action', () => {
    const once = addPending([], action('a', 'c1'));
    expect(addPending(once, action('a', 'c1'))).toHaveLength(1);
    expect(addPending(once, action('b', 'c1'))).toHaveLength(2);
  });
});

describe('étapes de l’agent', () => {
  const step = (n: number, status: 'result' | 'rejected' | 'confirmation' = 'result') => ({
    step: n,
    tool: 'calculator',
    status,
    args: '{}',
    preview: '',
  });

  it('n’ajoute pas deux fois la même étape', () => {
    const once = addStep([], step(1));
    expect(addStep(once, step(1))).toHaveLength(1);
    expect(addStep(once, step(2))).toHaveLength(2);
  });

  it('décrit le bilan en français', () => {
    expect(stepsSummary([step(1)], false)).toBe('1 étape');
    expect(stepsSummary([step(1), step(2, 'rejected')], false)).toBe('2 étapes, dont 1 non exécutée');
    expect(stepsSummary([step(1), step(2)], true)).toBe('2 étapes (budget atteint)');
    expect(stepStatusLabel('confirmation')).toBe('en attente de votre accord');
  });
});
