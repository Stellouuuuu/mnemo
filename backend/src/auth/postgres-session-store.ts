import { randomUUID } from 'node:crypto';
import type { Pool, QueryResultRow } from 'pg';
import { env } from '../config/env.js';

export interface SessionRecord {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  createdAt: Date;
}

interface SessionRow extends QueryResultRow {
  id: string;
  user_id: string;
  token_hash: string;
  expires_at: Date;
  created_at: Date;
}

function mapRow(row: SessionRow): SessionRecord {
  return {
    id: row.id,
    userId: row.user_id,
    tokenHash: row.token_hash,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
  };
}

export class PostgresSessionStore {
  constructor(
    private readonly pool: Pool,
    private readonly maxPerUser = env.SESSION_MAX_PER_USER,
  ) {}

  async create(input: {
    userId: string;
    tokenHash: string;
    expiresAt: Date;
  }): Promise<SessionRecord> {
    const id = randomUUID();
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');
      const result = await client.query<SessionRow>(
        `INSERT INTO sessions (id, user_id, token_hash, expires_at)
         VALUES ($1, $2, $3, $4)
         RETURNING id, user_id, token_hash, expires_at, created_at`,
        [id, input.userId, input.tokenHash, input.expiresAt],
      );

      await client.query(
        `DELETE FROM sessions
         WHERE id IN (
           SELECT id FROM (
             SELECT id
             FROM sessions
             WHERE user_id = $1
             ORDER BY created_at DESC, id DESC
             OFFSET $2
           ) old
         )`,
        [input.userId, this.maxPerUser],
      );

      await client.query('COMMIT');
      return mapRow(result.rows[0]!);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async findValidByTokenHash(tokenHash: string): Promise<SessionRecord | null> {
    await this.deleteExpired();

    const result = await this.pool.query<SessionRow>(
      `SELECT id, user_id, token_hash, expires_at, created_at
       FROM sessions
       WHERE token_hash = $1 AND expires_at > NOW()`,
      [tokenHash],
    );

    const row = result.rows[0];
    return row ? mapRow(row) : null;
  }

  async deleteByTokenHash(tokenHash: string): Promise<boolean> {
    const result = await this.pool.query(
      `DELETE FROM sessions WHERE token_hash = $1`,
      [tokenHash],
    );

    return (result.rowCount ?? 0) > 0;
  }

  async deleteByUserId(userId: string): Promise<number> {
    const result = await this.pool.query(`DELETE FROM sessions WHERE user_id = $1`, [userId]);
    return result.rowCount ?? 0;
  }

  async deleteExpired(): Promise<number> {
    const result = await this.pool.query(
      `DELETE FROM sessions WHERE expires_at <= NOW()`,
    );
    return result.rowCount ?? 0;
  }

  async countByUser(userId: string): Promise<number> {
    const result = await this.pool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM sessions WHERE user_id = $1`,
      [userId],
    );
    return Number(result.rows[0]?.count ?? 0);
  }
}
