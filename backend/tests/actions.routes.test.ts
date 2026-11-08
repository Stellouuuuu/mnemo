import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { after, before, describe, it } from 'node:test';
import express from 'express';
import {
  ConversationService as ConversationHistoryService,
  InMemoryConversationStore,
} from '../src/conversations/index.js';
import { InMemoryKnowledgeStore, KnowledgeService } from '../src/knowledge/index.js';
import { InMemoryMemoryStore, MemoryService } from '../src/memory/index.js';
import { createActionsRouter } from '../src/routes/actions.routes.js';
import { InMemoryAuditStore, ToolRuntime, createTools } from '../src/tools/index.js';
import { FakeEmbedder } from './helpers/fake-embedder.js';

const memory = new MemoryService(new InMemoryMemoryStore());
const history = new ConversationHistoryService(new InMemoryConversationStore());
const audit = new InMemoryAuditStore();
const runtime = new ToolRuntime(
  createTools({ knowledge: new KnowledgeService(new InMemoryKnowledgeStore(), new FakeEmbedder()), memory }),
  audit,
);

let server: ReturnType<ReturnType<typeof express>['listen']>;
let base = '';

before(async () => {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    const user = req.header('x-test-user');
    if (user) {
      req.userId = user;
    }
    next();
  });
  app.use('/api/actions', createActionsRouter(runtime, history, audit));
  await new Promise<void>((resolve) => {
    server = app.listen(0, '127.0.0.1', resolve);
  });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/actions`;
});

after(() => {
  server.close();
});

const call = (user: string | null, path = '', method = 'GET') =>
  fetch(`${base}${path}`, { method, headers: user ? { 'x-test-user': user } : {} });

async function pendingFor(userId: string) {
  await history.ensureUser(userId);
  const conversation = await history.createConversation({ userId, title: 't' });
  await memory.upsertMemory({ userId, key: 'goal', value: 'apprendre' });
  const outcome = await runtime.handleCall(
    { name: 'delete_memory', arguments: { key: 'goal' } },
    { userId, conversationId: conversation.id },
  );
  if (outcome.kind !== 'confirmation') throw new Error('attendu : confirmation');
  return { action: outcome.action, conversationId: conversation.id };
}

describe('routes des actions', () => {
  it('exige une session', async () => {
    assert.equal((await call(null)).status, 401);
    assert.equal((await call(null, '/x/confirm', 'POST')).status, 401);
    assert.equal((await call(null, '/history')).status, 401);
  });

  it('liste les actions en attente de l’utilisateur seulement', async () => {
    const { action } = await pendingFor('alice');
    const mine = (await (await call('alice')).json()) as { actions: { id: string; summary: string }[] };
    assert.ok(mine.actions.some((a) => a.id === action.id));
    assert.match(mine.actions[0]!.summary, /Effacer/);
    const others = (await (await call('bob')).json()) as { actions: unknown[] };
    assert.equal(others.actions.length, 0);
  });

  it('exécute après accord, ajoute un message à la conversation, et ne rejoue pas', async () => {
    const { action, conversationId } = await pendingFor('carol');
    const res = await call('carol', `/${action.id}/confirm`, 'POST');
    assert.equal(res.status, 200);
    assert.match(((await res.json()) as { message: string }).message, /effacé/);
    assert.equal(await memory.getMemoryByKey('carol', 'goal'), null);

    const stored = await history.listMessages(conversationId);
    assert.match(stored.at(-1)!.content, /C'est fait/);
    assert.equal((await call('carol', `/${action.id}/confirm`, 'POST')).status, 404);
  });

  it('refuse à un autre compte de confirmer ou de refuser', async () => {
    const { action } = await pendingFor('dave');
    assert.equal((await call('mallory', `/${action.id}/confirm`, 'POST')).status, 404);
    assert.equal((await call('mallory', `/${action.id}/deny`, 'POST')).status, 404);
    assert.ok((await memory.getMemoryByKey('dave', 'goal')) !== null);
  });

  it('un refus n’exécute rien', async () => {
    const { action } = await pendingFor('erin');
    assert.equal((await call('erin', `/${action.id}/deny`, 'POST')).status, 204);
    assert.ok((await memory.getMemoryByKey('erin', 'goal')) !== null);
    assert.equal((await call('erin', `/${action.id}/deny`, 'POST')).status, 404);
  });

  it('montre l’historique des appels de l’utilisateur', async () => {
    const res = (await (await call('carol', '/history')).json()) as {
      entries: { tool: string; status: string }[];
    };
    const statuses = res.entries.map((e) => e.status);
    assert.ok(statuses.includes('confirmed') && statuses.includes('executed'));
    assert.ok(res.entries.every((e) => e.tool === 'delete_memory'));
  });
});
