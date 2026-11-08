import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  ConversationService,
  InMemoryConversationStore,
  resolveMessagesToAppend,
} from '../src/conversations/index.js';
import { MemoryService, InMemoryMemoryStore, NoOpMemoryExtractor } from '../src/memory/index.js';
import { ConversationService as ChatConversationService } from '../src/services/conversation.service.js';

describe('ConversationStore inmemory — persistance conversations', () => {
  it('crée une conversation et ajoute des messages', async () => {
    const service = new ConversationService(new InMemoryConversationStore());

    const conversation = await service.createConversation({
      userId: 'user-A',
      title: 'Salut',
    });

    await service.appendMessage({
      conversationId: conversation.id,
      role: 'user',
      content: 'Salut',
    });
    await service.appendMessage({
      conversationId: conversation.id,
      role: 'assistant',
      content: 'Bonjour !',
    });

    const detail = await service.getConversationWithMessages('user-A', conversation.id);
    assert.ok(detail);
    assert.equal(detail.messages.length, 2);
    assert.equal(detail.messages[0]?.content, 'Salut');
    assert.equal(detail.messages[1]?.content, 'Bonjour !');
  });

  it('récupère une conversation', async () => {
    const service = new ConversationService(new InMemoryConversationStore());
    const created = await service.createConversation({
      userId: 'user-A',
      title: 'Test',
    });

    const found = await service.getConversation('user-A', created.id);
    assert.ok(found);
    assert.equal(found.id, created.id);
    assert.equal(found.title, 'Test');
  });

  it('plusieurs conversations pour un même user', async () => {
    const service = new ConversationService(new InMemoryConversationStore());

    const first = await service.createConversation({ userId: 'user-A', title: 'A' });
    const second = await service.createConversation({ userId: 'user-A', title: 'B' });

    const listed = await service.listConversations('user-A');
    assert.equal(listed.length, 2);
    assert.equal(
      listed.some((conversation) => conversation.id === first.id),
      true,
    );
    assert.equal(
      listed.some((conversation) => conversation.id === second.id),
      true,
    );
  });

  it('isolement user-A / user-B', async () => {
    const service = new ConversationService(new InMemoryConversationStore());

    const convA = await service.createConversation({ userId: 'user-A', title: 'A' });
    await service.createConversation({ userId: 'user-B', title: 'B' });

    assert.equal((await service.listConversations('user-A')).length, 1);
    assert.equal((await service.listConversations('user-B')).length, 1);
    assert.equal(await service.getConversation('user-B', convA.id), null);
  });

  it('user-B ne peut pas accéder à la conversation de user-A', async () => {
    const service = new ConversationService(new InMemoryConversationStore());
    const convA = await service.createConversation({ userId: 'user-A', title: 'Privée' });
    await service.appendMessage({
      conversationId: convA.id,
      role: 'user',
      content: 'secret',
    });

    assert.equal(await service.getConversationWithMessages('user-B', convA.id), null);
    assert.equal(await service.deleteConversation('user-B', convA.id), false);

    const stillThere = await service.getConversationWithMessages('user-A', convA.id);
    assert.ok(stillThere);
    assert.equal(stillThere.messages.length, 1);
  });

  it('supprime une conversation et ses messages', async () => {
    const store = new InMemoryConversationStore();
    const service = new ConversationService(store);

    const conversation = await service.createConversation({
      userId: 'user-A',
      title: 'À supprimer',
    });
    await service.appendMessage({
      conversationId: conversation.id,
      role: 'user',
      content: 'hello',
    });
    await service.appendMessage({
      conversationId: conversation.id,
      role: 'assistant',
      content: 'hi',
    });

    assert.equal(await service.deleteConversation('user-A', conversation.id), true);
    assert.equal(await service.getConversation('user-A', conversation.id), null);
    assert.deepEqual(await store.listMessages(conversation.id), []);
  });

  it('resolveMessagesToAppend ne duplique pas le préfixe déjà stocké', () => {
    const stored = [
      { role: 'user' as const, content: 'A' },
      { role: 'assistant' as const, content: 'B' },
    ];
    const incoming = [
      { role: 'user' as const, content: 'A' },
      { role: 'assistant' as const, content: 'B' },
      { role: 'user' as const, content: 'C' },
    ];

    assert.deepEqual(resolveMessagesToAppend(stored, incoming), [
      { role: 'user', content: 'C' },
    ]);
  });
});

describe('Chat ConversationService — persistance via ConversationStore', () => {
  it('crée une conversation et retourne conversationId', async () => {
    const history = new ConversationService(new InMemoryConversationStore());
    const chat = new ChatConversationService(
      new MemoryService(new InMemoryMemoryStore()),
      async () => 'Réponse',
      new NoOpMemoryExtractor(),
      history,
    );

    const result = await chat.chat({
      userId: 'user-A',
      content: 'Bonjour',
    });

    assert.ok(result.conversationId);
    assert.equal(result.response, 'Réponse');
    assert.equal(result.messages.length, 2);
    assert.equal(result.messages[0]?.content, 'Bonjour');
    assert.equal(result.messages[1]?.content, 'Réponse');

    const detail = await history.getConversationWithMessages(
      'user-A',
      result.conversationId,
    );
    assert.ok(detail);
    assert.equal(detail.messages.length, 2);
  });

  it('ajoute des messages à une conversation existante', async () => {
    const history = new ConversationService(new InMemoryConversationStore());
    const chat = new ChatConversationService(
      new MemoryService(new InMemoryMemoryStore()),
      async () => 'Suite',
      new NoOpMemoryExtractor(),
      history,
    );

    const first = await chat.chat({
      userId: 'user-A',
      content: 'Premier',
    });

    const second = await chat.chat({
      userId: 'user-A',
      conversationId: first.conversationId,
      content: 'Deuxième',
    });

    assert.equal(second.conversationId, first.conversationId);
    const detail = await history.getConversationWithMessages(
      'user-A',
      first.conversationId,
    );
    assert.ok(detail);
    assert.equal(detail.messages.length, 4);
    assert.equal(detail.messages[2]?.content, 'Deuxième');
    assert.equal(detail.messages[3]?.content, 'Suite');
  });

  it('refuse conversationId d’un autre utilisateur', async () => {
    const history = new ConversationService(new InMemoryConversationStore());
    const chat = new ChatConversationService(
      new MemoryService(new InMemoryMemoryStore()),
      async () => 'ok',
      new NoOpMemoryExtractor(),
      history,
    );

    const created = await chat.chat({
      userId: 'user-A',
      content: 'Privé',
    });

    await assert.rejects(
      () =>
        chat.chat({
          userId: 'user-B',
          conversationId: created.conversationId,
          content: 'Intrusion',
        }),
      (error: unknown) =>
        error instanceof Error && error.name === 'ConversationNotFoundError',
    );
  });
});
