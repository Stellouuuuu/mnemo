import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, it } from 'node:test';
import type { Pool } from 'pg';
import {
  ConversationService as ConversationHistoryService,
  PostgresConversationStore,
} from '../src/conversations/index.js';
import { ConversationBusyError, OllamaTimeoutError } from '../src/errors.js';
import { InMemoryMemoryStore, MemoryService, NoOpMemoryExtractor } from '../src/memory/index.js';
import { ConversationService } from '../src/services/conversation.service.js';
import { waitFor } from './helpers/async.js';
import { tryCreateLivePostgresPool } from './helpers/postgres-live.js';

describe('ConversationService + Postgres — génération concurrente', () => {
  let pool: Pool | null = null;
  const prefix = `engine-test-${randomUUID()}`;

  before(async () => {
    pool = await tryCreateLivePostgresPool();
  });

  after(async () => {
    if (!pool) {
      return;
    }

    await pool.query('DELETE FROM users WHERE id LIKE $1', [`${prefix}%`]);
    await pool.end();
  });

  it('un seul assistant si deux chat() simultanés sur la même conversation', async (t) => {
    if (!pool) {
      t.skip('PostgreSQL non disponible');
      return;
    }

    const userId = `${prefix}-user-busy`;
    const history = new ConversationHistoryService(new PostgresConversationStore(pool));
    await history.ensureUser(userId);
    const conversation = await history.createConversation({
      userId,
      title: 'Busy',
    });

    let entered = 0;
    let releaseGate!: () => void;
    const gate = new Promise<void>((resolve) => {
      releaseGate = resolve;
    });

    const conversationService = new ConversationService(
      new MemoryService(new InMemoryMemoryStore()),
      async () => {
        entered += 1;
        await gate;
        return 'un-seul-assistant';
      },
      new NoOpMemoryExtractor(),
      history,
    );

    const first = conversationService.chat({
      userId,
      conversationId: conversation.id,
      content: 'alpha',
    });

    await waitFor(() => entered === 1);

    await assert.rejects(
      () =>
        conversationService.chat({
          userId,
          conversationId: conversation.id,
          content: 'beta',
        }),
      (error: unknown) => error instanceof ConversationBusyError,
    );

    releaseGate();
    const result = await first;
    assert.equal(result.response, 'un-seul-assistant');

    const stored = await history.listMessages(conversation.id);
    assert.equal(stored.filter((message) => message.role === 'assistant').length, 1);
    assert.equal(stored.some((message) => message.content === 'beta'), false);
    assert.equal(stored.filter((message) => message.content === 'alpha').length, 1);
  });

  it('retry après timeout : même content → 1 user et 1 assistant', async (t) => {
    if (!pool) {
      t.skip('PostgreSQL non disponible');
      return;
    }

    const userId = `${prefix}-user-retry`;
    const history = new ConversationHistoryService(new PostgresConversationStore(pool));
    let attempts = 0;
    const conversationService = new ConversationService(
      new MemoryService(new InMemoryMemoryStore()),
      async () => {
        attempts += 1;
        if (attempts === 1) {
          throw new OllamaTimeoutError(1_000);
        }
        return 'assistant-retry';
      },
      new NoOpMemoryExtractor(),
      history,
    );

    await assert.rejects(
      () =>
        conversationService.chat({
          userId,
          content: 'hello-retry',
        }),
      (error: unknown) => error instanceof OllamaTimeoutError,
    );

    const conversations = await history.listConversations(userId);
    assert.equal(conversations.length, 1);
    const conversationId = conversations[0]!.id;

    const result = await conversationService.chat({
      userId,
      conversationId,
      content: 'hello-retry',
    });

    assert.equal(result.response, 'assistant-retry');
    const stored = await history.listMessages(conversationId);
    assert.equal(stored.filter((message) => message.role === 'user').length, 1);
    assert.equal(stored.filter((message) => message.role === 'assistant').length, 1);
    assert.equal(stored[0]?.content, 'hello-retry');
    assert.equal(stored[1]?.content, 'assistant-retry');
  });
});
