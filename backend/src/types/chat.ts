export type ChatRole = 'user' | 'assistant';

export type OllamaRole = ChatRole | 'system';

export interface ChatMessage {
  role: ChatRole;
  content: string;
}

export interface OllamaChatMessage {
  role: OllamaRole;
  content: string;
}

export const ALLOWED_CHAT_ROLES: readonly ChatRole[] = ['user', 'assistant'];
