import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import { after, before, describe, it } from 'node:test';
import type { AddressInfo } from 'node:net';
import type { Express } from 'express';
import cookieParser from 'cookie-parser';
import express from 'express';
import rateLimit from 'express-rate-limit';
import type { Pool } from 'pg';
import { AuthService, INVALID_CREDENTIALS } from '../src/auth/auth.service.js';
import { PostgresSessionStore } from '../src/auth/postgres-session-store.js';
import { hashSessionToken } from '../src/auth/session-token.js';
import { SESSION_COOKIE_NAME } from '../src/auth/session-cookie.js';
import { ConversationService } from '../src/conversations/conversation.service.js';
import { PostgresConversationStore } from '../src/conversations/postgres-conversation-store.js';
import { createRequireAuth } from '../src/middleware/require-auth.js';
import { createAuthRouter } from '../src/routes/auth.routes.js';
import { createChatRouter } from '../src/routes/chat.routes.js';
import { createConversationsRouter } from '../src/routes/conversations.routes.js';
import { ConversationService as ChatConversationService } from '../src/services/conversation.service.js';
import {
  InMemoryMemoryStore,
  MemoryService,
  NoOpMemoryExtractor,
} from '../src/memory/index.js';
import { tryCreateLivePostgresPool } from './helpers/postgres-live.js';

const skipLimiter: express.RequestHandler = (_req, _res, next) => {
  next();
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function createTestApp(
  authService: AuthService,
  historyService: ConversationService,
  rateLimiter: express.RequestHandler = skipLimiter,
): Express {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());

  const requireAuth = createRequireAuth(authService);
  const chatService = new ChatConversationService(
    new MemoryService(new InMemoryMemoryStore()),
    async () => 'ok',
    new NoOpMemoryExtractor(),
    historyService,
  );

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });
  app.use('/api/auth', createAuthRouter(authService, { rateLimiter }));
  app.use('/api/chat', requireAuth, createChatRouter(chatService));
  app.use('/api/conversations', requireAuth, createConversationsRouter(historyService));
  return app;
}

async function listen(app: Express): Promise<{
  baseUrl: string;
  server: Server;
}> {
  const server = createServer(app);
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve());
  });
  const address = server.address() as AddressInfo;
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    server,
  };
}

function sessionTokenFromResponse(response: Response): string | undefined {
  const cookies = response.headers.getSetCookie();
  for (const line of cookies) {
    if (line.startsWith(`${SESSION_COOKIE_NAME}=`)) {
      const value = line.split(';', 1)[0]?.slice(SESSION_COOKIE_NAME.length + 1);
      return value ? decodeURIComponent(value) : undefined;
    }
  }
  return undefined;
}

function cookieHeader(token: string): string {
  return `${SESSION_COOKIE_NAME}=${token}`;
}

function assertHttpOnlyLax(response: Response): void {
  const line = response.headers.getSetCookie().find((item) =>
    item.startsWith(`${SESSION_COOKIE_NAME}=`),
  );
  assert.ok(line, 'cookie de session manquant');
  assert.match(line, /HttpOnly/i);
  assert.match(line, /SameSite=Lax/i);
}

function assertClearedSessionCookie(response: Response): void {
  const line = response.headers.getSetCookie().find((item) =>
    item.startsWith(`${SESSION_COOKIE_NAME}=`),
  );
  assert.ok(line, 'cookie de vidage manquant');
  assert.ok(
    /Max-Age=0/i.test(line) || /Expires=/i.test(line),
    `cookie de vidage inattendu: ${line}`,
  );
}

