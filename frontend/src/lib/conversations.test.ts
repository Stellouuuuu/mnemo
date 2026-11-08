import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import {
  conversationHeaderTitle,
  formatMessageClock,
  mapApiMessagesToChatMessages,
  mapDetailMessagesToChatMessages,
  pickMostRecentConversation,
  toApiMessages,
} from './conversations';
import type { ConversationSummary } from '../types/chat';
import {
  deleteConversation,
  getApiBaseUrl,
  getConversation,
  listConversations,
  sendChatMessage,
} from '../services/api';

function summary(
  partial: Partial<ConversationSummary> & Pick<ConversationSummary, 'id'>,
): ConversationSummary {
  return {
    userId: 'user-A',
    title: 'Titre',
    createdAt: '2026-01-01T10:00:00.000Z',
    updatedAt: '2026-01-01T10:00:00.000Z',
    ...partial,
  };
}

describe('conversations helpers', () => {
  it('pickMostRecentConversation choisit updatedAt le plus récent', () => {
    const conversations = [
      summary({ id: 'a', updatedAt: '2026-01-01T10:00:00.000Z' }),
      summary({ id: 'b', updatedAt: '2026-01-02T12:00:00.000Z' }),
      summary({ id: 'c', updatedAt: '2026-01-01T20:00:00.000Z' }),
    ];

    expect(pickMostRecentConversation(conversations)?.id).toBe('b');
  });

  it('pickMostRecentConversation retourne null si liste vide', () => {
    expect(pickMostRecentConversation([])).toBeNull();
  });

  it('mapDetailMessagesToChatMessages conserve id/role/content', () => {
    const mapped = mapDetailMessagesToChatMessages([
      {
        id: 'm1',
        role: 'user',
        content: 'Bonjour',
        createdAt: '2026-01-01T10:00:00.000Z',
      },
    ]);

    expect(mapped).toEqual([
      {
        id: 'm1',
        role: 'user',
        content: 'Bonjour',
        createdAt: '2026-01-01T10:00:00.000Z',
      },
    ]);
  });

  it('mapApiMessagesToChatMessages crée des ids stables pour l’UI', () => {
    const mapped = mapApiMessagesToChatMessages(
      [
        { role: 'user', content: 'Hi' },
        { role: 'assistant', content: 'Hello' },
      ],
      'conv-1',
    );

    expect(mapped).toHaveLength(2);
    expect(mapped[0]?.id).toContain('conv-1');
    expect(mapped[1]?.role).toBe('assistant');
    expect(mapped[0]?.createdAt).toEqual(expect.any(String));
  });

  it('mapApiMessagesToChatMessages conserve createdAt si le contenu correspond', () => {
    const mapped = mapApiMessagesToChatMessages(
      [{ role: 'user', content: 'Hi' }],
      'conv-1',
      [
        {
          id: 'local',
          role: 'user',
          content: 'Hi',
          createdAt: '2026-01-01T10:00:00.000Z',
        },
      ],
    );

    expect(mapped[0]?.createdAt).toBe('2026-01-01T10:00:00.000Z');
  });

  it('formatMessageClock affiche une heure discrète ou rien', () => {
    expect(formatMessageClock(undefined)).toBe('');
    expect(formatMessageClock('pas-une-date')).toBe('');
    expect(formatMessageClock('2026-01-01T10:00:00.000Z').length).toBeGreaterThan(
      0,
    );
  });

  it('toApiMessages retire les ids locaux', () => {
    expect(
      toApiMessages([{ id: 'x', role: 'user', content: 'Salut' }]),
    ).toEqual([{ role: 'user', content: 'Salut' }]);
  });

  it('conversationHeaderTitle : nouvelle conversation', () => {
    expect(conversationHeaderTitle(null, [summary({ id: 'a' })])).toBe(
      'Nouvelle conversation',
    );
  });

  it('conversationHeaderTitle : titre existant, sinon fallback', () => {
    expect(
      conversationHeaderTitle('a', [summary({ id: 'a', title: '  Hello  ' })]),
    ).toBe('Hello');
    expect(
      conversationHeaderTitle('a', [summary({ id: 'a', title: '   ' })]),
    ).toBe('Conversation sans titre');
    expect(conversationHeaderTitle('missing', [summary({ id: 'a' })])).toBe(
      'Conversation sans titre',
    );
  });
});

