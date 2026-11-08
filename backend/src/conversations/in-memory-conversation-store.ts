import { randomUUID } from 'node:crypto';
import type { ChatMessage } from '../types/chat.js';
import type { ConversationStore } from './conversation-store.js';
import { resolveMessagesToAppend } from './conversation.service.js';
import type {
  AppendMessageInput,
  Conversation,
  ConversationMessage,
  CreateConversationInput,
  User,
} from './types.js';

/**
 * Stockage temporaire en RAM des conversations.
 */
export class InMemoryConversationStore implements ConversationStore {
  private readonly users = new Map<string, User>();
  private readonly conversationsByUser = new Map<string, Conversation[]>();
  private readonly messagesByConversation = new Map<string, ConversationMessage[]>();

  async ensureUser(userId: string): Promise<User> {
    const existing = this.users.get(userId);
    if (existing) {
      return { ...existing };
    }

    const user: User = {
      id: userId,
      createdAt: new Date(),
    };
    this.users.set(userId, user);
    return { ...user };
  }

  async createConversation(input: CreateConversationInput): Promise<Conversation> {
    await this.ensureUser(input.userId);

    const now = new Date();
    const conversation: Conversation = {
      id: randomUUID(),
      userId: input.userId,
      title: (input.title ?? '').trim(),
      createdAt: now,
      updatedAt: now,
    };

    const list = this.conversationsByUser.get(input.userId) ?? [];
    list.push(conversation);
    this.conversationsByUser.set(input.userId, list);
    this.messagesByConversation.set(conversation.id, []);

    return { ...conversation };
  }

  async listConversationsByUser(userId: string): Promise<Conversation[]> {
    const list = this.conversationsByUser.get(userId) ?? [];
    return list
      .slice()
      .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
      .map((conversation) => ({ ...conversation }));
  }

  async getConversation(
    userId: string,
    conversationId: string,
  ): Promise<Conversation | null> {
    const list = this.conversationsByUser.get(userId) ?? [];
    const found = list.find((conversation) => conversation.id === conversationId);
    return found ? { ...found } : null;
  }

  async deleteConversation(userId: string, conversationId: string): Promise<boolean> {
    const list = this.conversationsByUser.get(userId);
    if (!list) {
      return false;
    }

    const index = list.findIndex((conversation) => conversation.id === conversationId);
    if (index === -1) {
      return false;
    }

    list.splice(index, 1);
    this.messagesByConversation.delete(conversationId);

    if (list.length === 0) {
      this.conversationsByUser.delete(userId);
    }

    return true;
  }

  async listMessages(conversationId: string): Promise<ConversationMessage[]> {
    const messages = this.messagesByConversation.get(conversationId) ?? [];
    return messages.map((message) => ({ ...message }));
  }

  async appendMessage(input: AppendMessageInput): Promise<ConversationMessage> {
    const messages = this.messagesByConversation.get(input.conversationId);
    if (!messages) {
      throw new Error(`Conversation introuvable : ${input.conversationId}`);
    }

    const message: ConversationMessage = {
      id: randomUUID(),
      conversationId: input.conversationId,
      role: input.role,
      content: input.content,
      ...(input.sources && input.sources.length > 0 ? { sources: input.sources } : {}),
      createdAt: new Date(),
    };

    messages.push(message);
    await this.touchConversation(input.conversationId);

    return { ...message };
  }

  async appendNewMessages(
    conversationId: string,
    incoming: ChatMessage[],
  ): Promise<ConversationMessage[]> {
    const stored = await this.listMessages(conversationId);
    if (!this.messagesByConversation.has(conversationId)) {
      throw new Error(`Conversation introuvable : ${conversationId}`);
    }

    const toAppend = resolveMessagesToAppend(stored, incoming);
    const created: ConversationMessage[] = [];

    for (const message of toAppend) {
      created.push(
        await this.appendMessage({
          conversationId,
          role: message.role,
          content: message.content,
        }),
      );
    }

    return created;
  }

  async touchConversation(conversationId: string): Promise<void> {
    for (const [, list] of this.conversationsByUser) {
      const found = list.find((conversation) => conversation.id === conversationId);
      if (found) {
        found.updatedAt = new Date();
        return;
      }
    }
  }
}
