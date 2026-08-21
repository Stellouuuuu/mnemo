import type { ChatErrorResponse, ChatSuccessResponse } from '../types/chat';

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000';

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

export async function sendChatMessage(
  message: string,
): Promise<ChatSuccessResponse> {
  let response: Response;

  try {
    response = await fetch(`${API_BASE_URL}/api/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ message }),
    });
  } catch {
    throw new ApiError(
      'Impossible de contacter le backend STELLA.',
      0,
    );
  }

  let data: ChatSuccessResponse | ChatErrorResponse;

  try {
    data = (await response.json()) as ChatSuccessResponse | ChatErrorResponse;
  } catch {
    throw new ApiError('Réponse API invalide.', response.status);
  }

  if (!response.ok) {
    const errorBody = data as ChatErrorResponse;
    throw new ApiError(
      errorBody.error || `Erreur HTTP ${response.status}`,
      response.status,
      errorBody.detail,
    );
  }

  return data as ChatSuccessResponse;
}

export function getApiBaseUrl(): string {
  return API_BASE_URL;
}
