import { randomUUID } from 'node:crypto';
import type { Pool, PoolClient, QueryResultRow } from 'pg';
import type { ChatMessage, ChatRole } from '../types/chat.js';
import type { ConversationStore } from './conversation-store.js';
import { resolveMessagesToAppend } from './conversation.service.js';
import type {
  AppendMessageInput,
  Conversation,
  ConversationMessage,
  CreateConversationInput,
  User,
} from './types.js';

interface UserRow extends QueryResultRow {
  id: string;
  created_at: Date;
}

interface ConversationRow extends QueryResultRow {
  id: string;
  user_id: string;
  title: string;
  created_at: Date;
  updated_at: Date;
}

interface MessageRow extends QueryResultRow {
  id: string;
  conversation_id: string;
  role: ChatRole;
  content: string;
  created_at: Date;
}

function mapUser(row: UserRow): User {
  return {
    id: row.id,
    createdAt: row.created_at,
  };
}

function mapConversation(row: ConversationRow): Conversation {
  return {
    id: row.id,
    userId: row.user_id,
    title: row.title,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapMessage(row: MessageRow): ConversationMessage {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    role: row.role,
    content: row.content,
    createdAt: row.created_at,
  };
}

/**
 * Implémentation persistante de ConversationStore via PostgreSQL.
 */
export class PostgresConversationStore implements ConversationStore {
  constructor(private readonly pool: Pool) {}

  async ensureUser(userId: string): Promise<User> {
    const result = await this.pool.query<UserRow>(
      `INSERT INTO users (id)
       VALUES ($1)
       ON CONFLICT (id) DO UPDATE SET id = EXCLUDED.id
       RETURNING id, created_at`,
      [userId],
    );

    return mapUser(result.rows[0]!);
  }

  async createConversation(input: CreateConversationInput): Promise<Conversation> {
    await this.ensureUser(input.userId);

    const id = randomUUID();
    const title = (input.title ?? '').trim();
    const result = await this.pool.query<ConversationRow>(
      `INSERT INTO conversations (id, user_id, title)
       VALUES ($1, $2, $3)
       RETURNING id, user_id, title, created_at, updated_at`,
      [id, input.userId, title],
    );

    return mapConversation(result.rows[0]!);
  }

  async listConversationsByUser(userId: string): Promise<Conversation[]> {
    const result = await this.pool.query<ConversationRow>(
      `SELECT id, user_id, title, created_at, updated_at
       FROM conversations
       WHERE user_id = $1
       ORDER BY updated_at DESC, id DESC`,
      [userId],
    );

    return result.rows.map(mapConversation);
  }

  async getConversation(
    userId: string,
    conversationId: string,
  ): Promise<Conversation | null> {
    const result = await this.pool.query<ConversationRow>(
      `SELECT id, user_id, title, created_at, updated_at
       FROM conversations
       WHERE user_id = $1 AND id = $2`,
      [userId, conversationId],
    );

    const row = result.rows[0];
    return row ? mapConversation(row) : null;
  }

  async deleteConversation(userId: string, conversationId: string): Promise<boolean> {
    const result = await this.pool.query(
      `DELETE FROM conversations
       WHERE user_id = $1 AND id = $2`,
      [userId, conversationId],
    );

    return (result.rowCount ?? 0) > 0;
  }

  async listMessages(conversationId: string): Promise<ConversationMessage[]> {
    const result = await this.pool.query<MessageRow>(
      `SELECT id, conversation_id, role, content, created_at
       FROM messages
       WHERE conversation_id = $1
       ORDER BY created_at ASC, id ASC`,
      [conversationId],
    );

    return result.rows.map(mapMessage);
  }

  async appendMessage(input: AppendMessageInput): Promise<ConversationMessage> {
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');
      await this.lockConversation(client, input.conversationId);

      const id = randomUUID();
      const result = await client.query<MessageRow>(
        `INSERT INTO messages (id, conversation_id, role, content)
         VALUES ($1, $2, $3, $4)
         RETURNING id, conversation_id, role, content, created_at`,
        [id, input.conversationId, input.role, input.content],
      );

      await client.query(
        `UPDATE conversations
         SET updated_at = NOW()
         WHERE id = $1`,
        [input.conversationId],
      );

      await client.query('COMMIT');
      return mapMessage(result.rows[0]!);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async appendNewMessages(
    conversationId: string,
    incoming: ChatMessage[],
  ): Promise<ConversationMessage[]> {
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');
      await this.lockConversation(client, conversationId);

      const storedResult = await client.query<MessageRow>(
        `SELECT id, conversation_id, role, content, created_at
         FROM messages
         WHERE conversation_id = $1
         ORDER BY created_at ASC, id ASC`,
        [conversationId],
      );
      const stored = storedResult.rows.map(mapMessage);
      const toAppend = resolveMessagesToAppend(stored, incoming);
      const created: ConversationMessage[] = [];

      for (const message of toAppend) {
        const id = randomUUID();
        const result = await client.query<MessageRow>(
          `INSERT INTO messages (id, conversation_id, role, content)
           VALUES ($1, $2, $3, $4)
           RETURNING id, conversation_id, role, content, created_at`,
          [id, conversationId, message.role, message.content],
        );
        created.push(mapMessage(result.rows[0]!));
      }

      if (toAppend.length > 0) {
        await client.query(
          `UPDATE conversations
           SET updated_at = NOW()
           WHERE id = $1`,
          [conversationId],
        );
      }

      await client.query('COMMIT');
      return created;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  private async lockConversation(
    client: PoolClient,
    conversationId: string,
  ): Promise<void> {
    const locked = await client.query<{ id: string }>(
      `SELECT id FROM conversations WHERE id = $1 FOR UPDATE`,
      [conversationId],
    );

    if ((locked.rowCount ?? 0) === 0) {
      throw new Error(`Conversation introuvable : ${conversationId}`);
    }
  }

  async touchConversation(conversationId: string): Promise<void> {
    await this.pool.query(
      `UPDATE conversations
       SET updated_at = NOW()
       WHERE id = $1`,
      [conversationId],
    );
  }
}
