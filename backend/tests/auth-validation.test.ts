import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  assertDisplayName,
  assertEmail,
  assertPassword,
  AuthError,
  MAX_DISPLAY_NAME_LENGTH,
  normalizeEmail,
} from '../src/auth/auth.service.js';

describe('validation auth', () => {
  it('normalizeEmail trim et lower-case', () => {
    assert.equal(normalizeEmail('  Ada@Example.TEST  '), 'ada@example.test');
  });

  it('assertEmail refuse une adresse invalide', () => {
    assert.throws(() => assertEmail('pas-un-email'), AuthError);
    assert.throws(() => assertEmail('a@b'), AuthError);
  });

  it('assertEmail accepte une adresse simple', () => {
    assert.doesNotThrow(() => assertEmail('ada@example.test'));
  });

  it('assertPassword refuse trop court ou trop long', () => {
    assert.throws(() => assertPassword('short'), (error: unknown) => {
      return error instanceof AuthError && error.statusCode === 400;
    });
    assert.throws(() => assertPassword('x'.repeat(73)), AuthError);
  });

  it('assertPassword accepte 8 à 72 caractères', () => {
    assert.doesNotThrow(() => assertPassword('password1'));
    assert.doesNotThrow(() => assertPassword('x'.repeat(72)));
  });

  it('assertDisplayName refuse au-delà de la limite', () => {
    assert.doesNotThrow(() => assertDisplayName(null));
    assert.doesNotThrow(() => assertDisplayName('Ada'));
    assert.throws(
      () => assertDisplayName('a'.repeat(MAX_DISPLAY_NAME_LENGTH + 1)),
      AuthError,
    );
  });
});