describe('PostgreSQL auth — register / login / logout / session / 401 / isolation', () => {
  let pool: Pool | null = null;
  let authService: AuthService | null = null;
  let sessionStore: PostgresSessionStore | null = null;
  let historyService: ConversationService | null = null;
  let baseUrl = '';
  let httpServer: Server | null = null;
  const prefix = `auth-${Date.now()}-${Math.random().toString(16).slice(2)}`;

  before(async () => {
    pool = await tryCreateLivePostgresPool();
    if (!pool) {
      return;
    }

    sessionStore = new PostgresSessionStore(pool);
    authService = new AuthService(pool, sessionStore);
    historyService = new ConversationService(new PostgresConversationStore(pool));
    const listening = await listen(createTestApp(authService, historyService));
    baseUrl = listening.baseUrl;
    httpServer = listening.server;
  });

  after(async () => {
    if (httpServer) {
      await new Promise<void>((resolve, reject) => {
        httpServer?.close((error) => (error ? reject(error) : resolve()));
      });
    }

    if (!pool) {
      return;
    }

    await pool.query(`DELETE FROM users WHERE email LIKE $1 OR id LIKE $2`, [
      `${prefix}%`,
      `${prefix}%`,
    ]);
    await pool.end();
  });

  it('GET /health reste public', async (t) => {
    if (!baseUrl) {
      t.skip('PostgreSQL non disponible');
      return;
    }

    const response = await fetch(`${baseUrl}/health`);
    assert.equal(response.status, 200);
  });

  it('register crée un UUID serveur, pose un cookie HttpOnly, et ne stocke pas le token en clair', async (t) => {
    if (!pool || !baseUrl) {
      t.skip('PostgreSQL non disponible');
      return;
    }

    const email = `${prefix}-register@example.test`;
    const response = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        password: 'password1',
        displayName: 'Ada',
      }),
    });

    assert.equal(response.status, 201);
    const body = (await response.json()) as { user: { id: string; email: string } };
    assert.match(body.user.id, UUID_PATTERN);
    assert.equal(body.user.email, email);
    assert.equal('sessionToken' in body, false);
    assertHttpOnlyLax(response);

    const token = sessionTokenFromResponse(response);
    assert.ok(token);

    const stored = await pool.query<{ token_hash: string; raw_count: string }>(
      `SELECT token_hash,
              (SELECT COUNT(*)::text FROM sessions s
               WHERE s.user_id = $1 AND s.token_hash = $2) AS raw_count
       FROM sessions WHERE user_id = $1`,
      [body.user.id, token],
    );
    assert.equal(stored.rows.length, 1);
    assert.equal(stored.rows[0]?.token_hash, hashSessionToken(token));
    assert.notEqual(stored.rows[0]?.token_hash, token);
    assert.equal(stored.rows[0]?.raw_count, '0');
  });

  it('login refuse un utilisateur anonyme (email IS NULL) et le laisse en base', async (t) => {
    if (!pool || !baseUrl) {
      t.skip('PostgreSQL non disponible');
      return;
    }

    const anonId = `${prefix}-anon`;
    await pool.query(`INSERT INTO users (id) VALUES ($1)`, [anonId]);

    const response = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: `${anonId}@example.test`,
        password: 'password1',
      }),
    });
    assert.equal(response.status, 401);

    const remaining = await pool.query<{ email: string | null }>(
      `SELECT email FROM users WHERE id = $1`,
      [anonId],
    );
    assert.equal(remaining.rows.length, 1);
    assert.equal(remaining.rows[0]?.email, null);
  });

  it('login / me / logout gèrent la session', async (t) => {
    if (!baseUrl) {
      t.skip('PostgreSQL non disponible');
      return;
    }

    const email = `${prefix}-login@example.test`;
    const register = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: 'password1' }),
    });
    assert.equal(register.status, 201);

    const login = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: 'password1' }),
    });
    assert.equal(login.status, 200);
    const token = sessionTokenFromResponse(login);
    assert.ok(token);

    const me = await fetch(`${baseUrl}/api/auth/me`, {
      headers: { Cookie: cookieHeader(token) },
    });
    assert.equal(me.status, 200);
    const meBody = (await me.json()) as { user: { email: string } };
    assert.equal(meBody.user.email, email);

    const logout = await fetch(`${baseUrl}/api/auth/logout`, {
      method: 'POST',
      headers: { Cookie: cookieHeader(token) },
    });
    assert.equal(logout.status, 204);

    const meAfter = await fetch(`${baseUrl}/api/auth/me`, {
      headers: { Cookie: cookieHeader(token) },
    });
    assert.equal(meAfter.status, 401);
    assertClearedSessionCookie(meAfter);
  });

  it('login e-mail inconnu et mauvais mot de passe partagent le même 401 ; mot de passe court aussi', async (t) => {
    if (!baseUrl) {
      t.skip('PostgreSQL non disponible');
      return;
    }

    const email = `${prefix}-enum@example.test`;
    const register = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: 'password1' }),
    });
    assert.equal(register.status, 201);

    const unknown = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: `${prefix}-nobody@example.test`,
        password: 'password1',
      }),
    });
    const wrong = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: 'wrongpass' }),
    });
    const short = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: 'abc' }),
    });

    assert.equal(unknown.status, 401);
    assert.equal(wrong.status, 401);
    assert.equal(short.status, 401);
    const unknownBody = (await unknown.json()) as { error: string };
    const wrongBody = (await wrong.json()) as { error: string };
    const shortBody = (await short.json()) as { error: string };
    assert.equal(unknownBody.error, INVALID_CREDENTIALS);
    assert.equal(wrongBody.error, INVALID_CREDENTIALS);
    assert.equal(shortBody.error, INVALID_CREDENTIALS);
  });

  it('refuse un displayName trop long', async (t) => {
    if (!baseUrl) {
      t.skip('PostgreSQL non disponible');
      return;
    }

    const response = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: `${prefix}-longname@example.test`,
        password: 'password1',
        displayName: 'a'.repeat(81),
      }),
    });
    assert.equal(response.status, 400);
  });

  it('plafonne les sessions par utilisateur et évince la plus ancienne', async (t) => {
    if (!baseUrl || !sessionStore) {
      t.skip('PostgreSQL non disponible');
      return;
    }

    const email = `${prefix}-cap@example.test`;
    const register = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: 'password1' }),
    });
    assert.equal(register.status, 201);
    const firstToken = sessionTokenFromResponse(register)!;
    const user = ((await register.json()) as { user: { id: string } }).user;

    for (let index = 0; index < 5; index += 1) {
      const login = await fetch(`${baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password: 'password1' }),
      });
      assert.equal(login.status, 200);
    }

    assert.equal(await sessionStore.countByUser(user.id), 5);

    const meOld = await fetch(`${baseUrl}/api/auth/me`, {
      headers: { Cookie: cookieHeader(firstToken) },
    });
    assert.equal(meOld.status, 401);
    assertClearedSessionCookie(meOld);
  });

  it('logout courant laisse les autres sessions ; logout all les révoque', async (t) => {
    if (!baseUrl) {
      t.skip('PostgreSQL non disponible');
      return;
    }

    const email = `${prefix}-all@example.test`;
    const register = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: 'password1' }),
    });
    const tokenRegister = sessionTokenFromResponse(register)!;
    const login = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: 'password1' }),
    });
    const tokenLogin = sessionTokenFromResponse(login)!;

    const logoutCurrent = await fetch(`${baseUrl}/api/auth/logout`, {
      method: 'POST',
      headers: { Cookie: cookieHeader(tokenLogin) },
    });
    assert.equal(logoutCurrent.status, 204);

    const meLogin = await fetch(`${baseUrl}/api/auth/me`, {
      headers: { Cookie: cookieHeader(tokenLogin) },
    });
    const meRegister = await fetch(`${baseUrl}/api/auth/me`, {
      headers: { Cookie: cookieHeader(tokenRegister) },
    });
    assert.equal(meLogin.status, 401);
    assert.equal(meRegister.status, 200);

    const logoutAll = await fetch(`${baseUrl}/api/auth/logout`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: cookieHeader(tokenRegister),
      },
      body: JSON.stringify({ all: true }),
    });
    assert.equal(logoutAll.status, 204);

    const meAfterAll = await fetch(`${baseUrl}/api/auth/me`, {
      headers: { Cookie: cookieHeader(tokenRegister) },
    });
    assert.equal(meAfterAll.status, 401);
  });

  it('session expirée → 401 /me, chat, conversations + cookie vidé + ligne purgée', async (t) => {
    if (!pool || !baseUrl) {
      t.skip('PostgreSQL non disponible');
      return;
    }

    const email = `${prefix}-expire@example.test`;
    const register = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: 'password1' }),
    });
    assert.equal(register.status, 201);
    const token = sessionTokenFromResponse(register)!;
    const tokenHash = hashSessionToken(token);

    await pool.query(
      `UPDATE sessions SET expires_at = NOW() - INTERVAL '1 second' WHERE token_hash = $1`,
      [tokenHash],
    );

    const me = await fetch(`${baseUrl}/api/auth/me`, {
      headers: { Cookie: cookieHeader(token) },
    });
    assert.equal(me.status, 401);
    assertClearedSessionCookie(me);

    const remaining = await pool.query(
      `SELECT 1 FROM sessions WHERE token_hash = $1`,
      [tokenHash],
    );
    assert.equal(remaining.rows.length, 0);

    const chat = await fetch(`${baseUrl}/api/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: cookieHeader(token),
      },
      body: JSON.stringify({
        content: 'hello',
      }),
    });
    assert.equal(chat.status, 401);
    assertClearedSessionCookie(chat);

    const list = await fetch(`${baseUrl}/api/conversations`, {
      headers: { Cookie: cookieHeader(token) },
    });
    assert.equal(list.status, 401);
    assertClearedSessionCookie(list);
  });

  it('chat et conversations répondent 401 sans session, même avec userId client', async (t) => {
    if (!baseUrl) {
      t.skip('PostgreSQL non disponible');
      return;
    }

    const chat = await fetch(`${baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: 'forged-user',
        content: 'hello',
      }),
    });
    assert.equal(chat.status, 401);
    assertClearedSessionCookie(chat);

    const list = await fetch(`${baseUrl}/api/conversations?userId=forged-user`);
    assert.equal(list.status, 401);
    assertClearedSessionCookie(list);
  });

  it('isole les conversations par session et ignore un userId fourni par le client', async (t) => {
    if (!baseUrl || !historyService) {
      t.skip('PostgreSQL non disponible');
      return;
    }

    const registerA = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: `${prefix}-a@example.test`,
        password: 'password1',
      }),
    });
    const registerB = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: `${prefix}-b@example.test`,
        password: 'password1',
      }),
    });
    assert.equal(registerA.status, 201);
    assert.equal(registerB.status, 201);

    const tokenA = sessionTokenFromResponse(registerA)!;
    const tokenB = sessionTokenFromResponse(registerB)!;
    const userA = ((await registerA.json()) as { user: { id: string } }).user;
    const userB = ((await registerB.json()) as { user: { id: string } }).user;

    const conversation = await historyService.createConversation({
      userId: userA.id,
      title: 'Privée A',
    });

    const listB = await fetch(`${baseUrl}/api/conversations?userId=${userA.id}`, {
      headers: { Cookie: cookieHeader(tokenB) },
    });
    assert.equal(listB.status, 200);
    const bodyB = (await listB.json()) as { conversations: { id: string; userId: string }[] };
    assert.equal(bodyB.conversations.some((item) => item.id === conversation.id), false);
    assert.equal(
      bodyB.conversations.every((item) => item.userId === userB.id),
      true,
    );

    const listA = await fetch(`${baseUrl}/api/conversations`, {
      headers: { Cookie: cookieHeader(tokenA) },
    });
    const bodyA = (await listA.json()) as { conversations: { id: string }[] };
    assert.equal(bodyA.conversations.some((item) => item.id === conversation.id), true);

    const detailB = await fetch(
      `${baseUrl}/api/conversations/${conversation.id}?userId=${userA.id}`,
      { headers: { Cookie: cookieHeader(tokenB) } },
    );
    assert.equal(detailB.status, 404);

    const chatA = await fetch(`${baseUrl}/api/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: cookieHeader(tokenA),
      },
      body: JSON.stringify({
        userId: userB.id,
        content: 'hello',
      }),
    });
    assert.equal(chatA.status, 200);
    const chatBody = (await chatA.json()) as { conversationId: string };
    const created = await historyService.getConversationWithMessages(
      userA.id,
      chatBody.conversationId,
    );
    assert.ok(created);
    const leaked = await historyService.getConversationWithMessages(
      userB.id,
      chatBody.conversationId,
    );
    assert.equal(leaked, null);
  });

  it('rate-limite login et register', async (t) => {
    if (!pool) {
      t.skip('PostgreSQL non disponible');
      return;
    }

    const limiter = rateLimit({
      windowMs: 60_000,
      limit: 1,
      standardHeaders: true,
      legacyHeaders: false,
      validate: false,
      message: { error: 'Trop de tentatives. Réessayez plus tard.' },
    });
    const limitedAuth = new AuthService(pool, new PostgresSessionStore(pool));
    const limitedHistory = new ConversationService(new PostgresConversationStore(pool));
    const listening = await listen(createTestApp(limitedAuth, limitedHistory, limiter));

    try {
      const first = await fetch(`${listening.baseUrl}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: `${prefix}-rate1@example.test`,
          password: 'password1',
        }),
      });
      const second = await fetch(`${listening.baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: `${prefix}-rate1@example.test`,
          password: 'password1',
        }),
      });
      assert.equal(first.status, 201);
      assert.equal(second.status, 429);
    } finally {
      await new Promise<void>((resolve, reject) => {
        listening.server.close((error) => (error ? reject(error) : resolve()));
      });
    }
  });
});