describe('API conversations (session cookie, sans userId client)', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('listConversations appelle GET /api/conversations avec credentials', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue(
      new Response(
        JSON.stringify({
          conversations: [
            summary({ id: 'c1', title: 'Hello', updatedAt: '2026-01-02T00:00:00.000Z' }),
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    const result = await listConversations();
    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe('c1');

    const [url, init] = vi.mocked(globalThis.fetch).mock.calls[0]!;
    expect(String(url)).toBe(`${getApiBaseUrl()}/api/conversations`);
    expect(String(url)).not.toContain('userId');
    expect(init?.credentials).toBe('include');
  });

  it('getConversation charge les messages sans userId dans l’URL', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue(
      new Response(
        JSON.stringify({
          id: 'c1',
          userId: 'user-A',
          title: 'Hello',
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-02T00:00:00.000Z',
          messages: [
            {
              id: 'm1',
              role: 'user',
              content: 'Bonjour',
              createdAt: '2026-01-01T00:00:00.000Z',
            },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    const detail = await getConversation('c1');
    expect(detail.messages[0]?.content).toBe('Bonjour');
    expect(String(vi.mocked(globalThis.fetch).mock.calls[0]![0])).toBe(
      `${getApiBaseUrl()}/api/conversations/c1`,
    );
  });

  it('deleteConversation envoie DELETE', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue(
      new Response(null, { status: 204 }),
    );

    await deleteConversation('c1');
    const [url, init] = vi.mocked(globalThis.fetch).mock.calls[0]!;
    expect(String(url)).toBe(`${getApiBaseUrl()}/api/conversations/c1`);
    expect(init?.method).toBe('DELETE');
    expect(init?.credentials).toBe('include');
  });

  it('sendChatMessage n’envoie que content, pas userId ni messages[]', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue(
      new Response(
        JSON.stringify({
          conversationId: 'new-id',
          messages: [
            { role: 'user', content: 'Hi' },
            { role: 'assistant', content: 'Hello' },
          ],
          response: 'Hello',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    const result = await sendChatMessage('Hi');

    expect(result.conversationId).toBe('new-id');
    const body = JSON.parse(
      String(vi.mocked(globalThis.fetch).mock.calls[0]![1]?.body),
    ) as Record<string, unknown>;
    expect(body.userId).toBeUndefined();
    expect(body.conversationId).toBeUndefined();
    expect(body.messages).toBeUndefined();
    expect(body.content).toBe('Hi');
    expect(vi.mocked(globalThis.fetch).mock.calls[0]![1]?.credentials).toBe(
      'include',
    );
  });

  it('sendChatMessage avec conversationId → continuation', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue(
      new Response(
        JSON.stringify({
          conversationId: 'existing',
          messages: [{ role: 'user', content: 'Suite' }],
          response: 'OK',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    await sendChatMessage('Suite', 'existing');

    const body = JSON.parse(
      String(vi.mocked(globalThis.fetch).mock.calls[0]![1]?.body),
    ) as Record<string, unknown>;
    expect(body.conversationId).toBe('existing');
    expect(body.content).toBe('Suite');
    expect(body.messages).toBeUndefined();
    expect(body.userId).toBeUndefined();
  });

  it('sendChatMessage avec conversationId null n’envoie pas le champ', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue(
      new Response(
        JSON.stringify({
          conversationId: 'created',
          messages: [],
          response: 'ok',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    await sendChatMessage('x', null);
    const body = JSON.parse(
      String(vi.mocked(globalThis.fetch).mock.calls[0]![1]?.body),
    ) as Record<string, unknown>;
    expect(body.conversationId).toBeUndefined();
    expect(body.content).toBe('x');
    expect(body.messages).toBeUndefined();
  });
});

describe('comportement refresh (sélection)', () => {
  it('après refresh, la conversation la plus récente est sélectionnable', () => {
    const listed = [
      summary({ id: 'old', updatedAt: '2026-01-01T00:00:00.000Z' }),
      summary({ id: 'recent', updatedAt: '2026-08-21T15:00:00.000Z' }),
    ];

    const selected = pickMostRecentConversation(listed);
    expect(selected?.id).toBe('recent');

    const restored = mapDetailMessagesToChatMessages([
      {
        id: 'm1',
        role: 'user',
        content: 'Toujours là',
        createdAt: '2026-08-21T15:00:01.000Z',
      },
      {
        id: 'm2',
        role: 'assistant',
        content: 'Oui',
        createdAt: '2026-08-21T15:00:01.000Z',
      },
    ]);

    expect(restored).toHaveLength(2);
    expect(restored[0]?.content).toBe('Toujours là');
  });
});

describe('sources des réponses', () => {
  const source = { documentId: 'd1', title: 'cours.pdf', page: 3, snippet: 'useMemo mémorise' };

  it('garde les sources d’un message d’une conversation rechargée', () => {
    const mapped = mapDetailMessagesToChatMessages([
      { id: '1', role: 'user', content: 'Q', createdAt: '2026-01-01T10:00:00.000Z' },
      { id: '2', role: 'assistant', content: 'R [1]', sources: [source], createdAt: '2026-01-01T10:00:01.000Z' },
    ]);
    expect(mapped[0]?.sources).toBeUndefined();
    expect(mapped[1]?.sources).toEqual([source]);
  });

  it('rattache les sources de la réponse reçue au dernier message assistant seulement', () => {
    const mapped = mapApiMessagesToChatMessages(
      [
        { role: 'user', content: 'Q' },
        { role: 'assistant', content: 'R [1]' },
      ],
      'c1',
      [],
      [source],
    );
    expect(mapped[0]?.sources).toBeUndefined();
    expect(mapped[1]?.sources).toEqual([source]);
  });
});
