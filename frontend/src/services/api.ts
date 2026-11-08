import type { AuthResponse, AuthUser } from '../types/auth';
import type {
  ChatErrorResponse,
  ChatSuccessResponse,
  ConversationDetail,
  ConversationSummary,
  ConversationsListResponse,
} from '../types/chat';

export const DEFAULT_API_BASE_URL = 'http://localhost:3001';

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ?? DEFAULT_API_BASE_URL;

export class ApiError extends Error {
  readonly status: number;
  readonly detail?: string;

  constructor(message: string, status: number, detail?: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.detail = detail;
  }
}

async function parseJsonBody<T>(response: Response): Promise<T | ChatErrorResponse> {
  try {
    return (await response.json()) as T | ChatErrorResponse;
  } catch {
    throw new ApiError('Réponse API invalide.', response.status);
  }
}

function throwIfErrorResponse(
  response: Response,
  data: ChatErrorResponse | Record<string, unknown>,
): void {
  if (!response.ok) {
    const errorBody = data as ChatErrorResponse;
    throw new ApiError(
      errorBody.error || `Erreur HTTP ${response.status}`,
      response.status,
      errorBody.detail,
    );
  }
}

async function requestJson<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  let response: Response;

  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      credentials: 'include',
      ...init,
      headers: {
        ...init?.headers,
      },
    });
  } catch {
    throw new ApiError('Impossible de contacter le backend Mnemo.', 0);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  const data = await parseJsonBody<T>(response);
  throwIfErrorResponse(response, data as ChatErrorResponse);
  return data as T;
}

export async function registerUser(
  email: string,
  password: string,
  displayName?: string,
): Promise<AuthUser> {
  const data = await requestJson<AuthResponse>('/api/auth/register', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      email,
      password,
      ...(displayName ? { displayName } : {}),
    }),
  });
  return data.user;
}

export async function loginUser(email: string, password: string): Promise<AuthUser> {
  const data = await requestJson<AuthResponse>('/api/auth/login', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email, password }),
  });
  return data.user;
}

export async function logoutUser(): Promise<void> {
  await requestJson<void>('/api/auth/logout', { method: 'POST' });
}

export async function getCurrentUser(): Promise<AuthUser> {
  const data = await requestJson<AuthResponse>('/api/auth/me');
  return data.user;
}

export async function sendChatMessage(
  content: string,
  conversationId?: string | null,
): Promise<ChatSuccessResponse> {
  return requestJson<ChatSuccessResponse>('/api/chat', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      content,
      ...(conversationId ? { conversationId } : {}),
    }),
  });
}

export async function listConversations(): Promise<ConversationSummary[]> {
  const data = await requestJson<ConversationsListResponse>('/api/conversations');
  return data.conversations;
}

export async function getConversation(
  conversationId: string,
): Promise<ConversationDetail> {
  return requestJson<ConversationDetail>(
    `/api/conversations/${encodeURIComponent(conversationId)}`,
  );
}

export async function deleteConversation(conversationId: string): Promise<void> {
  await requestJson<void>(
    `/api/conversations/${encodeURIComponent(conversationId)}`,
    { method: 'DELETE' },
  );
}

export function getApiBaseUrl(): string {
  return API_BASE_URL;
}

export function isUnauthorizedError(error: unknown): error is ApiError {
  return error instanceof ApiError && error.status === 401;
}

export function isNetworkError(error: unknown): error is ApiError {
  return error instanceof ApiError && error.status === 0;
}
