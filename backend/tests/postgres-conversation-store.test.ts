import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, it } from 'node:test';
import type { Pool } from 'pg';
import {
  ConversationService,
  PostgresConversationStore,
} from '../src/conversations/index.js';
import { tryCreateLivePostgresPool } from './helpers/postgres-live.js';

describe('PostgresConversationStore (intégration)', () => {
  let pool: Pool | null = null;
  let service: ConversationService | null = null;
  const prefix = `conv-test-${randomUUID()}`;

  before(async () => {
    pool = await tryCreateLivePostgresPool();
    if (pool) {
      service = new ConversationService(new PostgresConversationStore(pool));
    }
  });

  after(async () => {
    if (!pool) {
      return;
    }

    await pool.query('DELETE FROM users WHERE id LIKE $1', [`${prefix}%`]);
    await pool.end();
  });

  it('crée une conversation et des messages', async (t) => {
    if (!service) {
      t.skip('PostgreSQL non disponible (DATABASE_URL absent ou connexion impossible)');
      return;
    }

    const userId = `${prefix}-user-create`;
    const conversation = await service.createConversation({
      userId,
      title: 'Hello',
    });
    await service.appendMessage({
      conversationId: conversation.id,
      role: 'user',
      content: 'Hello',
    });
    await service.appendMessage({
      conversationId: conversation.id,
      role: 'assistant',
      content: 'Hi',
    });

    const detail = await service.getConversationWithMessages(userId, conversation.id);
    assert.ok(detail);
    assert.equal(detail.messages.length, 2);
    assert.equal(detail.messages[0]?.content, 'Hello');
    assert.equal(detail.messages[1]?.content, 'Hi');
  });

  it('plusieurs conversations + isolation user-A / user-B', async (t) => {
    if (!service) {
      t.skip('PostgreSQL non disponible');
      return;
    }

    const userA = `${prefix}-user-A`;
    const userB = `${prefix}-user-B`;

    const convA1 = await service.createConversation({ userId: userA, title: 'A1' });
    await service.createConversation({ userId: userA, title: 'A2' });
    const convB = await service.createConversation({ userId: userB, title: 'B1' });

    assert.equal((await service.listConversations(userA)).length, 2);
    assert.equal((await service.listConversations(userB)).length, 1);
    assert.equal(await service.getConversation(userB, convA1.id), null);
    assert.equal(await service.getConversation(userA, convB.id), null);
  });

  it('suppression cascade des messages', async (t) => {
    if (!service || !pool) {
      t.skip('PostgreSQL non disponible');
      return;
    }

    const userId = `${prefix}-user-delete`;
    const conversation = await service.createConversation({
      userId,
      title: 'Delete me',
    });
    await service.appendMessage({
      conversationId: conversation.id,
      role: 'user',
      content: 'bye',
    });

    assert.equal(await service.deleteConversation(userId, conversation.id), true);

    const remaining = await pool.query(
      'SELECT COUNT(*)::int AS count FROM messages WHERE conversation_id = $1',
      [conversation.id],
    );
    assert.equal(remaining.rows[0]?.count, 0);
  });

  it('persistance après recréation du store (redémarrage backend)', async (t) => {
    if (!service || !pool) {
      t.skip('PostgreSQL non disponible');
      return;
    }

    const userId = `${prefix}-user-persist`;
    const firstService = new ConversationService(new PostgresConversationStore(pool));
    const created = await firstService.createConversation({
      userId,
      title: 'Persisted',
    });
    await firstService.appendMessage({
      conversationId: created.id,
      role: 'user',
      content: 'toujours là',
    });

    const secondService = new ConversationService(new PostgresConversationStore(pool));
    const found = await secondService.getConversationWithMessages(userId, created.id);

    assert.ok(found);
    assert.equal(found.title, 'Persisted');
    assert.equal(found.messages.length, 1);
    assert.equal(found.messages[0]?.content, 'toujours là');
  });

  it('ordre déterministe des messages (created_at, id)', async (t) => {
    if (!service) {
      t.skip('PostgreSQL non disponible');
      return;
    }

    const userId = `${prefix}-user-order`;
    const conversation = await service.createConversation({
      userId,
      title: 'Order',
    });

    await service.appendMessage({
      conversationId: conversation.id,
      role: 'user',
      content: 'un',
    });
    await service.appendMessage({
      conversationId: conversation.id,
      role: 'assistant',
      content: 'deux',
    });
    await service.appendMessage({
      conversationId: conversation.id,
      role: 'user',
      content: 'trois',
    });

    const listed = await service.listMessages(conversation.id);
    assert.deepEqual(
      listed.map((message) => message.content),
      ['un', 'deux', 'trois'],
    );
  });

  it('deux appendNewMessages simultanés conservent les deux messages distincts', async (t) => {
    if (!service) {
      t.skip('PostgreSQL non disponible');
      return;
    }

    const userId = `${prefix}-user-concurrent-distinct`;
    const conversation = await service.createConversation({
      userId,
      title: 'Concurrent distinct',
    });
    const seed = { role: 'user' as const, content: 'seed' };
    await service.appendMessage({
      conversationId: conversation.id,
      role: seed.role,
      content: seed.content,
    });

    const incomingA = [seed, { role: 'user' as const, content: 'ping-A' }];
    const incomingB = [seed, { role: 'user' as const, content: 'ping-B' }];

    const [createdA, createdB] = await Promise.all([
      service.appendNewMessages(conversation.id, incomingA),
      service.appendNewMessages(conversation.id, incomingB),
    ]);

    const listed = await service.listMessages(conversation.id);
    const contents = listed.map((message) => message.content);

    assert.equal(listed.length, 3);
    assert.equal(contents.filter((content) => content === 'seed').length, 1);
    assert.equal(contents.includes('ping-A'), true);
    assert.equal(contents.includes('ping-B'), true);
    assert.equal(createdA.length + createdB.length, 2);
  });

  it('deux appendNewMessages simultanés identiques ne dupliquent pas', async (t) => {
    if (!service) {
      t.skip('PostgreSQL non disponible');
      return;
    }

    const userId = `${prefix}-user-concurrent-same`;
    const conversation = await service.createConversation({
      userId,
      title: 'Concurrent same',
    });
    const seed = { role: 'user' as const, content: 'seed' };
    await service.appendMessage({
      conversationId: conversation.id,
      role: seed.role,
      content: seed.content,
    });

    const incoming = [seed, { role: 'user' as const, content: 'ping' }];

    await Promise.all([
      service.appendNewMessages(conversation.id, incoming),
      service.appendNewMessages(conversation.id, incoming),
    ]);

    const listed = await service.listMessages(conversation.id);
    assert.equal(listed.length, 2);
    assert.equal(listed[0]?.content, 'seed');
    assert.equal(listed[1]?.content, 'ping');
  });
});
