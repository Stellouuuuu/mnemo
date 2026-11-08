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

/** Retire la dernière réponse STELLA avant une régénération. */
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
