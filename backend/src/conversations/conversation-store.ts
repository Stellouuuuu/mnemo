import type { ChatMessage } from '../types/chat.js';
import type {
  AppendMessageInput,
  Conversation,
  ConversationMessage,
  CreateConversationInput,
  User,
} from './types.js';

/**
 * Abstraction de stockage des conversations.
 * Permet de remplacer InMemoryConversationStore par PostgresConversationStore
 * sans changer ConversationService ni le reste de l'application.
 */
export interface ConversationStore {
  ensureUser(userId: string): Promise<User>;

  createConversation(input: CreateConversationInput): Promise<Conversation>;

  listConversationsByUser(userId: string): Promise<Conversation[]>;

  getConversation(userId: string, conversationId: string): Promise<Conversation | null>;

  deleteConversation(userId: string, conversationId: string): Promise<boolean>;

  listMessages(conversationId: string): Promise<ConversationMessage[]>;

  appendMessage(input: AppendMessageInput): Promise<ConversationMessage>;

  /**
   * Append atomique des messages réellement nouveaux (préfixe déjà stocké ignoré).
   * L'implémentation Postgres sérialise via FOR UPDATE.
   */
  appendNewMessages(
    conversationId: string,
    incoming: ChatMessage[],
  ): Promise<ConversationMessage[]>;

  /** Touch updated_at de la conversation (après ajout de message). */
  touchConversation(conversationId: string): Promise<void>;
}
