import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { InMemoryMemoryStore, MemoryService } from '../src/memory/index.js';
import { InMemoryKnowledgeStore, KnowledgeService } from '../src/knowledge/index.js';
import {
  CalculatorError,
  InMemoryAuditStore,
  ToolRuntime,
  createTools,
  evaluateExpression,
  validateArguments,
} from '../src/tools/index.js';
import type { ToolDefinition } from '../src/tools/index.js';
import { FakeEmbedder } from './helpers/fake-embedder.js';

describe('calculatrice', () => {
  it('calcule avec les priorités habituelles', () => {
    assert.equal(evaluateExpression('2 + 3 * 4'), 14);
    assert.equal(evaluateExpression('(2 + 3) * 4'), 20);
    assert.equal(evaluateExpression('17*23'), 391);
    assert.equal(evaluateExpression('2 ^ 3 ^ 2'), 512);
    assert.equal(evaluateExpression('-5 + 2'), -3);
    assert.equal(evaluateExpression('10 % 4'), 2);
    assert.equal(evaluateExpression('7,5 × 2'), 15);
    assert.equal(evaluateExpression('1/4'), 0.25);
  });

  it('refuse tout ce qui n’est pas de l’arithmétique', () => {
    for (const attack of [
      'process.exit(1)',
      'require("fs")',
      '1; rm -rf /',
      '`ls`',
      'constructor',
      '2 + a',
      '',
      '(1 + 2',
      '1 + + ',
      '1..2',
      '9'.repeat(201),
      '('.repeat(60) + '1' + ')'.repeat(60),
    ]) {
      assert.throws(() => evaluateExpression(attack), CalculatorError, attack.slice(0, 30));
    }
  });

  it('signale la division par zéro et les résultats démesurés', () => {
    assert.throws(() => evaluateExpression('1/0'), /zéro/);
    assert.throws(() => evaluateExpression('9^9^9^9'), /trop grand/);
  });
});

describe('validation des arguments', () => {
  const schema = {
    type: 'object' as const,
    properties: {
      query: { type: 'string' as const, maxLength: 10 },
      count: { type: 'integer' as const, minimum: 1, maximum: 5 },
      mode: { type: 'string' as const, enum: ['a', 'b'] as const },
    },
    required: ['query'] as const,
  };

  it('accepte un objet valide, ou le même en JSON texte', () => {
    assert.deepEqual(validateArguments(schema, { query: 'x', count: 2 }), { ok: true, args: { query: 'x', count: 2 } });
    assert.deepEqual(validateArguments(schema, '{"query":"x"}'), { ok: true, args: { query: 'x' } });
  });

  it('refuse un champ inconnu (par exemple un userId glissé par le modèle)', () => {
    const result = validateArguments(schema, { query: 'x', userId: 'someone-else' });
    assert.equal(result.ok, false);
  });

  it('refuse les types, bornes, énumérations et champs manquants', () => {
    for (const bad of [{}, { query: 5 }, { query: 'x'.repeat(11) }, { query: 'x', count: 2.5 }, { query: 'x', count: 9 }, { query: 'x', mode: 'z' }, [], 'pas du json', 42]) {
      assert.equal(validateArguments(schema, bad).ok, false, JSON.stringify(bad));
    }
  });
});

function setup(extra: ToolDefinition[] = [], now: () => number = Date.now) {
  const memory = new MemoryService(new InMemoryMemoryStore());
  const knowledge = new KnowledgeService(new InMemoryKnowledgeStore(), new FakeEmbedder());
  const audit = new InMemoryAuditStore();
  const runtime = new ToolRuntime([...createTools({ knowledge, memory }), ...extra], audit, now);
  return { memory, knowledge, audit, runtime };
}

const ctx = (userId = 'alice') => ({ userId, conversationId: 'conv-1' });

