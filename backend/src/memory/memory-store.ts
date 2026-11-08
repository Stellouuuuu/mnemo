import type { CreateMemoryInput, Memory } from './types.js';

/**
 * Abstraction de stockage des souvenirs.
 * Permet de remplacer InMemoryMemoryStore par DatabaseMemoryStore
 * sans changer MemoryService ni le reste de l'application.
 */
export interface MemoryStore {
  listByUser(userId: string): Promise<Memory[]>;
  getById(userId: string, memoryId: string): Promise<Memory | null>;
  getByKey(userId: string, key: string): Promise<Memory | null>;
  create(input: CreateMemoryInput): Promise<Memory>;
  /** Crée ou remplace la valeur pour une clé donnée (userId + key). */
  upsert(input: CreateMemoryInput): Promise<Memory>;
  delete(userId: string, memoryId: string): Promise<boolean>;
  clearByUser(userId: string): Promise<number>;
}
