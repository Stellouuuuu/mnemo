import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { describe, it } from 'node:test';
import express from 'express';
import { createConversationsRouter } from '../src/routes/conversations.routes.js';
import type { ConversationService } from '../src/conversations/conversation.service.js';

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

function failingHistory(): ConversationService {
  return {
    async listConversations() {
      throw Object.assign(
        new Error('password authentication failed for user "stella"'),
        { code: '28P01' },
      );
    },
    async getConversationWithMessages() {
      throw Object.assign(
        new Error('password authentication failed for user "stella"'),
        { code: '28P01' },
      );
    },
    async deleteConversation() {
      throw Object.assign(
        new Error('password authentication failed for user "stella"'),
        { code: '28P01' },
      );
    },
  } as unknown as ConversationService;
}

describe('conversations.routes — erreurs publiques', () => {
  it('masque error.message PostgreSQL en production', async () => {
    const previous = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';

    const app = express();
    app.use((req, _res, next) => {
      req.userId = 'user-a';
      next();
    });
    app.use('/api/conversations', createConversationsRouter(failingHistory()));

    const { baseUrl, server } = await listen(app);

    try {
      const response = await fetch(`${baseUrl}/api/conversations`);
      assert.equal(response.status, 503);
      const body = (await response.json()) as { error?: string; detail?: string };
      assert.equal(body.detail, undefined);
      assert.equal(body.error?.includes('password'), false);
      assert.equal(body.error?.includes('stella'), false);
      assert.match(body.error ?? '', /stockage|indisponible|conversations/i);
    } finally {
      await closeServer(server);
      if (previous === undefined) {
        delete process.env.NODE_ENV;
      } else {
        process.env.NODE_ENV = previous;
      }
    }
  });
});
