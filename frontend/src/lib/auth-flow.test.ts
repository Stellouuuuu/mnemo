import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_API_BASE_URL,
  getApiBaseUrl,
  getCurrentUser,
  loginUser,
  logoutUser,
  sendChatMessage,
} from '../services/api';

describe('fallback API', () => {
  it('pointe sur le port 3001', () => {
    expect(DEFAULT_API_BASE_URL).toBe('http://localhost:3001');
    expect(DEFAULT_API_BASE_URL).not.toContain(':3000');
  });
});

describe('flux login → chat et logout', () => {
  const originalFetch = globalThis.fetch;
  const storage: Record<string, string> = {};

  beforeEach(() => {
    for (const key of Object.keys(storage)) {
      delete storage[key];
    }

    vi.stubGlobal('localStorage', {
      getItem: (key: string) => storage[key] ?? null,
      setItem: (key: string, value: string) => {
        storage[key] = value;
      },
      removeItem: (key: string) => {
        delete storage[key];
      },
      clear: () => {
        for (const key of Object.keys(storage)) {
          delete storage[key];
        }
      },
      key: () => null,
      length: 0,
    });

    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.unstubAllGlobals();
  });

  it('login puis chat n’envoie pas userId et n’écrit rien dans localStorage', async () => {
    vi.mocked(globalThis.fetch)
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            user: { id: 'uuid-1', email: 'ada@example.test', displayName: 'Ada' },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            conversationId: 'conv-1',
            messages: [
              { role: 'user', content: 'Bonjour' },
              { role: 'assistant', content: 'Salut' },
            ],
            response: 'Salut',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      );

    const user = await loginUser('ada@example.test', 'password1');
    expect(user.id).toBe('uuid-1');

    const chat = await sendChatMessage('Bonjour');
    expect(chat.conversationId).toBe('conv-1');

    const loginCall = vi.mocked(globalThis.fetch).mock.calls[0]!;
    expect(String(loginCall[0])).toBe(`${getApiBaseUrl()}/api/auth/login`);
    expect(loginCall[1]?.credentials).toBe('include');
    expect(JSON.parse(String(loginCall[1]?.body))).toEqual({
      email: 'ada@example.test',
      password: 'password1',
    });

    const chatCall = vi.mocked(globalThis.fetch).mock.calls[1]!;
    expect(String(chatCall[0])).toBe(`${getApiBaseUrl()}/api/chat`);
    expect(chatCall[1]?.credentials).toBe('include');
    const chatBody = JSON.parse(String(chatCall[1]?.body)) as Record<string, unknown>;
    expect(chatBody.userId).toBeUndefined();
    expect(chatBody.messages).toBeUndefined();
    expect(chatBody.content).toBe('Bonjour');

    expect(Object.keys(storage)).toEqual([]);
  });

  it('logout appelle POST /api/auth/logout avec credentials, sans localStorage', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue(new Response(null, { status: 204 }));

    await logoutUser();

    const [url, init] = vi.mocked(globalThis.fetch).mock.calls[0]!;
    expect(String(url)).toBe(`${getApiBaseUrl()}/api/auth/logout`);
    expect(init?.method).toBe('POST');
    expect(init?.credentials).toBe('include');
    expect(Object.keys(storage)).toEqual([]);
  });

  it('me charge l’utilisateur courant via cookie', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue(
      new Response(
        JSON.stringify({
          user: { id: 'uuid-1', email: 'ada@example.test', displayName: null },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    const me = await getCurrentUser();
    expect(me.email).toBe('ada@example.test');
    const [url, init] = vi.mocked(globalThis.fetch).mock.calls[0]!;
    expect(String(url)).toBe(`${getApiBaseUrl()}/api/auth/me`);
    expect(init?.credentials).toBe('include');
  });

  it('getCurrentUser 401 lève ApiError sans écrire dans localStorage', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue(
      new Response(JSON.stringify({ error: 'Authentification requise.' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    await expect(getCurrentUser()).rejects.toMatchObject({
      name: 'ApiError',
      status: 401,
    });
    expect(Object.keys(storage)).toEqual([]);
  });

  it('échec réseau lève ApiError status 0', async () => {
    vi.mocked(globalThis.fetch).mockRejectedValue(new Error('offline'));

    await expect(getCurrentUser()).rejects.toMatchObject({ status: 0 });
  });

  it('sendChatMessage 401 n’écrit pas userId dans localStorage', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue(
      new Response(JSON.stringify({ error: 'Authentification requise.' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    await expect(
      sendChatMessage('Bonjour'),
    ).rejects.toMatchObject({ status: 401 });
    expect(Object.keys(storage)).toEqual([]);
  });
});
