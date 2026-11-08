import { describe, expect, it } from 'vitest';
import type { ChatMessage, ConversationSummary } from '../types/chat';
import {
  appendOptimisticUserMessage,
  applyStreamDelta,
  dropStreamingMessage,
  replaceStreamMessage,
  canMutateConversations,
  findLastUserContent,
  findNewlyCreatedConversation,
  mergeSyncedMessagesAfterFailure,
  prepareMessagesForRegenerate,
  retainMessagesOnSendFailure,
  shouldAppendOptimisticUserMessage,
} from './chat-send';

function userMsg(content: string, id = 'local-1'): ChatMessage {
  return { id, role: 'user', content };
}

function assistantMsg(content: string, id = 'a-1'): ChatMessage {
  return { id, role: 'assistant', content };
}

function summary(id: string): ConversationSummary {
  return {
    id,
    userId: 'user-A',
    title: 'Titre',
    createdAt: '2026-01-01T10:00:00.000Z',
    updatedAt: '2026-01-01T10:00:00.000Z',
  };
}

describe('échec d’envoi : conservation du texte', () => {
  it('conserve le message utilisateur déjà ajouté (pas de rollback)', () => {
    const withOptimistic = appendOptimisticUserMessage([], 'Bonjour');
    const afterError = retainMessagesOnSendFailure(withOptimistic);

    expect(afterError).toHaveLength(1);
    expect(afterError[0]?.content).toBe('Bonjour');
    expect(afterError[0]?.role).toBe('user');
    expect(afterError[0]?.createdAt).toEqual(expect.any(String));
  });

  it('un retry du même content n’ajoute pas une seconde bulle', () => {
    const first = appendOptimisticUserMessage([], 'Bonjour');
    expect(shouldAppendOptimisticUserMessage(first, 'Bonjour')).toBe(false);

    const retried = appendOptimisticUserMessage(first, 'Bonjour');
    expect(retried).toHaveLength(1);
    expect(retried.filter((message) => message.content === 'Bonjour')).toHaveLength(
      1,
    );
  });

  it('un contenu différent après échec ajoute une nouvelle bulle', () => {
    const first = appendOptimisticUserMessage([], 'Bonjour');
    const next = appendOptimisticUserMessage(first, 'Autre chose');
    expect(next).toHaveLength(2);
  });
});

describe('sync après échec (timeout : user en DB, assistant absent)', () => {
  it('prend l’historique serveur s’il contient déjà le message → pas de duplication', () => {
    const local = [userMsg('Bonjour', 'local-1')];
    const server = [userMsg('Bonjour', 'db-1')];

    const merged = mergeSyncedMessagesAfterFailure(local, server, 'Bonjour');
    expect(merged).toEqual(server);
    expect(merged).toHaveLength(1);
  });

  it('conserve la bulle locale si le serveur n’a pas encore le message', () => {
    const local = [assistantMsg('Salut'), userMsg('Bonjour', 'local-1')];
    const server = [assistantMsg('Salut')];

    const merged = mergeSyncedMessagesAfterFailure(local, server, 'Bonjour');
    expect(merged).toHaveLength(2);
    expect(merged[1]?.content).toBe('Bonjour');
    expect(merged.filter((message) => message.content === 'Bonjour')).toHaveLength(
      1,
    );
  });
});

describe('course génération / changement de conversation', () => {
  it('interdit sélection, suppression et nouvelle conversation pendant un send', () => {
    expect(canMutateConversations(true)).toBe(false);
    expect(canMutateConversations(false)).toBe(true);
  });

  it('identifie une conversation créée dont la réponse HTTP n’est pas revenue', () => {
    const listed = [summary('old'), summary('new-from-send')];
    const created = findNewlyCreatedConversation(['old'], listed);
    expect(created?.id).toBe('new-from-send');
  });
});

describe('régénération', () => {
  it('findLastUserContent retourne le dernier message utilisateur', () => {
    expect(
      findLastUserContent([
        userMsg('Bonjour'),
        assistantMsg('Salut'),
        userMsg('Suite'),
        assistantMsg('OK'),
      ]),
    ).toBe('Suite');
  });

  it('prepareMessagesForRegenerate retire la dernière réponse Mnemo', () => {
    const messages = [userMsg('Bonjour'), assistantMsg('Salut')];
    const prepared = prepareMessagesForRegenerate(messages);
    expect(prepared).toEqual([userMsg('Bonjour')]);
    expect(messages).toHaveLength(2);
  });
});

describe('applyStreamDelta', () => {
  it('crée la bulle au premier fragment puis la complète', () => {
    const first = applyStreamDelta([userMsg('Salut')], 's-1', 'Bon', '2026-01-01T10:00:00.000Z');
    expect(first).toHaveLength(2);
    expect(first[1]).toMatchObject({ id: 's-1', role: 'assistant', content: 'Bon' });

    const second = applyStreamDelta(first, 's-1', 'jour');
    expect(second).toHaveLength(2);
    expect(second[1]?.content).toBe('Bonjour');
    expect(first[1]?.content).toBe('Bon');
  });

  it('retire la bulle en cours sans toucher aux autres messages', () => {
    const messages = applyStreamDelta([userMsg('Salut')], 's-1', 'Bon');
    expect(dropStreamingMessage(messages, 's-1')).toEqual([userMsg('Salut')]);
  });
});

describe('applyStreamDelta avec sources', () => {
  it('attache les sources à la bulle créée au premier fragment', () => {
    const source = { documentId: 'd', title: 'cours.pdf', page: 2, snippet: 'useMemo' };
    const messages = applyStreamDelta([userMsg('Q')], 's-1', 'Bon', '2026-01-01T10:00:00.000Z', [source]);
    expect(messages[1]?.sources).toEqual([source]);
    expect(applyStreamDelta(messages, 's-1', 'jour')[1]?.sources).toEqual([source]);
    expect(applyStreamDelta([userMsg('Q')], 's-2', 'x')[1]?.sources).toBeUndefined();
  });
});

describe('replaceStreamMessage', () => {
  it('remplace le texte de la bulle en cours et rien d\'autre', () => {
    const messages = applyStreamDelta([userMsg('Q')], 's-1', 'texte qui fuit');
    const replaced = replaceStreamMessage(messages, 's-1', 'Réponse bloquée');
    expect(replaced[1]?.content).toBe('Réponse bloquée');
    expect(replaced[0]).toEqual(userMsg('Q'));
    expect(messages[1]?.content).toBe('texte qui fuit');
  });
});
