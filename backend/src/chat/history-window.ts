import type { ChatMessage } from '../types/chat.js';

export function totalContentChars(messages: ChatMessage[]): number {
  return messages.reduce((sum, message) => sum + message.content.length, 0);
}

function alignWindowStart(window: ChatMessage[]): ChatMessage[] {
  if (window[0]?.role === 'assistant' && window.length > 1) {
    return window.slice(1);
  }
  return window;
}

function trimToCharBudget(
  window: ChatMessage[],
  maxChars: number,
): ChatMessage[] {
  if (!Number.isFinite(maxChars)) {
    return window;
  }

  let result = window;

  while (result.length > 1 && totalContentChars(result) > Math.max(0, maxChars)) {
    result = result.slice(1);
  }

  return alignWindowStart(result);
}

/**
 * Conserve uniquement les N derniers messages conversationnels pour le modèle,
 * dans la limite d'un budget de caractères. L'historique complet reste en base.
 * Si la fenêtre commence par un message assistant, il est retiré pour démarrer
 * sur un tour user. Le dernier message n'est jamais tronqué.
 */
export function selectRecentChatMessages(
  messages: ChatMessage[],
  maxMessages: number,
  maxChars = Number.POSITIVE_INFINITY,
): ChatMessage[] {
  let window =
    maxMessages <= 0 || messages.length <= maxMessages
      ? messages
      : messages.slice(-maxMessages);

  window = alignWindowStart(window);
  window = trimToCharBudget(window, maxChars);
  return window;
}
