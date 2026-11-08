import { randomUUID } from 'node:crypto';
import type { Pool, QueryResultRow } from 'pg';
import type { MemoryStore } from './memory-store.js';
import type { CreateMemoryInput, Memory } from './types.js';

interface MemoryRow extends QueryResultRow {
  id: string;
  user_id: string;
  key: string;
  value: string;
  created_at: Date;
  updated_at: Date;
}

function mapRow(row: MemoryRow): Memory {
  return {
    id: row.id,
    userId: row.user_id,
    key: row.key,
    value: row.value,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Implémentation persistante de MemoryStore via PostgreSQL.
 */
export class PostgresMemoryStore implements MemoryStore {
  constructor(private readonly pool: Pool) {}

  private async ensureUser(userId: string): Promise<void> {
    await this.pool.query(
      `INSERT INTO users (id)
       VALUES ($1)
       ON CONFLICT (id) DO NOTHING`,
      [userId],
    );
  }

  async listByUser(userId: string): Promise<Memory[]> {
    const result = await this.pool.query<MemoryRow>(
      `SELECT id, user_id, key, value, created_at, updated_at
       FROM memories
       WHERE user_id = $1
       ORDER BY created_at ASC`,
      [userId],
    );

    return result.rows.map(mapRow);
  }

  async getById(userId: string, memoryId: string): Promise<Memory | null> {
    const result = await this.pool.query<MemoryRow>(
      `SELECT id, user_id, key, value, created_at, updated_at
       FROM memories
       WHERE user_id = $1 AND id = $2`,
      [userId, memoryId],
    );

    const row = result.rows[0];
    return row ? mapRow(row) : null;
  }

  async getByKey(userId: string, key: string): Promise<Memory | null> {
    const result = await this.pool.query<MemoryRow>(
      `SELECT id, user_id, key, value, created_at, updated_at
       FROM memories
       WHERE user_id = $1 AND key = $2`,
      [userId, key],
    );

    const row = result.rows[0];
    return row ? mapRow(row) : null;
  }

  async create(input: CreateMemoryInput): Promise<Memory> {
    await this.ensureUser(input.userId);
    const id = randomUUID();
    const result = await this.pool.query<MemoryRow>(
      `INSERT INTO memories (id, user_id, key, value)
       VALUES ($1, $2, $3, $4)
       RETURNING id, user_id, key, value, created_at, updated_at`,
      [id, input.userId, input.key, input.value],
    );

    return mapRow(result.rows[0]!);
  }

  async upsert(input: CreateMemoryInput): Promise<Memory> {
    await this.ensureUser(input.userId);
    const id = randomUUID();
    const result = await this.pool.query<MemoryRow>(
      `INSERT INTO memories (id, user_id, key, value)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id, key)
       DO UPDATE SET
         value = EXCLUDED.value,
         updated_at = NOW()
       RETURNING id, user_id, key, value, created_at, updated_at`,
      [id, input.userId, input.key, input.value],
    );

    return mapRow(result.rows[0]!);
  }

  async delete(userId: string, memoryId: string): Promise<boolean> {
    const result = await this.pool.query(
      `DELETE FROM memories
       WHERE user_id = $1 AND id = $2`,
      [userId, memoryId],
    );

    return (result.rowCount ?? 0) > 0;
  }

  async clearByUser(userId: string): Promise<number> {
    const result = await this.pool.query(
      `DELETE FROM memories
       WHERE user_id = $1`,
      [userId],
    );

    return result.rowCount ?? 0;
  }
}
