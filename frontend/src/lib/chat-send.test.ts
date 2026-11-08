import { describe, expect, it } from 'vitest';
import type { ChatMessage, ConversationSummary } from '../types/chat';
import {
  appendOptimisticUserMessage,
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

  it('prepareMessagesForRegenerate retire la dernière réponse STELLA', () => {
    const messages = [userMsg('Bonjour'), assistantMsg('Salut')];
    const prepared = prepareMessagesForRegenerate(messages);
    expect(prepared).toEqual([userMsg('Bonjour')]);
    expect(messages).toHaveLength(2);
  });
});
