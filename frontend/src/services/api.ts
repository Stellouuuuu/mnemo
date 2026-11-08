import { createSseParser } from '../lib/sse';
import type { AuthResponse, AuthUser } from '../types/auth';
import type { MemoriesListResponse, MemoryItem } from '../types/memory';
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

export interface ChatStreamHandlers {
  onMeta?: (conversationId: string) => void;
  onDelta: (text: string) => void;
}

/**
 * Envoie un message et reçoit la réponse au fil de l'eau. Retourne le même résultat que
 * `sendChatMessage` une fois la réponse complète.
 */
export async function streamChatMessage(
  content: string,
  conversationId: string | null | undefined,
  handlers: ChatStreamHandlers,
  signal?: AbortSignal,
): Promise<ChatSuccessResponse> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}/api/chat/stream`, {
      method: 'POST',
      credentials: 'include',
      signal,
      headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
      body: JSON.stringify({
        content,
        ...(conversationId ? { conversationId } : {}),
      }),
    });
  } catch {
    throw new ApiError('Impossible de contacter le backend Mnemo.', 0);
  }

  if (!response.ok || !response.body) {
    const data = await parseJsonBody<unknown>(response);
    throwIfErrorResponse(response, data as ChatErrorResponse);
    throw new ApiError('Réponse API invalide.', response.status);
  }

  let result: ChatSuccessResponse | null = null;
  let failure: ApiError | null = null;
  const parser = createSseParser(({ event, data }) => {
    let payload: unknown;
    try {
      payload = JSON.parse(data);
    } catch {
      return;
    }
    if (event === 'meta') {
      handlers.onMeta?.((payload as { conversationId: string }).conversationId);
    } else if (event === 'delta') {
      handlers.onDelta((payload as { text: string }).text);
    } else if (event === 'done') {
      result = payload as ChatSuccessResponse;
    } else if (event === 'error') {
      const body = payload as ChatErrorResponse;
      failure = new ApiError(body.error || 'Erreur pendant la réponse.', 502, body.detail);
    }
  });

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      parser.push(decoder.decode(value, { stream: true }));
    }
  } catch {
    throw new ApiError('La connexion a été interrompue pendant la réponse.', 0);
  }

  if (failure) {
    throw failure;
  }
  if (!result) {
    throw new ApiError('La réponse a été interrompue.', 0);
  }
  return result;
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

export async function listMemories(): Promise<MemoryItem[]> {
  const data = await requestJson<MemoriesListResponse>('/api/memories');
  return data.memories;
}

export async function updateMemory(id: string, value: string): Promise<MemoryItem> {
  const data = await requestJson<{ memory: MemoryItem }>(
    `/api/memories/${encodeURIComponent(id)}`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ value }),
    },
  );
  return data.memory;
}

export async function deleteMemory(id: string): Promise<void> {
  await requestJson<void>(`/api/memories/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export async function clearMemories(): Promise<number> {
  const data = await requestJson<{ deleted: number }>('/api/memories', { method: 'DELETE' });
  return data.deleted;
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
