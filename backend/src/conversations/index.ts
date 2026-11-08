import type { Pool } from 'pg';
import { createPoolFromEnv } from '../db/pool.js';
import { env } from '../config/env.js';
import { ConversationService } from './conversation.service.js';
import type { ConversationStore } from './conversation-store.js';
import { InMemoryConversationStore } from './in-memory-conversation-store.js';
import { PostgresConversationStore } from './postgres-conversation-store.js';

export type {
  User,
  Conversation,
  ConversationMessage,
  ConversationWithMessages,
  CreateConversationInput,
  AppendMessageInput,
} from './types.js';
export type { ConversationStore } from './conversation-store.js';
export { InMemoryConversationStore } from './in-memory-conversation-store.js';
export { PostgresConversationStore } from './postgres-conversation-store.js';
export {
  ConversationService,
  ConversationNotFoundError,
  deriveConversationTitle,
  resolveMessagesToAppend,
} from './conversation.service.js';

/**
 * Sélectionne le store selon MEMORY_STORE (même mode que la mémoire).
 */
export function createConversationStore(pool?: Pool): ConversationStore {
  if (env.MEMORY_STORE === 'postgres') {
    if (!env.DATABASE_URL && !pool) {
      throw new Error(
        'MEMORY_STORE=postgres nécessite DATABASE_URL. Utilisez MEMORY_STORE=inmemory sinon.',
      );
    }

    const resolvedPool = pool ?? createPoolFromEnv(env.DATABASE_URL);
    return new PostgresConversationStore(resolvedPool);
  }

  return new InMemoryConversationStore();
}

export function createDefaultConversationService(
  store: ConversationStore = createConversationStore(),
): ConversationService {
  return new ConversationService(store);
}
