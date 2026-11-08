import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  DUMMY_PASSWORD_HASH,
  hashPassword,
  verifyPassword,
  verifyPasswordAgainstDummy,
} from '../src/auth/password.js';

describe('password hashing', () => {
  it('hash puis verify un mot de passe', async () => {
    const digest = await hashPassword('password1');
    assert.equal(await verifyPassword('password1', digest), true);
    assert.equal(await verifyPassword('otherpass', digest), false);
    assert.match(digest, /^\$2[aby]\$12\$/);
  });

  it('le hash dummy n’est pas un mot de passe réel et compare sans lever', async () => {
    assert.equal(DUMMY_PASSWORD_HASH.includes('password1'), false);
    await verifyPasswordAgainstDummy('password1');
    await verifyPasswordAgainstDummy('unknown');
    assert.equal(await verifyPassword('stella-dummy-not-a-password', DUMMY_PASSWORD_HASH), true);
  });
});
