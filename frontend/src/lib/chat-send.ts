import type { ChatMessage, ConversationSummary } from '../types/chat';
import { pickMostRecentConversation } from './conversations';

export function canMutateConversations(isSending: boolean): boolean {
  return !isSending;
}

export function shouldAppendOptimisticUserMessage(
  messages: ChatMessage[],
  content: string,
): boolean {
  const last = messages[messages.length - 1];
  if (!last || last.role !== 'user') {
    return true;
  }

  return last.content !== content;
}

/** Contenu du dernier message utilisateur, pour régénérer une réponse. */
export function findLastUserContent(messages: ChatMessage[]): string | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.role === 'user') {
      return message.content;
    }
  }

  return null;
}

/** Retire la dernière réponse Mnemo avant une régénération. */
export function prepareMessagesForRegenerate(
  messages: ChatMessage[],
): ChatMessage[] {
  const last = messages[messages.length - 1];
  if (last?.role === 'assistant') {
    return messages.slice(0, -1);
  }

  return messages;
}

export function appendOptimisticUserMessage(
  messages: ChatMessage[],
  content: string,
): ChatMessage[] {
  if (!shouldAppendOptimisticUserMessage(messages, content)) {
    return messages;
  }

  return [
    ...messages,
    {
      id: `local-${Date.now()}`,
      role: 'user',
      content,
      createdAt: new Date().toISOString(),
    },
  ];
}

/** Conserve les messages déjà affichés après un échec d’envoi (pas de rollback). */
export function retainMessagesOnSendFailure(
  messagesIncludingOptimistic: ChatMessage[],
): ChatMessage[] {
  return messagesIncludingOptimistic;
}

/** Conversation créée pendant un send dont la réponse n’est jamais arrivée. */
export function findNewlyCreatedConversation(
  previousIds: Iterable<string>,
  listed: ConversationSummary[],
): ConversationSummary | null {
  const previous = new Set(previousIds);
  const created = listed.filter((conversation) => !previous.has(conversation.id));
  return pickMostRecentConversation(created);
}

/**
 * Après un échec, préfère l’historique serveur s’il contient déjà le message,
 * sinon conserve la bulle locale pour ne pas le perdre ni le dupliquer.
 */
export function mergeSyncedMessagesAfterFailure(
  localMessages: ChatMessage[],
  serverMessages: ChatMessage[],
  sentContent: string,
): ChatMessage[] {
  const lastServer = serverMessages[serverMessages.length - 1];
  if (lastServer?.role === 'user' && lastServer.content === sentContent) {
    return serverMessages;
  }

  const lastLocal = localMessages[localMessages.length - 1];
  if (lastLocal?.role === 'user' && lastLocal.content === sentContent) {
    if (serverMessages.length === 0) {
      return localMessages;
    }

    return [...serverMessages, lastLocal];
  }

  return appendOptimisticUserMessage(serverMessages, sentContent);
}

/** Ajoute un fragment de réponse à la bulle en cours de génération (la crée au premier). */
export function applyStreamDelta(
  messages: ChatMessage[],
  streamId: string,
  text: string,
  now: string = new Date().toISOString(),
): ChatMessage[] {
  const last = messages[messages.length - 1];
  if (last?.id === streamId) {
    return [...messages.slice(0, -1), { ...last, content: last.content + text }];
  }

  return [...messages, { id: streamId, role: 'assistant', content: text, createdAt: now }];
}

/** Retire la bulle en cours de génération (échec avant la fin de la réponse). */
export function dropStreamingMessage(
  messages: ChatMessage[],
  streamId: string,
): ChatMessage[] {
  return messages.filter((message) => message.id !== streamId);
}
