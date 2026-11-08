import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseChatMessages, parseChatUserContent } from '../src/chat/parse-messages.js';
import { selectRecentChatMessages } from '../src/chat/history-window.js';
import {
  httpErrorFromUnknown,
  isEntityTooLarge,
  isStorageFailure,
  jsonApiErrorHandler,
  ConversationBusyError,
  OllamaError,
  OllamaTimeoutError,
  StorageError,
  toPublicErrorBody,
} from '../src/errors.js';
import {
  FetchAbortedError,
  FetchTimeoutError,
  fetchWithTimeout,
  isAbortOrTimeoutError,
} from '../src/http/fetch-with-timeout.js';
import {
  InMemoryMemoryStore,
  MemoryService,
  NoOpMemoryExtractor,
} from '../src/memory/index.js';
import {
  ConversationService as ConversationHistoryService,
  InMemoryConversationStore,
} from '../src/conversations/index.js';
import { ConversationService } from '../src/services/conversation.service.js';
import { checkOllama, checkPostgres, buildHealthReport, toPublicHealthReport } from '../src/services/health.service.js';
import type { ChatMessage, OllamaChatMessage } from '../src/types/chat.js';

describe('httpErrorFromUnknown — Postgres vs Ollama', () => {
  it('mappe OllamaError vers 502', () => {
    const mapped = httpErrorFromUnknown(new OllamaError('down'));
    assert.equal(mapped.status, 502);
    assert.match(mapped.error, /modèle local/);
    assert.equal(mapped.detail, 'down');
  });

  it('mappe OllamaTimeoutError vers 504', () => {
    const mapped = httpErrorFromUnknown(new OllamaTimeoutError(60_000));
    assert.equal(mapped.status, 504);
    assert.match(mapped.error, /délai/);
  });

  it('mappe ConversationBusyError vers 409', () => {
    const mapped = httpErrorFromUnknown(new ConversationBusyError());
    assert.equal(mapped.status, 409);
    assert.match(mapped.error, /génération est déjà en cours/);
  });

  it('toPublicErrorBody masque le détail en production', () => {
    const mapped = httpErrorFromUnknown(
      new OllamaError('Impossible de contacter Ollama (http://secret:11434)'),
    );
    const hidden = toPublicErrorBody(mapped, false);
    assert.equal(hidden.detail, undefined);
    assert.equal(hidden.error, mapped.error);
    const shown = toPublicErrorBody(mapped, true);
    assert.match(shown.detail ?? '', /secret/);
  });

  it('mappe StorageError et erreurs pg vers 503', () => {
    assert.equal(httpErrorFromUnknown(new StorageError('pg down')).status, 503);

    const pgError = Object.assign(new Error('connection refused'), {
      code: 'ECONNREFUSED',
    });
    assert.equal(isStorageFailure(pgError), true);
    assert.equal(httpErrorFromUnknown(pgError).status, 503);

    const sqlState = Object.assign(new Error('db shutdown'), { code: '57P01' });
    assert.equal(isStorageFailure(sqlState), true);
    assert.equal(httpErrorFromUnknown(sqlState).status, 503);
  });

  it('ne classe pas une erreur générique comme panne Ollama', () => {
    const mapped = httpErrorFromUnknown(new Error('bug inattendu'));
    assert.equal(mapped.status, 500);
    assert.match(mapped.error, /interne/);
  });

  it('détecte un body JSON trop volumineux', () => {
    assert.equal(isEntityTooLarge({ type: 'entity.too.large', status: 413 }), true);
    assert.equal(isEntityTooLarge(new Error('nope')), false);
  });
});

describe('jsonApiErrorHandler', () => {
  it('renvoie 500 JSON et masque le détail en production', () => {
    const previous = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';

    try {
      let statusCode = 0;
      let body: { error?: string; detail?: string } | undefined;
      const res = {
        headersSent: false,
        status(code: number) {
          statusCode = code;
          return this;
        },
        json(payload: { error?: string; detail?: string }) {
          body = payload;
        },
      };

      jsonApiErrorHandler(
        new Error('secret-stack'),
        {} as never,
        res as never,
        () => undefined,
      );

      assert.equal(statusCode, 500);
      assert.equal(body?.error, 'Erreur interne du serveur.');
      assert.equal(body?.detail, undefined);
    } finally {
      if (previous === undefined) {
        delete process.env.NODE_ENV;
      } else {
        process.env.NODE_ENV = previous;
      }
    }
  });

  it('inclut le détail hors production', () => {
    const previous = process.env.NODE_ENV;
    process.env.NODE_ENV = 'test';

    try {
      let statusCode = 0;
      let body: { error?: string; detail?: string } | undefined;
      const res = {
        headersSent: false,
        status(code: number) {
          statusCode = code;
          return this;
        },
        json(payload: { error?: string; detail?: string }) {
          body = payload;
        },
      };

      jsonApiErrorHandler(
        new Error('visible-en-dev'),
        {} as never,
        res as never,
        () => undefined,
      );

      assert.equal(statusCode, 500);
      assert.equal(body?.detail, 'visible-en-dev');
    } finally {
      if (previous === undefined) {
        delete process.env.NODE_ENV;
      } else {
        process.env.NODE_ENV = previous;
      }
    }
  });
});

