import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  InMemoryMemoryStore,
  MemoryService,
} from '../src/memory/index.js';

describe('MemoryService + InMemoryMemoryStore', () => {
  it('crée et récupère un souvenir', async () => {
    const service = new MemoryService(new InMemoryMemoryStore());

    const created = await service.addMemory({
      userId: 'user-a',
      key: 'first_name',
      value: 'Sarah',
    });

    assert.equal(created.userId, 'user-a');
    assert.equal(created.key, 'first_name');
    assert.equal(created.value, 'Sarah');
    assert.ok(created.id);
    assert.ok(created.createdAt instanceof Date);
    assert.ok(created.updatedAt instanceof Date);

    const listed = await service.listMemories('user-a');
    assert.equal(listed.length, 1);
    assert.equal(listed[0]?.id, created.id);

    const byKey = await service.getMemoryByKey('user-a', 'first_name');
    assert.equal(byKey?.value, 'Sarah');
  });

  it('supprime un souvenir', async () => {
    const service = new MemoryService(new InMemoryMemoryStore());

    const created = await service.addMemory({
      userId: 'user-a',
      key: 'city',
      value: 'Paris',
    });

    const deleted = await service.deleteMemory('user-a', created.id);
    assert.equal(deleted, true);

    const listed = await service.listMemories('user-a');
    assert.equal(listed.length, 0);

    const missing = await service.getMemory('user-a', created.id);
    assert.equal(missing, null);
  });

  it('isole les souvenirs entre utilisateurs', async () => {
    const service = new MemoryService(new InMemoryMemoryStore());

    await service.addMemory({
      userId: 'user-a',
      key: 'first_name',
      value: 'Sarah',
    });

    await service.addMemory({
      userId: 'user-b',
      key: 'first_name',
      value: 'Alex',
    });

    const memoriesA = await service.listMemories('user-a');
    const memoriesB = await service.listMemories('user-b');

    assert.equal(memoriesA.length, 1);
    assert.equal(memoriesB.length, 1);
    assert.equal(memoriesA[0]?.value, 'Sarah');
    assert.equal(memoriesB[0]?.value, 'Alex');

    const cross = await service.getMemory('user-b', memoriesA[0]!.id);
    assert.equal(cross, null);
  });

  it('vide tous les souvenirs d’un utilisateur', async () => {
    const service = new MemoryService(new InMemoryMemoryStore());

    await service.addMemory({
      userId: 'user-a',
      key: 'a',
      value: '1',
    });
    await service.addMemory({
      userId: 'user-a',
      key: 'b',
      value: '2',
    });
    await service.addMemory({
      userId: 'user-b',
      key: 'a',
      value: 'keep',
    });

    const cleared = await service.clearMemories('user-a');
    assert.equal(cleared, 2);
    assert.equal((await service.listMemories('user-a')).length, 0);
    assert.equal((await service.listMemories('user-b')).length, 1);
  });

  it('upsert remplace la valeur pour une même clé', async () => {
    const service = new MemoryService(new InMemoryMemoryStore());

    const first = await service.upsertMemory({
      userId: 'user-a',
      key: 'user_name',
      value: 'Sarah',
    });
    const second = await service.upsertMemory({
      userId: 'user-a',
      key: 'user_name',
      value: 'Julie',
    });

    assert.equal(first.id, second.id);
    assert.equal(second.value, 'Julie');
    assert.equal((await service.listMemories('user-a')).length, 1);
  });
});
