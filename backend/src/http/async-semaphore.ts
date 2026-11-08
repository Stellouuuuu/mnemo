import { FetchAbortedError } from './fetch-with-timeout.js';

interface Waiter {
  grant: () => void;
  reject: (error: Error) => void;
  signal?: AbortSignal;
  onAbort?: () => void;
}

/**
 * Sémaphore async : au plus `max` acquisitions simultanées, file d'attente FIFO.
 */
export class AsyncSemaphore {
  private active = 0;
  private readonly waiters: Waiter[] = [];

  constructor(private readonly max: number) {
    if (!Number.isFinite(max) || max < 1) {
      throw new Error('Le sémaphore exige max >= 1.');
    }
  }

  get activeCount(): number {
    return this.active;
  }

  get pendingCount(): number {
    return this.waiters.length;
  }

  async acquire(signal?: AbortSignal): Promise<() => void> {
    if (signal?.aborted) {
      throw new FetchAbortedError();
    }

    if (this.active < this.max) {
      this.active += 1;
      return this.makeReleaser();
    }

    await new Promise<void>((resolve, reject) => {
      let settled = false;

      const waiter: Waiter = {
        grant: () => {
          if (settled) {
            return;
          }
          settled = true;
          resolve();
        },
        reject: (error) => {
          if (settled) {
            return;
          }
          settled = true;
          reject(error);
        },
        signal,
      };

      const onAbort = () => {
        const index = this.waiters.indexOf(waiter);
        if (index >= 0) {
          this.waiters.splice(index, 1);
        }
        waiter.reject(new FetchAbortedError());
      };

      waiter.onAbort = onAbort;
      signal?.addEventListener('abort', onAbort, { once: true });
      this.waiters.push(waiter);
    });

    return this.makeReleaser();
  }

  private makeReleaser(): () => void {
    let released = false;
    return () => {
      if (released) {
        return;
      }
      released = true;
      this.release();
    };
  }

  private release(): void {
    const next = this.waiters.shift();
    if (next) {
      if (next.signal && next.onAbort) {
        next.signal.removeEventListener('abort', next.onAbort);
      }
      next.grant();
      return;
    }

    this.active = Math.max(0, this.active - 1);
  }
}
