import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { after, before, describe, it } from 'node:test';
import express from 'express';
import { InMemoryMemoryStore, MemoryService } from '../src/memory/index.js';
import { createMemoriesRouter } from '../src/routes/memories.routes.js';

let server: ReturnType<ReturnType<typeof express>['listen']>;
let base = '';
const service = new MemoryService(new InMemoryMemoryStore());

before(async () => {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    const user = req.header('x-test-user');
    if (user) {
      req.userId = user;
    }
    next();
  });
  app.use('/api/memories', createMemoriesRouter(service));
  await new Promise<void>((resolve) => {
    server = app.listen(0, '127.0.0.1', resolve);
  });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/memories`;
});

after(() => {
  server.close();
});

function call(user: string | null, path = '', init: RequestInit = {}) {
  return fetch(`${base}${path}`, {
    ...init,
    headers: {
      'content-type': 'application/json',
      ...(user ? { 'x-test-user': user } : {}),
    },
  });
}

async function seed(userId: string) {
  await service.upsertMemory({ userId, key: 'user_name', value: 'Sarah' });
  await service.upsertMemory({ userId, key: 'occupation', value: 'étudiante' });
}

describe('routes mémoire', () => {
  it('exige une session', async () => {
    assert.equal((await call(null)).status, 401);
    assert.equal((await call(null, '/x', { method: 'DELETE' })).status, 401);
  });

  it('liste uniquement les souvenirs de l’utilisateur connecté', async () => {
    await seed('alice');
    await service.upsertMemory({ userId: 'bob', key: 'location', value: 'Lyon' });

    const alice = (await (await call('alice')).json()) as {
      memories: { key: string; value: string; id: string }[];
    };
    assert.deepEqual(alice.memories.map((m) => m.key).sort(), ['occupation', 'user_name']);
    assert.ok(alice.memories.every((m) => typeof m.id === 'string'));

    const bob = (await (await call('bob')).json()) as { memories: { key: string }[] };
    assert.deepEqual(bob.memories.map((m) => m.key), ['location']);
  });

  it('corrige la valeur d’un souvenir en gardant sa clé', async () => {
    await seed('carol');
    const list = (await (await call('carol')).json()) as {
      memories: { id: string; key: string }[];
    };
    const name = list.memories.find((m) => m.key === 'user_name')!;

    const res = await call('carol', `/${name.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ value: '  Julie  ' }),
    });
    assert.equal(res.status, 200);
    const body = (await res.json()) as { memory: { key: string; value: string } };
    assert.equal(body.memory.key, 'user_name');
    assert.equal(body.memory.value, 'Julie');
    assert.equal((await service.getMemoryByKey('carol', 'user_name'))?.value, 'Julie');
  });

  it('refuse une valeur vide, trop longue ou non informative', async () => {
    await seed('dave');
    const [first] = await service.listMemories('dave');
    const patch = (value: unknown) =>
      call('dave', `/${first!.id}`, { method: 'PATCH', body: JSON.stringify({ value }) });

    assert.equal((await patch('')).status, 400);
    assert.equal((await patch(undefined)).status, 400);
    assert.equal((await patch('x'.repeat(301))).status, 400);
    assert.equal((await patch('mon prénom')).status, 400);
    assert.equal((await service.getMemory('dave', first!.id))?.value, first!.value);
  });

  it('ne laisse modifier ni supprimer le souvenir d’un autre utilisateur', async () => {
    await seed('erin');
    const [mine] = await service.listMemories('erin');

    const patched = await call('mallory', `/${mine!.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ value: 'piraté' }),
    });
    assert.equal(patched.status, 404);
    assert.equal((await call('mallory', `/${mine!.id}`, { method: 'DELETE' })).status, 404);
    assert.equal((await service.getMemory('erin', mine!.id))?.value, mine!.value);
  });

  it('oublie un souvenir, puis tout', async () => {
    await seed('frank');
    const [one] = await service.listMemories('frank');
    assert.equal((await call('frank', `/${one!.id}`, { method: 'DELETE' })).status, 204);
    assert.equal((await call('frank', `/${one!.id}`, { method: 'DELETE' })).status, 404);
    assert.equal((await service.listMemories('frank')).length, 1);

    await service.upsertMemory({ userId: 'gina', key: 'goal', value: 'apprendre' });
    const cleared = (await (await call('frank', '', { method: 'DELETE' })).json()) as {
      deleted: number;
    };
    assert.equal(cleared.deleted, 1);
    assert.equal((await service.listMemories('frank')).length, 0);
    assert.equal((await service.listMemories('gina')).length, 1);
  });
});
