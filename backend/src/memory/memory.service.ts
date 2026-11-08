import type { MemoryStore } from './memory-store.js';
import type { CreateMemoryInput, Memory } from './types.js';

/**
 * Service applicatif mémoire.
 * Dépend uniquement de l'interface MemoryStore (pas de Map).
 */
export class MemoryService {
  constructor(private readonly store: MemoryStore) {}

  listMemories(userId: string): Promise<Memory[]> {
    this.assertUserId(userId);
    return this.store.listByUser(userId);
  }

  /** Alias explicite pour la couche conversation. */
  getMemories(userId: string): Promise<Memory[]> {
    return this.listMemories(userId);
  }

  getMemory(userId: string, memoryId: string): Promise<Memory | null> {
    this.assertUserId(userId);
    this.assertNonEmpty(memoryId, 'memoryId');
    return this.store.getById(userId, memoryId);
  }

  getMemoryByKey(userId: string, key: string): Promise<Memory | null> {
    this.assertUserId(userId);
    this.assertNonEmpty(key, 'key');
    return this.store.getByKey(userId, key);
  }

  async addMemory(input: CreateMemoryInput): Promise<Memory> {
    this.assertUserId(input.userId);
    this.assertNonEmpty(input.key, 'key');
    this.assertNonEmpty(input.value, 'value');
    return this.store.create({
      userId: input.userId,
      key: input.key.trim(),
      value: input.value.trim(),
    });
  }

  /**
   * Crée un souvenir ou met à jour la valeur si la clé existe déjà
   * pour cet utilisateur (ex. user_name : Sarah → Julie).
   */
  async upsertMemory(input: CreateMemoryInput): Promise<Memory> {
    this.assertUserId(input.userId);
    this.assertNonEmpty(input.key, 'key');
    this.assertNonEmpty(input.value, 'value');
    return this.store.upsert({
      userId: input.userId,
      key: input.key.trim(),
      value: input.value.trim(),
    });
  }

  async deleteMemory(userId: string, memoryId: string): Promise<boolean> {
    this.assertUserId(userId);
    this.assertNonEmpty(memoryId, 'memoryId');
    return this.store.delete(userId, memoryId);
  }

  async clearMemories(userId: string): Promise<number> {
    this.assertUserId(userId);
    return this.store.clearByUser(userId);
  }

  private assertUserId(userId: string): void {
    this.assertNonEmpty(userId, 'userId');
  }

  private assertNonEmpty(value: string, field: string): void {
    if (typeof value !== 'string' || value.trim() === '') {
      throw new Error(`Le champ "${field}" est obligatoire.`);
    }
  }
}
