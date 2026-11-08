import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  isGenerationLocked,
  tryAcquireGenerationLock,
} from '../src/chat/generation-lock.js';

describe('generation-lock', () => {
  it('refuse un second acquire tant que le premier n’est pas libéré', () => {
    const id = `lock-${Date.now()}-${Math.random()}`;
    const release = tryAcquireGenerationLock(id);
    assert.ok(release);
    assert.equal(isGenerationLocked(id), true);
    assert.equal(tryAcquireGenerationLock(id), null);

    release();
    assert.equal(isGenerationLocked(id), false);
    const again = tryAcquireGenerationLock(id);
    assert.ok(again);
    again();
  });

  it('ignore un double release', () => {
    const id = `lock-double-${Date.now()}-${Math.random()}`;
    const release = tryAcquireGenerationLock(id);
    assert.ok(release);
    release();
    release();
    assert.equal(isGenerationLocked(id), false);
  });

  it('se libère dans un finally après succès', () => {
    const id = `lock-ok-${Date.now()}-${Math.random()}`;
    const release = tryAcquireGenerationLock(id);
    try {
      assert.equal(isGenerationLocked(id), true);
    } finally {
      release?.();
    }
    assert.equal(isGenerationLocked(id), false);
  });

  it('se libère dans un finally après exception', () => {
    const id = `lock-err-${Date.now()}-${Math.random()}`;
    const release = tryAcquireGenerationLock(id);
    try {
      throw new Error('échec simulé');
    } catch {
      assert.equal(isGenerationLocked(id), true);
    } finally {
      release?.();
    }
    assert.equal(isGenerationLocked(id), false);
  });

  it('se libère dans un finally après timeout simulé', () => {
    const id = `lock-to-${Date.now()}-${Math.random()}`;
    const release = tryAcquireGenerationLock(id);
    try {
      const timeout = new Error('timeout');
      timeout.name = 'OllamaTimeoutError';
      throw timeout;
    } catch {
      // attendu
    } finally {
      release?.();
    }
    assert.equal(isGenerationLocked(id), false);
    const again = tryAcquireGenerationLock(id);
    assert.ok(again);
    again();
  });
});
