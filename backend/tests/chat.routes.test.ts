import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { describe, it } from 'node:test';
import { ConversationBusyError, OllamaError } from '../src/errors.js';
import { FetchAbortedError } from '../src/http/fetch-with-timeout.js';
import { createChatRouter } from '../src/routes/chat.routes.js';
import type { ConversationInput, ConversationService } from '../src/services/conversation.service.js';
import { delay } from './helpers/async.js';

interface FakeResponse extends EventEmitter {
  statusCode: number;
  body: { error?: string; detail?: string } | undefined;
  writableEnded: boolean;
  writableFinished: boolean;
  status(code: number): FakeResponse;
  json(payload: { error?: string; detail?: string }): FakeResponse;
}

function createFakeRes(): FakeResponse {
  const res = new EventEmitter() as FakeResponse;
  res.statusCode = 200;
  res.body = undefined;
  res.writableEnded = false;
  res.writableFinished = false;
  res.status = function (code: number) {
    this.statusCode = code;
    return this;
  };
  res.json = function (payload) {
    this.body = payload;
    this.writableEnded = true;
    this.writableFinished = true;
    return this;
  };
  return res;
}

function createFakeReq(body: unknown): EventEmitter & {
  userId: string;
  body: unknown;
} {
  const req = new EventEmitter() as EventEmitter & {
    userId: string;
    body: unknown;
  };
  req.userId = 'user-route-test';
  req.body = body;
  return req;
}

function getPostHandler(conversationService: Pick<ConversationService, 'chat'>) {
  const router = createChatRouter(conversationService as ConversationService);
  const layer = router.stack.find(
    (entry) => entry.route?.path === '/' && Boolean(entry.route?.methods?.post),
  );
  const handler = layer?.route?.stack[0]?.handle;
  if (typeof handler !== 'function') {
    throw new Error('Handler POST / introuvable');
  }
  return handler as (
    req: EventEmitter & { userId: string; body: unknown },
    res: FakeResponse,
  ) => Promise<void>;
}

describe('createChatRouter', () => {
  it('renvoie 409 si la conversation est occupée', async () => {
    const handler = getPostHandler({
      async chat() {
        throw new ConversationBusyError();
      },
    });
    const req = createFakeReq({
      content: 'Hello',
    });
    const res = createFakeRes();
    await handler(req, res);
    assert.equal(res.statusCode, 409);
    assert.match(res.body?.error ?? '', /génération est déjà en cours/);
  });

  it('refuse le champ messages[]', async () => {
    const handler = getPostHandler({
      async chat() {
        return { conversationId: 'x', messages: [], response: 'nope' };
      },
    });
    const req = createFakeReq({
      messages: [{ role: 'user', content: 'Hello' }],
    });
    const res = createFakeRes();
    await handler(req, res);
    assert.equal(res.statusCode, 400);
    assert.match(res.body?.error ?? '', /messages/);
  });

  it('refuse un content manquant', async () => {
    const handler = getPostHandler({
      async chat() {
        return { conversationId: 'x', messages: [], response: 'nope' };
      },
    });
    const req = createFakeReq({ conversationId: 'abc' });
    const res = createFakeRes();
    await handler(req, res);
    assert.equal(res.statusCode, 400);
    assert.match(res.body?.error ?? '', /content/);
  });

  it('masque le détail Ollama en production', async () => {
    const previous = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';

    try {
      const handler = getPostHandler({
        async chat() {
          throw new OllamaError(
            'Impossible de contacter Ollama (http://secret-host:11434)',
          );
        },
      });
      const req = createFakeReq({
        content: 'Hello',
      });
      const res = createFakeRes();
      await handler(req, res);
      assert.equal(res.statusCode, 502);
      assert.equal(res.body?.detail, undefined);
      assert.equal(res.body?.error?.includes('secret-host'), false);
    } finally {
      if (previous === undefined) {
        delete process.env.NODE_ENV;
      } else {
        process.env.NODE_ENV = previous;
      }
    }
  });

  it('abort la génération si le client coupe la requête', async () => {
    let aborted = false;
    const handler = getPostHandler({
      async chat(input: ConversationInput) {
        await new Promise<void>((_resolve, reject) => {
          const timer = setTimeout(() => {
            reject(new Error('chat mock timeout'));
          }, 2_000);
          input.signal?.addEventListener('abort', () => {
            clearTimeout(timer);
            aborted = true;
            reject(new FetchAbortedError());
          });
        });
        return { conversationId: 'x', messages: [], response: 'never' };
      },
    });

    const req = createFakeReq({
      content: 'Hello',
    });
    const res = createFakeRes();
    const pending = handler(req, res);
    await delay(20);
    res.emit('close');
    await pending;
    assert.equal(aborted, true);
    assert.equal(res.writableEnded, false);
  });
});
