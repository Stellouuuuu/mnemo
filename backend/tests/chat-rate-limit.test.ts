import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { describe, it } from 'node:test';
import express from 'express';
import {
  CHAT_RATE_LIMIT_MESSAGE,
  createChatRateLimiter,
} from '../src/middleware/chat-rate-limit.js';
import { createAuthRouter } from '../src/routes/auth.routes.js';
import { createChatRouter } from '../src/routes/chat.routes.js';
import type { ConversationService } from '../src/services/conversation.service.js';

async function listen(app: express.Express): Promise<{ baseUrl: string; server: Server }> {
  const server = createServer(app);
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve());
  });
  const address = server.address() as AddressInfo;
  return { baseUrl: `http://127.0.0.1:${address.port}`, server };
}

function closeServer(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

function fakeChatService(): Pick<ConversationService, 'chat'> {
  return {
    async chat() {
      return {
        conversationId: 'conv-1',
        messages: [{ role: 'user', content: 'Bonjour' }, { role: 'assistant', content: 'ok' }],
        response: 'ok',
      };
    },
  };
}

function chatApp(userIdFromHeader = true): express.Express {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    if (userIdFromHeader) {
      const header = req.headers['x-user-id'];
      req.userId = typeof header === 'string' ? header : 'user-a';
    }
    next();
  });
  app.use(
    '/api/chat',
    createChatRateLimiter({ windowMs: 60_000, limit: 2, validate: false }),
    createChatRouter(fakeChatService() as ConversationService),
  );
  app.use('/api/auth', createAuthRouter(null, { rateLimiter: (_req, _res, next) => next() }));
  return app;
}

describe('rate limit POST /api/chat', () => {
  it('laisse passer plusieurs requêtes sous la limite', async () => {
    const { baseUrl, server } = await listen(chatApp());
    try {
      const first = await fetch(`${baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-user-id': 'user-a' },
        body: JSON.stringify({ content: 'Bonjour' }),
      });
      const second = await fetch(`${baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-user-id': 'user-a' },
        body: JSON.stringify({ content: 'Bonjour' }),
      });
      assert.equal(first.status, 200);
      assert.equal(second.status, 200);
    } finally {
      await closeServer(server);
    }
  });

  it('renvoie 429 avec un corps d’erreur public au-delà de la limite', async () => {
    const { baseUrl, server } = await listen(chatApp());
    try {
      await fetch(`${baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-user-id': 'user-a' },
        body: JSON.stringify({ content: 'Bonjour' }),
      });
      await fetch(`${baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-user-id': 'user-a' },
        body: JSON.stringify({ content: 'Bonjour' }),
      });
      const limited = await fetch(`${baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-user-id': 'user-a' },
        body: JSON.stringify({ content: 'Bonjour' }),
      });
      assert.equal(limited.status, 429);
      const body = (await limited.json()) as { error?: string; detail?: string };
      assert.equal(body.error, CHAT_RATE_LIMIT_MESSAGE.error);
      assert.equal(body.detail, undefined);
    } finally {
      await closeServer(server);
    }
  });

  it('n’applique pas le quota chat à login/register', async () => {
    const { baseUrl, server } = await listen(chatApp());
    try {
      for (let index = 0; index < 3; index += 1) {
        await fetch(`${baseUrl}/api/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-user-id': 'user-a' },
          body: JSON.stringify({ content: 'Bonjour' }),
        });
      }
      const login = await fetch(`${baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'ada@example.test', password: 'password1' }),
      });
      assert.equal(login.status, 503);
      const body = (await login.json()) as { error?: string };
      assert.match(body.error ?? '', /PostgreSQL/);
    } finally {
      await closeServer(server);
    }
  });

  it('isole le quota par userId', async () => {
    const { baseUrl, server } = await listen(chatApp());
    try {
      await fetch(`${baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-user-id': 'user-a' },
        body: JSON.stringify({ content: 'Bonjour' }),
      });
      await fetch(`${baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-user-id': 'user-a' },
        body: JSON.stringify({ content: 'Bonjour' }),
      });
      const limitedA = await fetch(`${baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-user-id': 'user-a' },
        body: JSON.stringify({ content: 'Bonjour' }),
      });
      const firstB = await fetch(`${baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-user-id': 'user-b' },
        body: JSON.stringify({ content: 'Bonjour' }),
      });
      assert.equal(limitedA.status, 429);
      assert.equal(firstB.status, 200);
    } finally {
      await closeServer(server);
    }
  });
});
