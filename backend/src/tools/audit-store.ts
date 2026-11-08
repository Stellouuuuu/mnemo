import { randomUUID } from 'node:crypto';
import type { Pool, QueryResultRow } from 'pg';
import type { AuditEntry, AuditStatus } from './types.js';

export interface AuditRecord {
  userId: string;
  conversationId: string | null;
  tool: string;
  args: unknown;
  status: AuditStatus;
  detail?: string | null;
}

/** Journal des appels d'outils : ce que le modèle a demandé, et ce qui a vraiment été fait. */
export interface AuditStore {
  record(entry: AuditRecord): Promise<void>;
  listByUser(userId: string, limit?: number): Promise<AuditEntry[]>;
}

export class InMemoryAuditStore implements AuditStore {
  readonly entries: AuditEntry[] = [];

  async record(entry: AuditRecord): Promise<void> {
    this.entries.push({
      id: randomUUID(),
      userId: entry.userId,
      conversationId: entry.conversationId,
      tool: entry.tool,
      args: entry.args,
      status: entry.status,
      detail: entry.detail ?? null,
      createdAt: new Date(),
    });
  }

  async listByUser(userId: string, limit = 50): Promise<AuditEntry[]> {
    return this.entries
      .filter((e) => e.userId === userId)
      .slice(-limit)
      .reverse();
  }
}

interface AuditRow extends QueryResultRow {
  id: string;
  user_id: string;
  conversation_id: string | null;
  tool: string;
  args: unknown;
  status: AuditStatus;
  detail: string | null;
  created_at: Date;
}

export class PostgresAuditStore implements AuditStore {
  constructor(private readonly pool: Pool) {}

  async record(entry: AuditRecord): Promise<void> {
    await this.pool.query(
      `INSERT INTO tool_audit (id, user_id, conversation_id, tool, args, status, detail)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7)`,
      [
        randomUUID(),
        entry.userId,
        entry.conversationId,
        entry.tool,
        JSON.stringify(entry.args ?? null),
        entry.status,
        entry.detail ?? null,
      ],
    );
  }

  async listByUser(userId: string, limit = 50): Promise<AuditEntry[]> {
    const result = await this.pool.query<AuditRow>(
      `SELECT id, user_id, conversation_id, tool, args, status, detail, created_at
       FROM tool_audit WHERE user_id = $1 ORDER BY created_at DESC, id LIMIT $2`,
      [userId, limit],
    );
    return result.rows.map((row) => ({
      id: row.id,
      userId: row.user_id,
      conversationId: row.conversation_id,
      tool: row.tool,
      args: row.args,
      status: row.status,
      detail: row.detail,
      createdAt: row.created_at,
    }));
  }
}