describe('ToolRuntime : permissions', () => {
  it('exécute un outil de lecture et le journalise', async () => {
    const { runtime, audit } = setup();
    const outcome = await runtime.handleCall({ name: 'calculator', arguments: { expression: '2+2' } }, ctx());
    assert.deepEqual(outcome, { kind: 'result', tool: 'calculator', output: '2+2 = 4' });
    assert.equal(audit.entries.at(-1)?.status, 'executed');
  });

  it('rejette un outil inconnu sans rien exécuter', async () => {
    const { runtime, audit } = setup();
    const outcome = await runtime.handleCall({ name: 'send_email', arguments: { to: 'x@y.z' } }, ctx());
    assert.equal(outcome.kind, 'rejected');
    assert.equal(audit.entries.at(-1)?.status, 'rejected');
  });

  it('rejette des arguments invalides ou en trop', async () => {
    const { runtime } = setup();
    assert.equal((await runtime.handleCall({ name: 'calculator', arguments: {} }, ctx())).kind, 'rejected');
    assert.equal(
      (await runtime.handleCall({ name: 'calculator', arguments: { expression: '1', userId: 'bob' } }, ctx())).kind,
      'rejected',
    );
  });

  it('n’exécute jamais une action sensible sans accord, et la met en attente', async () => {
    const { runtime, memory, audit } = setup();
    await memory.upsertMemory({ userId: 'alice', key: 'goal', value: 'apprendre' });

    const outcome = await runtime.handleCall({ name: 'delete_memory', arguments: { key: 'goal' } }, ctx());
    assert.equal(outcome.kind, 'confirmation');
    assert.ok((await memory.getMemoryByKey('alice', 'goal')) !== null);
    assert.equal(runtime.listPending('alice').length, 1);
    assert.equal(audit.entries.at(-1)?.status, 'confirmation_requested');
  });

  it('exécute l’action une seule fois après accord de son propriétaire', async () => {
    const { runtime, memory } = setup();
    await memory.upsertMemory({ userId: 'alice', key: 'goal', value: 'apprendre' });
    const outcome = await runtime.handleCall({ name: 'delete_memory', arguments: { key: 'goal' } }, ctx());
    assert.equal(outcome.kind, 'confirmation');
    if (outcome.kind !== 'confirmation') return;

    const done = await runtime.confirm('alice', outcome.action.id);
    assert.equal(done.ok, true);
    assert.equal(await memory.getMemoryByKey('alice', 'goal'), null);
    assert.deepEqual(await runtime.confirm('alice', outcome.action.id), { ok: false, reason: 'not_found' });
  });

  it('ne laisse pas un autre utilisateur confirmer ou refuser', async () => {
    const { runtime, memory } = setup();
    await memory.upsertMemory({ userId: 'alice', key: 'goal', value: 'apprendre' });
    const outcome = await runtime.handleCall({ name: 'delete_memory', arguments: { key: 'goal' } }, ctx());
    if (outcome.kind !== 'confirmation') throw new Error('attendu : confirmation');

    assert.deepEqual(await runtime.confirm('mallory', outcome.action.id), { ok: false, reason: 'not_found' });
    assert.equal(await runtime.deny('mallory', outcome.action.id), false);
    assert.ok((await memory.getMemoryByKey('alice', 'goal')) !== null);
    assert.equal(runtime.listPending('mallory').length, 0);
  });

  it('agit sur le compte de la session, jamais sur celui d’un autre', async () => {
    const { runtime, memory } = setup();
    await memory.upsertMemory({ userId: 'alice', key: 'goal', value: 'à Alice' });
    await memory.upsertMemory({ userId: 'bob', key: 'goal', value: 'à Bob' });

    const outcome = await runtime.handleCall({ name: 'delete_memory', arguments: { key: 'goal' } }, ctx('bob'));
    if (outcome.kind !== 'confirmation') throw new Error('attendu : confirmation');
    await runtime.confirm('bob', outcome.action.id);

    assert.equal(await memory.getMemoryByKey('bob', 'goal'), null);
    assert.equal((await memory.getMemoryByKey('alice', 'goal'))?.value, 'à Alice');
  });

  it('refuse une demande expirée', async () => {
    let clock = 1_000_000;
    const { runtime, memory, audit } = setup([], () => clock);
    await memory.upsertMemory({ userId: 'alice', key: 'goal', value: 'x' });
    const outcome = await runtime.handleCall({ name: 'delete_memory', arguments: { key: 'goal' } }, ctx());
    if (outcome.kind !== 'confirmation') throw new Error('attendu : confirmation');

    clock += 6 * 60 * 1000;
    assert.deepEqual(await runtime.confirm('alice', outcome.action.id), { ok: false, reason: 'expired' });
    assert.ok((await memory.getMemoryByKey('alice', 'goal')) !== null);
    assert.equal(audit.entries.at(-1)?.status, 'expired');
  });

  it('un refus n’exécute rien et est journalisé', async () => {
    const { runtime, memory, audit } = setup();
    await memory.upsertMemory({ userId: 'alice', key: 'goal', value: 'x' });
    const outcome = await runtime.handleCall({ name: 'delete_memory', arguments: { key: 'goal' } }, ctx());
    if (outcome.kind !== 'confirmation') throw new Error('attendu : confirmation');
    assert.equal(await runtime.deny('alice', outcome.action.id), true);
    assert.ok((await memory.getMemoryByKey('alice', 'goal')) !== null);
    assert.equal(audit.entries.at(-1)?.status, 'denied');
  });

  it('borne le nombre d’actions en attente par utilisateur', async () => {
    const { runtime } = setup();
    for (let i = 0; i < 8; i += 1) {
      await runtime.handleCall({ name: 'delete_memory', arguments: { key: 'goal' } }, ctx());
    }
    assert.equal(runtime.listPending('alice').length, 5);
  });

  it('une erreur d’outil ne divulgue pas ses détails et ne fait pas planter', async () => {
    const failing: ToolDefinition = {
      name: 'broken',
      description: 'x',
      parameters: { type: 'object', properties: {} },
      risk: 'read',
      async execute() {
        throw new Error('connexion à postgres://user:secret@host échouée');
      },
    };
    const { runtime, audit } = setup([failing]);
    const outcome = await runtime.handleCall({ name: 'broken', arguments: {} }, ctx());
    assert.equal(outcome.kind, 'result');
    assert.ok(!outcome.output.includes('secret'));
    assert.equal(audit.entries.at(-1)?.status, 'error');
  });

  it('borne la taille de la sortie et retire les caractères de contrôle', async () => {
    const verbose: ToolDefinition = {
      name: 'verbose',
      description: 'x',
      parameters: { type: 'object', properties: {} },
      risk: 'read',
      async execute() {
        return `a\u0000b${'x'.repeat(5000)}`;
      },
    };
    const { runtime } = setup([verbose]);
    const outcome = await runtime.handleCall({ name: 'verbose', arguments: {} }, ctx());
    assert.ok(outcome.output.length <= 2000);
    assert.ok(!outcome.output.includes('\u0000'));
  });

  it('cherche seulement dans les documents de l’utilisateur', async () => {
    const { runtime, knowledge } = setup();
    await knowledge.addDocument({ userId: 'bob', filename: 'b.txt', contentType: 'text/plain', data: Buffer.from('Le code secret de Bob est 1234 pour useMemo.') });
    await knowledge.addDocument({ userId: 'alice', filename: 'a.txt', contentType: 'text/plain', data: Buffer.from('useMemo mémorise un calcul coûteux.') });

    const outcome = await runtime.handleCall({ name: 'search_documents', arguments: { query: 'useMemo calcul' } }, ctx('alice'));
    assert.match(outcome.output, /a\.txt/);
    assert.doesNotMatch(outcome.output, /Bob|1234/);
  });

  it('expose les outils au modèle sans la fonction d’exécution', () => {
    const { runtime } = setup();
    const defs = runtime.definitionsForModel();
    assert.deepEqual(defs.map((d) => d.function.name).sort(), ['calculator', 'delete_memory', 'list_documents', 'search_documents']);
    assert.ok(defs.every((d) => !('execute' in d.function)));
  });
});
