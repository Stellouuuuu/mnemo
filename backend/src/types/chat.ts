export type ChatRole = 'user' | 'assistant';

export type OllamaRole = ChatRole | 'system' | 'tool';

export interface ChatMessage {
  role: ChatRole;
  content: string;
}

export interface OllamaChatMessage {
  role: OllamaRole;
  content: string;
  /** Appels demandés par le modèle (message assistant) : à renvoyer tels quels au tour suivant. */
  tool_calls?: { function: { name: string; arguments: unknown } }[];
  /** Nom de l'outil dont ce message (role: tool) donne le résultat. */
  tool_name?: string;
}

export const ALLOWED_CHAT_ROLES: readonly ChatRole[] = ['user', 'assistant'];