describe('parseChatMessages — limite de taille', () => {
  it('accepte un message sous la limite', () => {
    const parsed = parseChatMessages(
      [{ role: 'user', content: 'Bonjour' }],
      8_000,
    );
    assert.equal(parsed.ok, true);
  });

  it('rejette un message trop long', () => {
    const parsed = parseChatMessages(
      [{ role: 'user', content: 'a'.repeat(21) }],
      20,
    );
    assert.equal(parsed.ok, false);
    if (!parsed.ok) {
      assert.match(parsed.error, /dépasse la limite de 20 caractères/);
    }
  });

  it('conserve les validations existantes (tableau vide, rôle)', () => {
    assert.equal(parseChatMessages([]).ok, false);
    const badRole = parseChatMessages([{ role: 'system', content: 'x' }]);
    assert.equal(badRole.ok, false);
  });

  it('accepte 50 messages et refuse le 51e', () => {
    const fifty = Array.from({ length: 50 }, (_, index) => ({
      role: 'user' as const,
      content: `m${index}`,
    }));
    assert.equal(parseChatMessages(fifty, 8_000, 50).ok, true);

    const fiftyOne = [...fifty, { role: 'user' as const, content: 'overflow' }];
    const parsed = parseChatMessages(fiftyOne, 8_000, 50);
    assert.equal(parsed.ok, false);
    if (!parsed.ok) {
      assert.match(parsed.error, /limite de 50/);
    }
  });
});

describe('parseChatUserContent — contrat content', () => {
  it('accepte un content sous la limite', () => {
    const parsed = parseChatUserContent('Bonjour', 8_000);
    assert.equal(parsed.ok, true);
    if (parsed.ok) {
      assert.equal(parsed.content, 'Bonjour');
    }
  });

  it('rejette un content trop long', () => {
    const parsed = parseChatUserContent('a'.repeat(21), 20);
    assert.equal(parsed.ok, false);
    if (!parsed.ok) {
      assert.match(parsed.error, /dépasse la limite de 20 caractères/);
    }
  });

  it('rejette un content vide ou absent', () => {
    assert.equal(parseChatUserContent('').ok, false);
    assert.equal(parseChatUserContent('   ').ok, false);
    assert.equal(parseChatUserContent(undefined).ok, false);
    assert.equal(parseChatUserContent(['x']).ok, false);
  });
});

describe('selectRecentChatMessages — fenêtre d’historique', () => {
  it('ne coupe pas un historique court', () => {
    const messages: ChatMessage[] = [
      { role: 'user', content: 'a' },
      { role: 'assistant', content: 'b' },
    ];
    assert.deepEqual(selectRecentChatMessages(messages, 40), messages);
  });

  it('garde les N derniers messages', () => {
    const messages: ChatMessage[] = [];
    for (let index = 0; index < 50; index += 1) {
      messages.push({ role: 'user', content: `u${index}` });
      messages.push({ role: 'assistant', content: `a${index}` });
    }

    const window = selectRecentChatMessages(messages, 40);
    assert.equal(window.length, 40);
    assert.equal(window[0]?.content, 'u30');
    assert.equal(window.at(-1)?.content, 'a49');
  });

  it('évite de commencer la fenêtre par un message assistant', () => {
    const messages: ChatMessage[] = [
      { role: 'user', content: 'u0' },
      { role: 'assistant', content: 'a0' },
      { role: 'user', content: 'u1' },
    ];
    const window = selectRecentChatMessages(messages, 2);
    assert.deepEqual(window, [{ role: 'user', content: 'u1' }]);
  });

  it('respecte un budget de caractères en gardant les messages récents', () => {
    const messages: ChatMessage[] = [];
    for (let index = 0; index < 10; index += 1) {
      messages.push({ role: 'user', content: 'x'.repeat(5_000) });
    }

    const window = selectRecentChatMessages(messages, 40, 16_000);
    assert.ok(window.length <= 3);
    assert.equal(window.at(-1)?.content.length, 5_000);
    const total = window.reduce((sum, message) => sum + message.content.length, 0);
    assert.ok(total <= 16_000);
  });

  it('ne tronque pas le dernier message même hors budget', () => {
    const messages: ChatMessage[] = [
      { role: 'user', content: 'ancien' },
      { role: 'user', content: 'y'.repeat(100) },
    ];
    const window = selectRecentChatMessages(messages, 40, 10);
    assert.equal(window.length, 1);
    assert.equal(window[0]?.content.length, 100);
  });
});

