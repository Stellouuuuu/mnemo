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

export type ChatModelStreamClient = (
  messages: OllamaChatMessage[],
  options?: ChatModelOptions,
) => AsyncGenerator<string, void, undefined>;

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

interface OllamaStreamChunk {
  message?: { content?: string };
  error?: string;
  done?: boolean;
}

/**
 * Même appel qu'au-dessus, mais en flux : produit chaque fragment de texte dès qu'Ollama
 * l'écrit. `timeoutMs` s'applique à l'attente du premier fragment puis entre deux fragments,
 * pas à la durée totale (une longue réponse ne doit pas être coupée tant qu'elle avance).
 */
export async function* streamChatWithOllama(
  messages: OllamaChatMessage[],
  options?: ChatModelOptions,
): AsyncGenerator<string, void, undefined> {
  const timeoutMs = options?.timeoutMs ?? env.OLLAMA_TIMEOUT_MS;
  if (options?.signal?.aborted) {
    throw new FetchAbortedError();
  }

  const controller = new AbortController();
  let timedOut = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const arm = () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);
  };
  const onClientAbort = () => controller.abort();
  options?.signal?.addEventListener('abort', onClientAbort, { once: true });

  const fail = (error: unknown): never => {
    if (error instanceof OllamaError) {
      throw error;
    }
    if (timedOut) {
      throw new OllamaTimeoutError(timeoutMs);
    }
    if (options?.signal?.aborted || controller.signal.aborted) {
      throw new FetchAbortedError();
    }
    const detail = error instanceof Error ? error.message : 'unknown error';
    throw new OllamaError(`Impossible de contacter Ollama (${env.OLLAMA_BASE_URL}): ${detail}`);
  };

  let release: (() => void) | undefined;
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;

  try {
    arm();
    try {
      release = await ollamaSemaphore.acquire(controller.signal);
    } catch (error) {
      return fail(error);
    }

    let response: Response;
    try {
      response = await fetch(`${env.OLLAMA_BASE_URL}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: env.OLLAMA_MODEL,
          messages,
          stream: true,
          options: { temperature: env.OLLAMA_TEMPERATURE },
        }),
        signal: controller.signal,
      });
    } catch (error) {
      return fail(error);
    }

    if (!response.ok || !response.body) {
      let detail = response.statusText;
      try {
        detail = ((await response.json()) as OllamaChatResponse).error ?? detail;
      } catch {
        // le corps n'est pas du JSON : on garde le statut HTTP
      }
      throw new OllamaError(`Erreur Ollama HTTP ${response.status}: ${detail}`);
    }

    reader = response.body.getReader();
    const decoder = new TextDecoder();
    const maxChars = env.CHAT_MAX_MESSAGE_CHARS;
    let pending = '';
    let emitted = 0;
    let finished = false;

    const handleLine = (line: string): string => {
      let chunk: OllamaStreamChunk;
      try {
        chunk = JSON.parse(line) as OllamaStreamChunk;
      } catch {
        throw new OllamaError('Réponse Ollama invalide (flux illisible)');
      }
      if (chunk.error) {
        throw new OllamaError(`Erreur Ollama: ${chunk.error}`);
      }
      if (chunk.done) {
        finished = true;
      }
      return chunk.message?.content ?? '';
    };

    while (!finished) {
      let read: ReadableStreamReadResult<Uint8Array>;
      try {
        read = await reader.read();
      } catch (error) {
        return fail(error);
      }
      arm();
      if (read.done) {
        break;
      }

      pending += decoder.decode(read.value, { stream: true });
      let newline = pending.indexOf('\n');
      while (newline !== -1) {
        const line = pending.slice(0, newline).trim();
        pending = pending.slice(newline + 1);
        newline = pending.indexOf('\n');
        if (line === '') {
          continue;
        }

        let text = handleLine(line);
        if (text === '') {
          continue;
        }
        if (emitted + text.length > maxChars) {
          text = text.slice(0, Math.max(0, maxChars - emitted - 1)) + '…';
          finished = true;
        }
        emitted += text.length;
        yield text;
        if (finished) {
          break;
        }
      }
    }

    if (emitted === 0) {
      throw new OllamaError('Ollama a renvoyé une réponse vide ou invalide');
    }
  } finally {
    clearTimeout(timer);
    options?.signal?.removeEventListener('abort', onClientAbort);
    await reader?.cancel().catch(() => undefined);
    release?.();
  }
}
