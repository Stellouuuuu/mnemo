export type MessageRole = 'user' | 'assistant';

export interface ChatMessage {
  id: string;
  role: MessageRole;
  content: string;
}

export interface ChatRequest {
  message: string;
}

export interface ChatSuccessResponse {
  message: string;
  response: string;
}

export interface ChatErrorResponse {
  error: string;
  detail?: string;
}
