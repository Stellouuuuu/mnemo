import { randomUUID } from 'node:crypto';
import type { MemoryStore } from './memory-store.js';
import type { CreateMemoryInput, Memory } from './types.js';

/**
 * Stockage temporaire en RAM.
 * À remplacer plus tard par une implémentation base de données.
 */
export class InMemoryMemoryStore implements MemoryStore {
  private readonly memoriesByUser = new Map<string, Memory[]>();

  async listByUser(userId: string): Promise<Memory[]> {
    const memories = this.memoriesByUser.get(userId) ?? [];
    return memories.map((memory) => ({ ...memory }));
  }

  async getById(userId: string, memoryId: string): Promise<Memory | null> {
    const memories = this.memoriesByUser.get(userId) ?? [];
    const found = memories.find((memory) => memory.id === memoryId);
    return found ? { ...found } : null;
  }

  async getByKey(userId: string, key: string): Promise<Memory | null> {
    const memories = this.memoriesByUser.get(userId) ?? [];
    const found = memories.find((memory) => memory.key === key);
    return found ? { ...found } : null;
  }

  async create(input: CreateMemoryInput): Promise<Memory> {
    const now = new Date();
    const memory: Memory = {
      id: randomUUID(),
      userId: input.userId,
      key: input.key,
      value: input.value,
      createdAt: now,
      updatedAt: now,
    };

    const existing = this.memoriesByUser.get(input.userId) ?? [];
    existing.push(memory);
    this.memoriesByUser.set(input.userId, existing);

    return { ...memory };
  }

  async upsert(input: CreateMemoryInput): Promise<Memory> {
    const memories = this.memoriesByUser.get(input.userId) ?? [];
    const index = memories.findIndex((memory) => memory.key === input.key);

    if (index === -1) {
      return this.create(input);
    }

    const current = memories[index]!;
    const updated: Memory = {
      ...current,
      value: input.value,
      updatedAt: new Date(),
    };
    memories[index] = updated;
    this.memoriesByUser.set(input.userId, memories);

    return { ...updated };
  }

  async delete(userId: string, memoryId: string): Promise<boolean> {
    const memories = this.memoriesByUser.get(userId);
    if (!memories) {
      return false;
    }

    const index = memories.findIndex((memory) => memory.id === memoryId);
    if (index === -1) {
      return false;
    }

    memories.splice(index, 1);

    if (memories.length === 0) {
      this.memoriesByUser.delete(userId);
    }

    return true;
  }

  async clearByUser(userId: string): Promise<number> {
    const memories = this.memoriesByUser.get(userId);
    if (!memories) {
      return 0;
    }

    const count = memories.length;
    this.memoriesByUser.delete(userId);
    return count;
  }
}
