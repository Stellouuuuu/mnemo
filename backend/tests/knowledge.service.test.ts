import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { after, before, describe, it } from 'node:test';
import express from 'express';
import { env } from '../src/config/env.js';
import {
  ConversationService as ConversationHistoryService,
  InMemoryConversationStore,
} from '../src/conversations/index.js';
import {
  InMemoryKnowledgeStore,
  KnowledgeService,
  UnsupportedDocumentError,
} from '../src/knowledge/index.js';
import { InMemoryMemoryStore, MemoryService } from '../src/memory/index.js';
import { createDocumentsRouter } from '../src/routes/documents.routes.js';
import {
  ConversationService,
  type ConversationStreamEvent,
} from '../src/services/conversation.service.js';
import type { OllamaChatMessage } from '../src/types/chat.js';
import { FakeEmbedder } from './helpers/fake-embedder.js';

// Le vecteur "sac de mots" des tests donne des similarités plus basses que de vrais embeddings.
(env as { RAG_MIN_SIMILARITY: number }).RAG_MIN_SIMILARITY = 0.1;

const REACT = Buffer.from(
  [
    "useEffect exécute un effet de bord après le rendu du composant. Il sert à synchroniser le composant avec un système extérieur.",
    '',
    "useMemo mémorise le résultat d'un calcul coûteux entre deux rendus. La valeur n'est recalculée que si ses dépendances changent.",
  ].join('\n'),
);
const CUISINE = Buffer.from(
  'La pâte à crêpes se prépare avec de la farine, des oeufs et du lait. Laisser reposer une heure.',
);

function newKnowledge() {
  const embedder = new FakeEmbedder();
  return { embedder, service: new KnowledgeService(new InMemoryKnowledgeStore(), embedder) };
}

describe('KnowledgeService', () => {
  it('ajoute un document découpé et vectorisé, puis le liste', async () => {
    const { service } = newKnowledge();
    const doc = await service.addDocument({
      userId: 'u1',
      filename: 'cours-react.txt',
      contentType: 'text/plain',
      data: REACT,
    });
    assert.equal(doc.title, 'cours-react.txt');
    assert.ok(doc.chunkCount >= 1);
    assert.deepEqual((await service.listDocuments('u1')).map((d) => d.id), [doc.id]);
    assert.deepEqual(await service.listDocuments('u2'), []);
  });

  it('retrouve le bon passage et ignore les documents des autres utilisateurs', async () => {
    const { service } = newKnowledge();
    await service.addDocument({ userId: 'u1', filename: 'react.txt', contentType: 'text/plain', data: REACT });
    await service.addDocument({ userId: 'u1', filename: 'crepes.txt', contentType: 'text/plain', data: CUISINE });
    await service.addDocument({ userId: 'u2', filename: 'secret.txt', contentType: 'text/plain', data: Buffer.from('useMemo secret du voisin') });

    const hits = await service.search('u1', "À quoi sert useMemo pour mémoriser un calcul ?");
    assert.ok(hits.length > 0);
    assert.equal(hits[0]!.title, 'react.txt');
    assert.ok(hits.every((hit) => hit.title !== 'secret.txt'));
  });

  it('ne renvoie rien pour une question sans rapport', async () => {
    const { service } = newKnowledge();
    await service.addDocument({ userId: 'u1', filename: 'react.txt', contentType: 'text/plain', data: REACT });
    assert.deepEqual(await service.search('u1', 'zzzzz qqqqq'), []);
    assert.deepEqual(await service.search('u1', '   '), []);
  });

  it('supprime un document, et seulement le sien', async () => {
    const { service } = newKnowledge();
    const doc = await service.addDocument({ userId: 'u1', filename: 'react.txt', contentType: 'text/plain', data: REACT });
    assert.equal(await service.deleteDocument('u2', doc.id), false);
    assert.equal(await service.deleteDocument('u1', doc.id), true);
    assert.deepEqual(await service.search('u1', 'useMemo calcul'), []);
  });

  it('refuse un format inconnu, un fichier vide, trop de documents et trop de passages', async () => {
    const { service } = newKnowledge();
    const add = (over: object) =>
      service.addDocument({ userId: 'u1', filename: 'f', contentType: 'text/plain', data: REACT, ...over });

    await assert.rejects(() => add({ contentType: 'image/png' }), (e: unknown) => e instanceof UnsupportedDocumentError && e.statusCode === 415);
    await assert.rejects(() => add({ data: Buffer.alloc(0) }), UnsupportedDocumentError);

    const original = env.RAG_MAX_DOCUMENTS_PER_USER;
    (env as { RAG_MAX_DOCUMENTS_PER_USER: number }).RAG_MAX_DOCUMENTS_PER_USER = 1;
    try {
      await add({});
      await assert.rejects(() => add({}), (e: unknown) => e instanceof UnsupportedDocumentError && e.statusCode === 409);
    } finally {
      (env as { RAG_MAX_DOCUMENTS_PER_USER: number }).RAG_MAX_DOCUMENTS_PER_USER = original;
    }

    const limit = env.RAG_MAX_CHUNKS_PER_DOCUMENT;
    (env as { RAG_MAX_CHUNKS_PER_DOCUMENT: number }).RAG_MAX_CHUNKS_PER_DOCUMENT = 1;
    try {
      const long = Buffer.from(Array.from({ length: 10 }, (_, i) => `Paragraphe ${i} ${'x'.repeat(700)}`).join('\n\n'));
      await assert.rejects(() => add({ userId: 'u3', data: long }), (e: unknown) => e instanceof UnsupportedDocumentError && e.statusCode === 413);
    } finally {
      (env as { RAG_MAX_CHUNKS_PER_DOCUMENT: number }).RAG_MAX_CHUNKS_PER_DOCUMENT = limit;
    }
  });
});

