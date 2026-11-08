import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { AsyncSemaphore } from '../src/http/async-semaphore.js';
import { FetchAbortedError } from '../src/http/fetch-with-timeout.js';
import { delay } from './helpers/async.js';

describe('AsyncSemaphore', () => {
  it('limite le nombre d’acquisitions simultanées', async () => {
    const semaphore = new AsyncSemaphore(2);
    let inFlight = 0;
    let maxInFlight = 0;

    async function task(): Promise<void> {
      const release = await semaphore.acquire();
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await delay(40);
      inFlight -= 1;
      release();
    }

    await Promise.all([task(), task(), task()]);
    assert.equal(maxInFlight, 2);
    assert.equal(semaphore.activeCount, 0);
    assert.equal(semaphore.pendingCount, 0);
  });

  it('annule un waiter si le signal abort', async () => {
    const semaphore = new AsyncSemaphore(1);
    const first = await semaphore.acquire();
    const controller = new AbortController();
    const pending = semaphore.acquire(controller.signal);
    controller.abort();
    await assert.rejects(pending, (error: unknown) => error instanceof FetchAbortedError);
    first();
  });
});
