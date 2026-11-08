export class FetchTimeoutError extends Error {
  readonly timeoutMs: number;

  constructor(timeoutMs: number) {
    super(`Délai d'attente dépassé après ${timeoutMs} ms.`);
    this.name = 'FetchTimeoutError';
    this.timeoutMs = timeoutMs;
  }
}

export class FetchAbortedError extends Error {
  constructor(message = 'Requête annulée.') {
    super(message);
    this.name = 'FetchAbortedError';
  }
}

export function isAbortOrTimeoutError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) {
    return false;
  }

  const record = error as { name?: unknown; code?: unknown };
  return (
    record.name === 'AbortError' ||
    record.name === 'TimeoutError' ||
    record.code === 'ABORT_ERR'
  );
}

export function combineAbortSignals(signals: AbortSignal[]): AbortSignal {
  const active = signals.filter((signal) => signal !== undefined);
  if (active.length === 0) {
    return new AbortController().signal;
  }
  if (active.length === 1) {
    return active[0]!;
  }

  if (typeof AbortSignal.any === 'function') {
    return AbortSignal.any(active);
  }

  const controller = new AbortController();
  const onAbort = () => controller.abort();
  for (const signal of active) {
    if (signal.aborted) {
      controller.abort();
      return controller.signal;
    }
    signal.addEventListener('abort', onAbort, { once: true });
  }
  return controller.signal;
}

export async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
  externalSignal?: AbortSignal,
): Promise<Response> {
  if (externalSignal?.aborted) {
    throw new FetchAbortedError();
  }

  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new FetchTimeoutError(timeoutMs);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  const onAbort = () => controller.abort();
  externalSignal?.addEventListener('abort', onAbort, { once: true });
  if (init.signal) {
    init.signal.addEventListener('abort', onAbort, { once: true });
  }

  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (error) {
    if (error instanceof FetchTimeoutError || error instanceof FetchAbortedError) {
      throw error;
    }

    if (externalSignal?.aborted) {
      throw new FetchAbortedError();
    }

    if (isAbortOrTimeoutError(error)) {
      throw new FetchTimeoutError(timeoutMs);
    }

    throw error;
  } finally {
    clearTimeout(timer);
    externalSignal?.removeEventListener('abort', onAbort);
    init.signal?.removeEventListener('abort', onAbort);
  }
}
