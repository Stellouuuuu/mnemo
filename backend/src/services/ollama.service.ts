import { env } from '../config/env.js';
import { OllamaError, OllamaTimeoutError } from '../errors.js';
import { AsyncSemaphore } from '../http/async-semaphore.js';
import {
  FetchAbortedError,
  FetchTimeoutError,
  combineAbortSignals,
  fetchWithTimeout,
} from '../http/fetch-with-timeout.js';
import type { OllamaChatMessage } from '../types/chat.js';

interface OllamaChatResponse {
  message?: {
    role: string;
    content: string;
  };
  error?: string;
}

export interface ChatModelOptions {
  timeoutMs?: number;
  signal?: AbortSignal;
}

export type ChatModelClient = (
  messages: OllamaChatMessage[],
  options?: ChatModelOptions,
) => Promise<string>;

const ollamaSemaphore = new AsyncSemaphore(env.OLLAMA_MAX_CONCURRENT);

function capAssistantContent(content: string, maxChars: number): string {
  if (content.length <= maxChars) {
    return content;
  }
  if (maxChars <= 1) {
    return content.slice(0, Math.max(0, maxChars));
  }
  return `${content.slice(0, maxChars - 1)}…`;
}

function throwIfAbortedOrTimedOut(
  options: ChatModelOptions | undefined,
  timeoutSignal: AbortSignal,
  timeoutMs: number,
): void {
  if (options?.signal?.aborted) {
    throw new FetchAbortedError();
  }
  if (timeoutSignal.aborted) {
    throw new OllamaTimeoutError(timeoutMs);
  }
}

/**
 * Envoie des messages déjà construits (system + mémoire + historique) à Ollama.
 */
export async function chatWithOllama(
  messages: OllamaChatMessage[],
  options?: ChatModelOptions,
): Promise<string> {
  const url = `${env.OLLAMA_BASE_URL}/api/chat`;
  const timeoutMs = options?.timeoutMs ?? env.OLLAMA_TIMEOUT_MS;
  const startedAt = Date.now();
  const deadline = new AbortController();
  const deadlineTimer = setTimeout(() => {
    deadline.abort();
  }, timeoutMs);
  const timeoutSignal = deadline.signal;
  const combinedSignal = options?.signal
    ? combineAbortSignals([timeoutSignal, options.signal])
    : timeoutSignal;

  throwIfAbortedOrTimedOut(options, timeoutSignal, timeoutMs);

  let release: (() => void) | undefined;

  try {
    try {
      release = await ollamaSemaphore.acquire(combinedSignal);
    } catch (error) {
      throwIfAbortedOrTimedOut(options, timeoutSignal, timeoutMs);
      if (error instanceof FetchAbortedError) {
        throw new OllamaTimeoutError(timeoutMs);
      }
      throw error;
    }

    throwIfAbortedOrTimedOut(options, timeoutSignal, timeoutMs);

    const remainingMs = Math.max(1, timeoutMs - (Date.now() - startedAt));
    let response: Response;

    try {
      response = await fetchWithTimeout(
        url,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: env.OLLAMA_MODEL,
            messages,
            stream: false,
            options: {
              temperature: env.OLLAMA_TEMPERATURE,
            },
          }),
        },
        remainingMs,
        options?.signal,
      );
    } catch (error) {
      if (error instanceof FetchAbortedError) {
        throwIfAbortedOrTimedOut(options, timeoutSignal, timeoutMs);
        throw error;
      }

      if (error instanceof FetchTimeoutError) {
        throw new OllamaTimeoutError(error.timeoutMs);
      }

      const detail = error instanceof Error ? error.message : 'unknown error';
      throw new OllamaError(
        `Impossible de contacter Ollama (${env.OLLAMA_BASE_URL}): ${detail}`,
      );
    }

    let data: OllamaChatResponse;

    try {
      data = (await response.json()) as OllamaChatResponse;
    } catch {
      throw new OllamaError(`Réponse Ollama invalide (HTTP ${response.status})`);
    }

    if (!response.ok) {
      const detail = data.error ?? response.statusText;
      throw new OllamaError(`Erreur Ollama HTTP ${response.status}: ${detail}`);
    }

    const content = data.message?.content;

    if (typeof content !== 'string' || content.trim() === '') {
      throw new OllamaError('Ollama a renvoyé une réponse vide ou invalide');
    }

    return capAssistantContent(content, env.CHAT_MAX_MESSAGE_CHARS);
  } finally {
    release?.();
    clearTimeout(deadlineTimer);
  }
}
