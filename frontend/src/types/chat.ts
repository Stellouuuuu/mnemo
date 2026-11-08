export type MessageRole = 'user' | 'assistant';

/** Document cité par une réponse de l'assistant. */
export interface SourceRef {
  documentId: string;
  title: string;
  page: number | null;
  snippet: string;
}

/** Action sensible demandée par le modèle, en attente de l'accord de l'utilisateur. */
export interface PendingAction {
  id: string;
  tool: string;
  summary: string;
  conversationId: string;
  expiresAt: string;
}

/** Message affiché dans l'UI (avec id local). */
export interface ChatMessage {
  id: string;
  role: MessageRole;
  content: string;
  sources?: SourceRef[];
  /** Outils exécutés pour cette réponse (visible pendant la session seulement). */
  tools?: string[];
  createdAt?: string;
}

/** Message au format attendu par le backend / Ollama. */
export interface ApiChatMessage {
  role: MessageRole;
  content: string;
}

export interface ChatRequest {
  content: string;
  conversationId?: string;
}

export interface ChatSuccessResponse {
  conversationId: string;
  messages: ApiChatMessage[];
  response: string;
  sources?: SourceRef[];
  toolCalls?: { name: string }[];
  pendingActions?: PendingAction[];
}

export interface ChatErrorResponse {
  error: string;
  detail?: string;
}

/** Résumé d’une conversation (liste). */
export interface ConversationSummary {
  id: string;
  userId: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

/** Message tel que renvoyé par GET /api/conversations/:id. */
export interface ConversationMessageDto {
  id: string;
  role: MessageRole;
  content: string;
  sources?: SourceRef[];
  createdAt: string;
}

/** Détail d’une conversation avec messages. */
export interface ConversationDetail {
  id: string;
  userId: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messages: ConversationMessageDto[];
}

export interface ConversationsListResponse {
  conversations: ConversationSummary[];
}