function chatWith(knowledge: KnowledgeService | null, seen: OllamaChatMessage[][] = []) {
  const history = new ConversationHistoryService(new InMemoryConversationStore());
  const service = new ConversationService(
    new MemoryService(new InMemoryMemoryStore()),
    async (messages) => {
      seen.push(messages);
      return 'Réponse [1].';
    },
    undefined,
    history,
    async function* (messages) {
      seen.push(messages);
      yield 'Réponse ';
      yield '[1].';
    },
    knowledge,
  );
  return { service, history, seen };
}

describe('réponses appuyées sur les documents', () => {
  it('ajoute les extraits au prompt et renvoie puis enregistre les sources', async () => {
    const { service: knowledge } = newKnowledge();
    await knowledge.addDocument({ userId: 'u1', filename: 'react.txt', contentType: 'text/plain', data: REACT });
    const { service, history, seen } = chatWith(knowledge);

    const result = await service.chat({ userId: 'u1', content: "À quoi sert useMemo pour mémoriser un calcul ?" });

    const prompt = seen[0]!.at(-1)!.content;
    assert.match(prompt, /<knowledge>/);
    assert.match(prompt, /useMemo mémorise/);
    assert.equal(result.sources[0]?.title, 'react.txt');
    assert.ok(result.sources[0]!.snippet.length > 0);

    const stored = await history.listMessages(result.conversationId);
    assert.equal(stored.at(-1)?.sources?.[0]?.title, 'react.txt');
    assert.equal(stored[0]?.sources, undefined);
  });

  it('émet les sources avant les fragments en flux', async () => {
    const { service: knowledge } = newKnowledge();
    await knowledge.addDocument({ userId: 'u1', filename: 'react.txt', contentType: 'text/plain', data: REACT });
    const { service } = chatWith(knowledge);

    const events: ConversationStreamEvent[] = [];
    for await (const event of service.chatStream({ userId: 'u1', content: 'useMemo mémorise quoi ?' })) {
      events.push(event);
    }
    assert.deepEqual(events.map((e) => e.type), ['meta', 'sources', 'delta', 'delta', 'done']);
  });

  it('n’appelle pas les embeddings quand l’utilisateur n’a aucun document', async () => {
    const { service: knowledge, embedder } = newKnowledge();
    const { service, seen } = chatWith(knowledge);

    const result = await service.chat({ userId: 'u1', content: 'Bonjour' });
    assert.equal(embedder.calls, 0);
    assert.deepEqual(result.sources, []);
    assert.doesNotMatch(seen[0]!.at(-1)!.content, /<knowledge>/);
  });

  it('répond quand même si la recherche tombe en panne', async () => {
    const { service: knowledge, embedder } = newKnowledge();
    await knowledge.addDocument({ userId: 'u1', filename: 'react.txt', contentType: 'text/plain', data: REACT });
    embedder.embed = async () => {
      throw new Error('ollama indisponible');
    };
    const { service } = chatWith(knowledge);

    const result = await service.chat({ userId: 'u1', content: 'useMemo mémorise quoi ?' });
    assert.equal(result.response, 'Réponse [1].');
    assert.deepEqual(result.sources, []);
  });
});

let server: ReturnType<ReturnType<typeof express>['listen']>;
let base = '';
const routeKnowledge = newKnowledge().service;

before(async () => {
  const app = express();
  app.use((req, _res, next) => {
    const user = req.header('x-test-user');
    if (user) {
      req.userId = user;
    }
    next();
  });
  app.use('/api/documents', createDocumentsRouter(routeKnowledge));
  await new Promise<void>((resolve) => {
    server = app.listen(0, '127.0.0.1', resolve);
  });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/documents`;
});

after(() => {
  server.close();
});

function upload(user: string | null, body: Buffer, type: string, filename = 'cours.txt') {
  return fetch(base, {
    method: 'POST',
    headers: {
      'content-type': type,
      'x-filename': encodeURIComponent(filename),
      ...(user ? { 'x-test-user': user } : {}),
    },
    body,
  });
}

describe('routes documents', () => {
  it('exige une session', async () => {
    assert.equal((await upload(null, REACT, 'text/plain')).status, 401);
    assert.equal((await fetch(base)).status, 401);
  });

  it('ajoute un fichier texte, le liste et le supprime', async () => {
    const created = await upload('alice', REACT, 'text/plain', 'Cours é.md');
    assert.equal(created.status, 201);
    const { document } = (await created.json()) as { document: { id: string; title: string; chunkCount: number } };
    assert.equal(document.title, 'Cours é.md');
    assert.ok(document.chunkCount >= 1);

    const list = (await (await fetch(base, { headers: { 'x-test-user': 'alice' } })).json()) as {
      documents: { id: string }[];
    };
    assert.deepEqual(list.documents.map((d) => d.id), [document.id]);

    const other = await fetch(`${base}/${document.id}`, { method: 'DELETE', headers: { 'x-test-user': 'bob' } });
    assert.equal(other.status, 404);
    const own = await fetch(`${base}/${document.id}`, { method: 'DELETE', headers: { 'x-test-user': 'alice' } });
    assert.equal(own.status, 204);
  });

  it('refuse un format non pris en charge et un faux PDF', async () => {
    assert.equal((await upload('alice', Buffer.from('x'), 'image/png')).status, 415);
    const fake = await upload('alice', Buffer.from('ceci n’est pas un pdf'), 'application/pdf');
    assert.equal(fake.status, 422);
    assert.match(((await fake.json()) as { error: string }).error, /PDF/);
  });
});
