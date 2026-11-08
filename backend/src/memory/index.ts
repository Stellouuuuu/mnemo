import { createPoolFromEnv } from '../db/pool.js';
import { env } from '../config/env.js';
import { InMemoryMemoryStore } from './in-memory-memory-store.js';
import type { MemoryStore } from './memory-store.js';
import { MemoryService } from './memory.service.js';
import { PostgresMemoryStore } from './postgres-memory-store.js';

export type { Memory, CreateMemoryInput, MemoryCandidate } from './types.js';
export type { MemoryStore } from './memory-store.js';
export type { MemoryExtractor } from './memory-extractor.js';
export { InMemoryMemoryStore } from './in-memory-memory-store.js';
export { PostgresMemoryStore } from './postgres-memory-store.js';
export { MemoryService } from './memory.service.js';
export {
  OllamaMemoryExtractor,
  NoOpMemoryExtractor,
} from './ollama-memory-extractor.js';
export { parseMemoryExtractionResponse } from './parse-memory-extraction.js';
export {
  ALLOWED_MEMORY_KEYS,
  normalizeMemoryKey,
  normalizeMemoryCandidate,
  isGenericMemoryValue,
  isInformationSeekingQuestion,
  isEligibleForMemoryExtraction,
} from './memory-schema.js';

/**
 * Sélectionne le store selon MEMORY_STORE / DATABASE_URL.
 * Défaut : InMemoryMemoryStore (clone sans DB).
 */
export function createMemoryStore(pool?: import('pg').Pool): MemoryStore {
  if (env.MEMORY_STORE === 'postgres') {
    if (!env.DATABASE_URL && !pool) {
      throw new Error(
        'MEMORY_STORE=postgres nécessite DATABASE_URL. Utilisez MEMORY_STORE=inmemory sinon.',
      );
    }

    const resolvedPool = pool ?? createPoolFromEnv(env.DATABASE_URL);
    return new PostgresMemoryStore(resolvedPool);
  }

  return new InMemoryMemoryStore();
}

export function createDefaultMemoryService(
  store: MemoryStore = createMemoryStore(),
): MemoryService {
  return new MemoryService(store);
}
