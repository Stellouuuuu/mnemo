import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  generateSessionToken,
  hashSessionToken,
} from '../src/auth/session-token.js';

describe('session token opaque', () => {
  it('génère un token aléatoire distinct de son hash SHA-256', () => {
    const token = generateSessionToken();
    const digest = hashSessionToken(token);

    assert.notEqual(token, digest);
    assert.equal(digest, hashSessionToken(token));
    assert.notEqual(hashSessionToken(token), hashSessionToken(generateSessionToken()));
    assert.equal(digest.length, 64);
  });
});
