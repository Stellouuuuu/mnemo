import type { ChatRole } from '../types/chat.js';

export interface User {
  id: string;
  createdAt: Date;
}

export interface Conversation {
  id: string;
  userId: string;
  title: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ConversationMessage {
  id: string;
  conversationId: string;
  role: ChatRole;
  content: string;
  createdAt: Date;
}

export interface CreateConversationInput {
  userId: string;
  title?: string;
}

export interface AppendMessageInput {
  conversationId: string;
  role: ChatRole;
  content: string;
}

export interface ConversationWithMessages extends Conversation {
  messages: ConversationMessage[];
}
