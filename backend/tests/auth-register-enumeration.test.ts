import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Pool } from 'pg';
import {
  AuthError,
  AuthService,
  REGISTER_CONFLICT_PUBLIC,
} from '../src/auth/auth.service.js';
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

describe('register — énumération d’e-mails', () => {
  it('ne révèle pas l’existence d’un compte dans le corps public', async () => {
    const pool = {
      async query(sql: string) {
        if (String(sql).includes('INSERT')) {
          throw Object.assign(new Error('duplicate key value violates unique constraint'), {
            code: '23505',
          });
        }
        return { rows: [] };
      },
    } as unknown as Pool;

    const auth = new AuthService(pool, fakeSessions());
    await assert.rejects(
      () =>
        auth.register({
          email: 'already@example.test',
          password: 'password1',
        }),
      (error: unknown) =>
        error instanceof AuthError &&
        error.statusCode === 400 &&
        error.message === REGISTER_CONFLICT_PUBLIC,
    );
    assert.equal(/existe déjà/i.test(REGISTER_CONFLICT_PUBLIC), false);
    assert.equal(/e-mail/i.test(REGISTER_CONFLICT_PUBLIC), false);
  });

  it('crée un compte pour un e-mail inexistant (corps distinct, sans mention de conflit)', async () => {
    const pool = {
      async query(sql: string) {
        if (String(sql).includes('INSERT')) {
          return {
            rows: [
              {
                id: 'user-new',
                email: 'new@example.test',
                password_hash: 'hash',
                display_name: null,
              },
            ],
          };
        }
        return { rows: [] };
      },
    } as unknown as Pool;

    const auth = new AuthService(pool, fakeSessions());
    const result = await auth.register({
      email: 'new@example.test',
      password: 'password1',
    });
    assert.equal(result.user.email, 'new@example.test');
    assert.equal(result.user.id, 'user-new');
    assert.ok(result.sessionToken);
  });
});