describe('ConversationService — historique tronqué pour Ollama seulement', () => {
  it('n’envoie au modèle que la fenêtre récente, tout en persistant l’historique', async () => {
    const memoryService = new MemoryService(new InMemoryMemoryStore());
    const history = new ConversationHistoryService(new InMemoryConversationStore());
    let captured: OllamaChatMessage[] = [];

    const conversationService = new ConversationService(
      memoryService,
      async (messages) => {
        captured = messages;
        return 'ok';
      },
      new NoOpMemoryExtractor(),
      history,
    );

    await history.ensureUser('user-window');
    const conversation = await history.createConversation({
      userId: 'user-window',
      title: 'window',
    });

    const longHistory: ChatMessage[] = [];
    for (let index = 0; index < 30; index += 1) {
      longHistory.push({ role: 'user', content: `u${index}` });
      longHistory.push({ role: 'assistant', content: `a${index}` });
    }
    await history.appendNewMessages(conversation.id, longHistory);

    const result = await conversationService.chat({
      userId: 'user-window',
      conversationId: conversation.id,
      content: 'dernier',
    });

    const historySent = captured.filter((message) => message.role !== 'system');
    assert.ok(historySent.length <= 40);
    assert.equal(historySent.at(-1)?.content, 'dernier');
    assert.equal(result.messages.length, longHistory.length + 2);
    assert.equal(result.messages[0]?.content, 'u0');
    assert.equal(result.messages.at(-2)?.content, 'dernier');
  });
});

describe('health checks', () => {
  it('marque postgres skipped sans pool', async () => {
    const result = await checkPostgres(undefined);
    assert.equal(result.status, 'skipped');
  });

  it('marque ollama en erreur si le daemon est injoignable', async () => {
    const result = await checkOllama('http://127.0.0.1:9', 200);
    assert.equal(result.status, 'error');
    assert.ok(result.detail);
  });

  it('buildHealthReport est ok si postgres skipped et ollama ok', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ models: [] }), { status: 200 })) as typeof fetch;

    try {
      const report = await buildHealthReport(undefined);
      assert.equal(report.status, 'ok');
      assert.equal(report.checks.postgres.status, 'skipped');
      assert.equal(report.checks.ollama.status, 'ok');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('buildHealthReport est error si ollama est down', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => {
      throw new FetchTimeoutError(3000);
    }) as typeof fetch;

    try {
      const report = await buildHealthReport(undefined);
      assert.equal(report.status, 'error');
      assert.equal(report.checks.ollama.status, 'error');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('toPublicHealthReport n’expose aucun détail interne', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => {
      throw new FetchTimeoutError(3000);
    }) as typeof fetch;

    const pool = {
      async query() {
        throw Object.assign(
          new Error('password authentication failed for user "stella"'),
          { code: '28P01' },
        );
      },
    };

    try {
      const report = await buildHealthReport(pool as never);
      const publicReport = toPublicHealthReport(report);
      const serialized = JSON.stringify(publicReport);
      assert.equal(publicReport.status, 'error');
      assert.equal(publicReport.checks.postgres.status, 'error');
      assert.equal(publicReport.checks.ollama.status, 'error');
      assert.equal('detail' in publicReport.checks.postgres, false);
      assert.equal('detail' in publicReport.checks.ollama, false);
      assert.equal(serialized.includes('password'), false);
      assert.equal(serialized.includes('authentication failed'), false);
      assert.equal(serialized.includes('28P01'), false);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

describe('FetchTimeoutError', () => {
  it('reconnaît AbortError / TimeoutError', () => {
    assert.equal(isAbortOrTimeoutError({ name: 'AbortError' }), true);
    assert.equal(isAbortOrTimeoutError({ name: 'TimeoutError' }), true);
    assert.equal(isAbortOrTimeoutError(new Error('nope')), false);
  });
});

describe('fetchWithTimeout — abort vs timeout', () => {
  it('lève FetchAbortedError si le signal externe est déjà aborté', async () => {
    const controller = new AbortController();
    controller.abort();
    await assert.rejects(
      () => fetchWithTimeout('http://127.0.0.1:9', { method: 'GET' }, 1_000, controller.signal),
      (error: unknown) => error instanceof FetchAbortedError,
    );
  });

  it('lève FetchTimeoutError si le délai expire', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (_url, init) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          const aborted = new Error('aborted');
          aborted.name = 'AbortError';
          reject(aborted);
        });
      })) as typeof fetch;

    try {
      await assert.rejects(
        () => fetchWithTimeout('http://example.invalid', { method: 'GET' }, 30),
        (error: unknown) => error instanceof FetchTimeoutError,
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
