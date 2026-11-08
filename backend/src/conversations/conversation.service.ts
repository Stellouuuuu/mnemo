import type { ChatMessage } from '../types/chat.js';
import type { ConversationStore } from './conversation-store.js';
import type {
  AppendMessageInput,
  Conversation,
  ConversationMessage,
  ConversationWithMessages,
  CreateConversationInput,
  User,
} from './types.js';

export class ConversationNotFoundError extends Error {
  constructor(message = 'Conversation introuvable pour cet utilisateur.') {
    super(message);
    this.name = 'ConversationNotFoundError';
  }
}

/**
 * Service applicatif conversations.
 * Dépend uniquement de l'interface ConversationStore.
 */
export class ConversationService {
  constructor(private readonly store: ConversationStore) {}

  ensureUser(userId: string): Promise<User> {
    this.assertNonEmpty(userId, 'userId');
    return this.store.ensureUser(userId.trim());
  }

  createConversation(input: CreateConversationInput): Promise<Conversation> {
    this.assertNonEmpty(input.userId, 'userId');
    return this.store.createConversation({
      userId: input.userId.trim(),
      title: input.title?.trim() ?? '',
    });
  }

  listConversations(userId: string): Promise<Conversation[]> {
    this.assertNonEmpty(userId, 'userId');
    return this.store.listConversationsByUser(userId.trim());
  }

  async getConversation(
    userId: string,
    conversationId: string,
  ): Promise<Conversation | null> {
    this.assertNonEmpty(userId, 'userId');
    this.assertNonEmpty(conversationId, 'conversationId');
    return this.store.getConversation(userId.trim(), conversationId.trim());
  }

  async getConversationWithMessages(
    userId: string,
    conversationId: string,
  ): Promise<ConversationWithMessages | null> {
    const conversation = await this.getConversation(userId, conversationId);
    if (!conversation) {
      return null;
    }

    const messages = await this.store.listMessages(conversation.id);
    return { ...conversation, messages };
  }

  async requireConversation(
    userId: string,
    conversationId: string,
  ): Promise<Conversation> {
    const conversation = await this.getConversation(userId, conversationId);
    if (!conversation) {
      throw new ConversationNotFoundError();
    }
    return conversation;
  }

  async deleteConversation(userId: string, conversationId: string): Promise<boolean> {
    this.assertNonEmpty(userId, 'userId');
    this.assertNonEmpty(conversationId, 'conversationId');
    return this.store.deleteConversation(userId.trim(), conversationId.trim());
  }

  listMessages(conversationId: string): Promise<ConversationMessage[]> {
    this.assertNonEmpty(conversationId, 'conversationId');
    return this.store.listMessages(conversationId.trim());
  }

  async appendMessage(input: AppendMessageInput): Promise<ConversationMessage> {
    this.assertNonEmpty(input.conversationId, 'conversationId');
    this.assertNonEmpty(input.content, 'content');
    return this.store.appendMessage({
      conversationId: input.conversationId.trim(),
      role: input.role,
      content: input.content.trim(),
    });
  }

  /**
   * Ajoute uniquement les messages qui ne sont pas déjà en fin d'historique stocké.
   */
  async appendNewMessages(
    conversationId: string,
    incoming: ChatMessage[],
  ): Promise<ConversationMessage[]> {
    this.assertNonEmpty(conversationId, 'conversationId');
    return this.store.appendNewMessages(conversationId.trim(), incoming);
  }

  private assertNonEmpty(value: string, field: string): void {
    if (typeof value !== 'string' || value.trim() === '') {
      throw new Error(`Le champ "${field}" est obligatoire.`);
    }
  }
}

/**
 * Si l'historique client commence comme le stocké → append le suffixe.
 * Sinon → append uniquement le dernier message user s'il n'est pas déjà le dernier stocké.
 */
export function resolveMessagesToAppend(
  stored: Array<Pick<ConversationMessage, 'role' | 'content'>>,
  incoming: ChatMessage[],
): ChatMessage[] {
  if (incoming.length === 0) {
    return [];
  }

  if (stored.length === 0) {
    return incoming;
  }

  if (incoming.length >= stored.length) {
    let prefixMatches = true;
    for (let index = 0; index < stored.length; index += 1) {
      const storedMessage = stored[index]!;
      const incomingMessage = incoming[index]!;
      if (
        storedMessage.role !== incomingMessage.role ||
        storedMessage.content !== incomingMessage.content
      ) {
        prefixMatches = false;
        break;
      }
    }

    if (prefixMatches) {
      return incoming.slice(stored.length);
    }
  }

  const latestUser = [...incoming].reverse().find((message) => message.role === 'user');
  if (!latestUser) {
    return [];
  }

  const lastStored = stored[stored.length - 1]!;
  if (lastStored.role === 'user' && lastStored.content === latestUser.content) {
    return [];
  }

  return [latestUser];
}

export function deriveConversationTitle(messages: ChatMessage[]): string {
  const firstUser = messages.find((message) => message.role === 'user');
  if (!firstUser) {
    return 'Nouvelle conversation';
  }

  const trimmed = firstUser.content.trim().replace(/\s+/g, ' ');
  if (trimmed.length <= 60) {
    return trimmed;
  }

  return `${trimmed.slice(0, 57)}...`;
}
