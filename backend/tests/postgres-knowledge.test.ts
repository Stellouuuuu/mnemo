import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, it } from 'node:test';
import type { Pool } from 'pg';
import { env } from '../src/config/env.js';
import {
  ConversationService as ConversationHistoryService,
  PostgresConversationStore,
} from '../src/conversations/index.js';
import { KnowledgeService, PostgresKnowledgeStore } from '../src/knowledge/index.js';
import { buildKeywordQuery } from '../src/knowledge/postgres-knowledge-store.js';
import { FakeEmbedder } from './helpers/fake-embedder.js';
import { tryCreateLivePostgresPool } from './helpers/postgres-live.js';

describe('buildKeywordQuery', () => {
  it('garde les mots en OU et rend la syntaxe de requête inoffensive', () => {
    assert.equal(buildKeywordQuery("À quoi sert useMemo ?"), 'quoi | sert | usememo');
    assert.equal(buildKeywordQuery("x') ; DROP TABLE users; -- & | ! :*"), 'drop | table | users');
    assert.equal(buildKeywordQuery('?? !!'), '__aucun_mot__');
  });
});

const COURS = [
  "useEffect exécute un effet de bord après le rendu du composant.",
  '',
  "useMemo mémorise le résultat d'un calcul coûteux entre deux rendus.",
  '',
  'Le routage client change de page sans recharger le navigateur.',
].join('\n');

describe('PostgresKnowledgeStore (intégration pgvector)', () => {
  let pool: Pool | null = null;
  let knowledge: KnowledgeService | null = null;
  const prefix = `test-${randomUUID()}`;
  const alice = `${prefix}-alice`;
  const bob = `${prefix}-bob`;
  const originalMin = env.RAG_MIN_SIMILARITY;

  before(async () => {
    (env as { RAG_MIN_SIMILARITY: number }).RAG_MIN_SIMILARITY = 0.1;
    pool = await tryCreateLivePostgresPool();
    if (pool) {
      knowledge = new KnowledgeService(new PostgresKnowledgeStore(pool), new FakeEmbedder());
      for (const id of [alice, bob]) {
        await pool.query('INSERT INTO users (id) VALUES ($1) ON CONFLICT DO NOTHING', [id]);
      }
    }
  });

  after(async () => {
    (env as { RAG_MIN_SIMILARITY: number }).RAG_MIN_SIMILARITY = originalMin;
    if (!pool) {
      return;
    }
    await pool.query('DELETE FROM users WHERE id LIKE $1', [`${prefix}%`]);
    await pool.end();
  });

  it('enregistre un document avec ses passages et ses vecteurs', async (t) => {
    if (!knowledge || !pool) {
      t.skip('PostgreSQL non disponible');
      return;
    }
    const doc = await knowledge.addDocument({
      userId: alice,
      filename: 'cours.md',
      contentType: 'text/markdown',
      data: Buffer.from(COURS),
    });
    const rows = await pool.query(
      'SELECT COUNT(*)::int AS n, MIN(vector_dims(embedding)) AS dims FROM document_chunks WHERE document_id = $1',
      [doc.id],
    );
    assert.equal(rows.rows[0].n, doc.chunkCount);
    assert.equal(rows.rows[0].dims, 1024);
  });

  it('retrouve le passage utile par le sens et par les mots', async (t) => {
    if (!knowledge) {
      t.skip('PostgreSQL non disponible');
      return;
    }
    const hits = await knowledge.search(alice, 'À quoi sert useMemo pour un calcul coûteux ?');
    assert.ok(hits.length > 0);
    assert.match(hits[0]!.content, /useMemo/);
    assert.equal(hits[0]!.title, 'cours.md');
    assert.ok(hits[0]!.similarity > 0 && hits[0]!.score > 0);
  });

  it('ne renvoie jamais les passages d’un autre utilisateur', async (t) => {
    if (!knowledge) {
      t.skip('PostgreSQL non disponible');
      return;
    }
    assert.deepEqual(await knowledge.search(bob, 'useMemo calcul coûteux'), []);
    await knowledge.addDocument({
      userId: bob,
      filename: 'bob.txt',
      contentType: 'text/plain',
      data: Buffer.from('useMemo selon Bob : un secret de Bob.'),
    });
    const aliceHits = await knowledge.search(alice, 'useMemo secret de Bob');
    assert.ok(aliceHits.every((hit) => hit.title === 'cours.md'));
    const bobHits = await knowledge.search(bob, 'useMemo secret de Bob');
    assert.ok(bobHits.length > 0 && bobHits.every((hit) => hit.title === 'bob.txt'));
  });

  it('supprime les passages avec le document, et seulement pour son propriétaire', async (t) => {
    if (!knowledge || !pool) {
      t.skip('PostgreSQL non disponible');
      return;
    }
    const [doc] = await knowledge.listDocuments(bob);
    assert.equal(await knowledge.deleteDocument(alice, doc!.id), false);
    assert.equal(await knowledge.deleteDocument(bob, doc!.id), true);
    const left = await pool.query('SELECT COUNT(*)::int AS n FROM document_chunks WHERE document_id = $1', [doc!.id]);
    assert.equal(left.rows[0].n, 0);
  });

  it('supprime documents et passages avec le compte', async (t) => {
    if (!pool) {
      t.skip('PostgreSQL non disponible');
      return;
    }
    const temp = `${prefix}-temp`;
    await pool.query('INSERT INTO users (id) VALUES ($1)', [temp]);
    const service = new KnowledgeService(new PostgresKnowledgeStore(pool), new FakeEmbedder());
    await service.addDocument({ userId: temp, filename: 't.txt', contentType: 'text/plain', data: Buffer.from('un texte') });
    await pool.query('DELETE FROM users WHERE id = $1', [temp]);
    const left = await pool.query('SELECT COUNT(*)::int AS n FROM document_chunks WHERE user_id = $1', [temp]);
    assert.equal(left.rows[0].n, 0);
  });

  it('garde les sources d’une réponse avec le message', async (t) => {
    if (!pool) {
      t.skip('PostgreSQL non disponible');
      return;
    }
    const history = new ConversationHistoryService(new PostgresConversationStore(pool));
    await history.ensureUser(alice);
    const conversation = await history.createConversation({ userId: alice, title: 'Test' });
    const source = { documentId: randomUUID(), title: 'cours.md', page: 2, snippet: 'useMemo mémorise' };
    await history.appendMessage({ conversationId: conversation.id, role: 'user', content: 'Q' });
    await history.appendMessage({
      conversationId: conversation.id,
      role: 'assistant',
      content: 'R [1]',
      sources: [source],
    });
    const stored = await history.listMessages(conversation.id);
    assert.equal(stored[0]!.sources, undefined);
    assert.deepEqual(stored[1]!.sources, [source]);
  });
});
