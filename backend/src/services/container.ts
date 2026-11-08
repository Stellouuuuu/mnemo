import type { Pool } from 'pg';
import {
  createDefaultMemoryService,
  InMemoryMemoryStore,
  OllamaMemoryExtractor,
  PostgresMemoryStore,
} from '../memory/index.js';
import {
  createDefaultConversationService,
  InMemoryConversationStore,
  PostgresConversationStore,
} from '../conversations/index.js';
import { AuthService } from '../auth/auth.service.js';
import { PostgresSessionStore } from '../auth/postgres-session-store.js';
import { env } from '../config/env.js';
import { createPoolFromEnv } from '../db/pool.js';
import { ConversationService } from './conversation.service.js';
import { chatWithOllama } from './ollama.service.js';

/**
 * Assemblage des services partagés.
 * MemoryStore / ConversationStore : inmemory | postgres via MEMORY_STORE.
 */
const sharedPool: Pool | undefined =
  env.MEMORY_STORE === 'postgres' ? createPoolFromEnv(env.DATABASE_URL) : undefined;

let poolClosed = false;

const memoryService = createDefaultMemoryService(
  sharedPool
    ? new PostgresMemoryStore(sharedPool)
    : new InMemoryMemoryStore(),
);

const conversationHistoryService = createDefaultConversationService(
  sharedPool
    ? new PostgresConversationStore(sharedPool)
    : new InMemoryConversationStore(),
);

const memoryExtractor = new OllamaMemoryExtractor(chatWithOllama);

export const conversationService = new ConversationService(
  memoryService,
  chatWithOllama,
  memoryExtractor,
  conversationHistoryService,
);

export const authService = sharedPool
  ? new AuthService(sharedPool, new PostgresSessionStore(sharedPool))
  : null;

export { memoryService, conversationHistoryService, sharedPool };

export async function closeSharedResources(): Promise<void> {
  if (!sharedPool || poolClosed) {
    return;
  }

  poolClosed = true;
  await sharedPool.end();
}

if (env.MEMORY_STORE === 'postgres') {
  console.log('STELLA memory/conversation store: postgres');
} else {
  console.log('STELLA memory/conversation store: inmemory');
}
