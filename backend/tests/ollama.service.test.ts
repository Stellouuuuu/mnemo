import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { env } from '../src/config/env.js';
import { OllamaError, OllamaTimeoutError } from '../src/errors.js';
import { FetchAbortedError } from '../src/http/fetch-with-timeout.js';
import { chatWithOllama } from '../src/services/ollama.service.js';
import { delay } from './helpers/async.js';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('chatWithOllama', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('retourne le contenu assistant', async () => {
    globalThis.fetch = (async () =>
      jsonResponse({ message: { role: 'assistant', content: 'Bonjour' } })) as typeof fetch;

    const content = await chatWithOllama([{ role: 'user', content: 'Salut' }]);
    assert.equal(content, 'Bonjour');
  });

  it('rejette une réponse vide', async () => {
    globalThis.fetch = (async () =>
      jsonResponse({ message: { role: 'assistant', content: '   ' } })) as typeof fetch;

    await assert.rejects(
      () => chatWithOllama([{ role: 'user', content: 'Salut' }]),
      (error: unknown) => error instanceof OllamaError && /vide/.test(error.message),
    );
  });

  it('mappe une erreur HTTP Ollama', async () => {
    globalThis.fetch = (async () =>
      jsonResponse({ error: 'model not found' }, 404)) as typeof fetch;

    await assert.rejects(
      () => chatWithOllama([{ role: 'user', content: 'Salut' }]),
      (error: unknown) => error instanceof OllamaError && /HTTP 404/.test(error.message),
    );
  });

  it('mappe un timeout fetch vers OllamaTimeoutError', async () => {
    globalThis.fetch = (async (_url, init) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          const aborted = new Error('aborted');
          aborted.name = 'AbortError';
          reject(aborted);
        });
      })) as typeof fetch;

    await assert.rejects(
      () => chatWithOllama([{ role: 'user', content: 'Salut' }], { timeoutMs: 40 }),
      (error: unknown) => error instanceof OllamaTimeoutError,
    );
  });

  it('propage l’abort client sans le masquer en timeout', async () => {
    globalThis.fetch = (async (_url, init) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          const aborted = new Error('aborted');
          aborted.name = 'AbortError';
          reject(aborted);
        });
      })) as typeof fetch;

    const controller = new AbortController();
    const pending = chatWithOllama([{ role: 'user', content: 'Salut' }], {
      timeoutMs: 5_000,
      signal: controller.signal,
    });
    await delay(20);
    controller.abort();

    await assert.rejects(
      pending,
      (error: unknown) => error instanceof FetchAbortedError,
    );
  });

  it('tronque une réponse plus longue que CHAT_MAX_MESSAGE_CHARS', async () => {
    const huge = 'z'.repeat(env.CHAT_MAX_MESSAGE_CHARS + 50);
    globalThis.fetch = (async () =>
      jsonResponse({ message: { role: 'assistant', content: huge } })) as typeof fetch;

    const content = await chatWithOllama([{ role: 'user', content: 'Salut' }]);
    assert.equal(content.length, env.CHAT_MAX_MESSAGE_CHARS);
    assert.equal(content.endsWith('…'), true);
  });

  it('ne lance pas plus de OLLAMA_MAX_CONCURRENT fetches en parallèle', async () => {
    let inFlight = 0;
    let maxInFlight = 0;

    globalThis.fetch = (async () => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await delay(60);
      inFlight -= 1;
      return jsonResponse({ message: { role: 'assistant', content: 'ok' } });
    }) as typeof fetch;

    await Promise.all([
      chatWithOllama([{ role: 'user', content: 'a' }]),
      chatWithOllama([{ role: 'user', content: 'b' }]),
      chatWithOllama([{ role: 'user', content: 'c' }]),
    ]);

    assert.equal(maxInFlight, env.OLLAMA_MAX_CONCURRENT);
  });

  it('envoie la température configurée dans options', async () => {
    let body: Record<string, unknown> | undefined;
    globalThis.fetch = (async (_url, init) => {
      body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return jsonResponse({ message: { role: 'assistant', content: 'ok' } });
    }) as typeof fetch;

    await chatWithOllama([{ role: 'user', content: 'Salut' }]);

    const options = body?.options as { temperature?: number } | undefined;
    assert.equal(options?.temperature, env.OLLAMA_TEMPERATURE);
    assert.equal(env.OLLAMA_TEMPERATURE, 0.4);
  });
});
