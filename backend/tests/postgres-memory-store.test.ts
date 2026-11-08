import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, it } from 'node:test';
import type { Pool } from 'pg';
import { PostgresMemoryStore } from '../src/memory/postgres-memory-store.js';
import { tryCreateLivePostgresPool } from './helpers/postgres-live.js';

describe('PostgresMemoryStore (intégration)', () => {
  let pool: Pool | null = null;
  let store: PostgresMemoryStore | null = null;
  const prefix = `test-${randomUUID()}`;

  before(async () => {
    pool = await tryCreateLivePostgresPool();
    if (pool) {
      store = new PostgresMemoryStore(pool);
    }
  });

  after(async () => {
    if (!pool) {
      return;
    }

    await pool.query('DELETE FROM users WHERE id LIKE $1', [`${prefix}%`]);
    await pool.end();
  });

  it('1. crée une mémoire', async (t) => {
    if (!store) {
      t.skip('PostgreSQL non disponible (DATABASE_URL absent ou connexion impossible)');
      return;
    }

    const userId = `${prefix}-user-create`;
    const created = await store.create({
      userId,
      key: 'user_name',
      value: 'Sarah',
    });

    assert.ok(created.id);
    assert.equal(created.userId, userId);
    assert.equal(created.key, 'user_name');
    assert.equal(created.value, 'Sarah');
  });

  it('2. récupère par userId (listByUser)', async (t) => {
    if (!store) {
      t.skip('PostgreSQL non disponible');
      return;
    }

    const userId = `${prefix}-user-list`;
    await store.create({ userId, key: 'user_name', value: 'Sarah' });
    await store.create({ userId, key: 'occupation', value: 'dev' });

    const listed = await store.listByUser(userId);
    assert.equal(listed.length, 2);
    assert.equal(
      listed.every((memory) => memory.userId === userId),
      true,
    );
  });

  it('3. upsert user_name Sarah → Julie (une seule ligne)', async (t) => {
    if (!store) {
      t.skip('PostgreSQL non disponible');
      return;
    }

    const userId = `${prefix}-user-upsert`;
    const first = await store.upsert({
      userId,
      key: 'user_name',
      value: 'Sarah',
    });
    const second = await store.upsert({
      userId,
      key: 'user_name',
      value: 'Julie',
    });

    assert.equal(first.id, second.id);
    assert.equal(second.value, 'Julie');

    const listed = await store.listByUser(userId);
    assert.equal(listed.filter((m) => m.key === 'user_name').length, 1);
  });

  it('4. suppression', async (t) => {
    if (!store) {
      t.skip('PostgreSQL non disponible');
      return;
    }

    const userId = `${prefix}-user-delete`;
    const created = await store.create({
      userId,
      key: 'goal',
      value: 'apprendre',
    });

    const deleted = await store.delete(userId, created.id);
    assert.equal(deleted, true);
    assert.equal(await store.getById(userId, created.id), null);
  });

  it('5. clearByUser', async (t) => {
    if (!store) {
      t.skip('PostgreSQL non disponible');
      return;
    }

    const userId = `${prefix}-user-clear`;
    await store.create({ userId, key: 'user_name', value: 'A' });
    await store.create({ userId, key: 'location', value: 'Paris' });

    const cleared = await store.clearByUser(userId);
    assert.equal(cleared, 2);
    assert.equal((await store.listByUser(userId)).length, 0);
  });

  it('6. isolation user-A / user-B', async (t) => {
    if (!store) {
      t.skip('PostgreSQL non disponible');
      return;
    }

    const userA = `${prefix}-user-A`;
    const userB = `${prefix}-user-B`;

    await store.upsert({ userId: userA, key: 'user_name', value: 'Sarah' });
    await store.upsert({ userId: userB, key: 'user_name', value: 'John' });

    assert.equal((await store.getByKey(userA, 'user_name'))?.value, 'Sarah');
    assert.equal((await store.getByKey(userB, 'user_name'))?.value, 'John');
    assert.equal(await store.getByKey(userB, 'missing'), null);
  });

  it('7. persistance après recréation du store', async (t) => {
    if (!store || !pool) {
      t.skip('PostgreSQL non disponible');
      return;
    }

    const userId = `${prefix}-user-persist`;
    const firstStore = new PostgresMemoryStore(pool);
    const created = await firstStore.upsert({
      userId,
      key: 'user_name',
      value: 'Persisted',
    });

    const secondStore = new PostgresMemoryStore(pool);
    const found = await secondStore.getByKey(userId, 'user_name');

    assert.ok(found);
    assert.equal(found.id, created.id);
    assert.equal(found.value, 'Persisted');
  });

  it('8. upsert sans ensureUser préalable crée la ligne users', async (t) => {
    if (!store || !pool) {
      t.skip('PostgreSQL non disponible');
      return;
    }

    const userId = `${prefix}-user-implicit`;
    await store.upsert({ userId, key: 'user_name', value: 'Stella' });

    const users = await pool.query('SELECT id FROM users WHERE id = $1', [userId]);
    assert.equal(users.rowCount, 1);
  });

  it('9. DELETE users cascade les memories (FK)', async (t) => {
    if (!store || !pool) {
      t.skip('PostgreSQL non disponible');
      return;
    }

    const userId = `${prefix}-user-cascade`;
    await store.upsert({ userId, key: 'user_name', value: 'Cascade' });
    await store.upsert({ userId, key: 'location', value: 'Cotonou' });

    await pool.query('DELETE FROM users WHERE id = $1', [userId]);

    assert.equal((await store.listByUser(userId)).length, 0);
    const remaining = await pool.query(
      'SELECT COUNT(*)::int AS count FROM memories WHERE user_id = $1',
      [userId],
    );
    assert.equal(remaining.rows[0]?.count, 0);
  });
});
