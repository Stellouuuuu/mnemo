import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Pool } from 'pg';
import {
  AuthError,
  AuthService,
  INVALID_CREDENTIALS,
  MAX_PASSWORD_LENGTH,
} from '../src/auth/auth.service.js';
import { DUMMY_PASSWORD_HASH } from '../src/auth/password.js';
import type { PostgresSessionStore } from '../src/auth/postgres-session-store.js';

function fakeSessions(): PostgresSessionStore {
  return {
    async create() {
      return {
        id: 'session-1',
        userId: 'user-1',
        tokenHash: 'hash',
        expiresAt: new Date(),
        createdAt: new Date(),
      };
    },
  } as unknown as PostgresSessionStore;
}

describe('login — longueur du mot de passe', () => {
  it('refuse 73 caractères avec 400 avant bcrypt', async () => {
    let queried = false;
    const pool = {
      async query() {
        queried = true;
        throw new Error('query should not run');
      },
    } as unknown as Pool;

    const auth = new AuthService(pool, fakeSessions());
    await assert.rejects(
      () =>
        auth.login({
          email: 'ada@example.test',
          password: 'x'.repeat(MAX_PASSWORD_LENGTH + 1),
        }),
      (error: unknown) =>
        error instanceof AuthError &&
        error.statusCode === 400 &&
        error.message === 'Le mot de passe est trop long.',
    );
    assert.equal(queried, false);
  });

  it('conserve 401 INVALID_CREDENTIALS pour un mauvais mot de passe normal', async () => {
    const pool = {
      async query() {
        return {
          rows: [
            {
              id: 'user-1',
              email: 'ada@example.test',
              password_hash: DUMMY_PASSWORD_HASH,
              display_name: null,
            },
          ],
        };
      },
    } as unknown as Pool;

    const auth = new AuthService(pool, fakeSessions());
    await assert.rejects(
      () =>
        auth.login({
          email: 'ada@example.test',
          password: 'password1',
        }),
      (error: unknown) =>
        error instanceof AuthError &&
        error.statusCode === 401 &&
        error.message === INVALID_CREDENTIALS,
    );
  });
});
