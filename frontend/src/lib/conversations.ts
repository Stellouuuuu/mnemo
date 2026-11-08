import type {
  ApiChatMessage,
  ChatMessage,
  ConversationMessageDto,
  ConversationSummary,
  SourceRef,
} from '../types/chat';

/** Choisit la conversation la plus récemment mise à jour. */
export function pickMostRecentConversation(
  conversations: ConversationSummary[],
): ConversationSummary | null {
  if (conversations.length === 0) {
    return null;
  }

  return conversations.reduce((latest, current) => {
    const latestTime = Date.parse(latest.updatedAt);
    const currentTime = Date.parse(current.updatedAt);

    if (Number.isNaN(currentTime)) {
      return latest;
    }

    if (Number.isNaN(latestTime) || currentTime > latestTime) {
      return current;
    }

    return latest;
  });
}

/** Mappe les messages API (détail) vers le format UI. */
export function mapDetailMessagesToChatMessages(
  messages: ConversationMessageDto[],
): ChatMessage[] {
  return messages.map((message) => ({
    id: message.id,
    role: message.role,
    content: message.content,
    ...(message.sources ? { sources: message.sources } : {}),
    createdAt: message.createdAt,
  }));
}

/** Mappe les messages renvoyés par POST /api/chat vers le format UI. */
export function mapApiMessagesToChatMessages(
  messages: ApiChatMessage[],
  conversationId: string,
  previous: ChatMessage[] = [],
  sources: SourceRef[] = [],
): ChatMessage[] {
  const now = new Date().toISOString();

  return messages.map((message, index) => {
    const prior = previous[index];
    const keptCreatedAt =
      prior?.role === message.role && prior.content === message.content
        ? prior.createdAt
        : undefined;

    return {
      id: `${conversationId}-${index}-${message.role}`,
      role: message.role,
      content: message.content,
      ...(sources.length > 0 && index === messages.length - 1 && message.role === 'assistant'
        ? { sources }
        : {}),
      createdAt: keptCreatedAt ?? now,
    };
  });
}

/** Affiche une date courte pour la sidebar. */
export function formatConversationUpdatedAt(isoDate: string): string {
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) {
    return '';
  }

  return new Intl.DateTimeFormat('fr-FR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(date);
}

/** Heure discrète pour un message du fil. */
export function formatMessageClock(isoDate: string | undefined): string {
  if (!isoDate) {
    return '';
  }

  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) {
    return '';
  }

  return new Intl.DateTimeFormat('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

export function toApiMessages(messages: ChatMessage[]): ApiChatMessage[] {
  return messages.map(({ role, content }) => ({ role, content }));
}

/** Titre affiché dans le header du chat. */
export function conversationHeaderTitle(
  conversationId: string | null,
  conversations: ConversationSummary[],
): string {
  if (conversationId === null) {
    return 'Nouvelle conversation';
  }

  const found = conversations.find(
    (conversation) => conversation.id === conversationId,
  );
  const title = found?.title.trim();
  return title ? title : 'Conversation sans titre';
}
