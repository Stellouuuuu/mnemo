/**
 * Erreurs HTTP typées pour distinguer stockage, Ollama et le reste.
 */

import type { ErrorRequestHandler } from 'express';

export class OllamaError extends Error {
  readonly statusCode: number = 502;

  constructor(message: string) {
    super(message);
    this.name = 'OllamaError';
  }
}

export class OllamaTimeoutError extends OllamaError {
  override readonly statusCode = 504;

  constructor(timeoutMs: number) {
    super(`Délai d'attente dépassé après ${timeoutMs} ms.`);
    this.name = 'OllamaTimeoutError';
  }
}

export class StorageError extends Error {
  readonly statusCode = 503;

  constructor(message: string) {
    super(message);
    this.name = 'StorageError';
  }
}

export class ConversationBusyError extends Error {
  readonly statusCode = 409;

  constructor(message = 'Une génération est déjà en cours pour cette conversation.') {
    super(message);
    this.name = 'ConversationBusyError';
  }
}

const NODE_NETWORK_CODES = new Set([
  'ECONNREFUSED',
  'ENOTFOUND',
  'ECONNRESET',
  'ETIMEDOUT',
  'EPIPE',
  'EHOSTUNREACH',
  'EAI_AGAIN',
]);

function readErrorCode(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null || !('code' in error)) {
    return undefined;
  }

  const code = (error as { code?: unknown }).code;
  return typeof code === 'string' ? code : undefined;
}

/**
 * Détecte une panne PostgreSQL / réseau de stockage (pg SQLSTATE ou errno Node).
 */
export function isStorageFailure(error: unknown): boolean {
  if (error instanceof StorageError) {
    return true;
  }

  const code = readErrorCode(error);
  if (code === undefined) {
    return false;
  }

  if (NODE_NETWORK_CODES.has(code)) {
    return true;
  }

  // SQLSTATE PostgreSQL (ex. 08006, 57P01, 28P01)
  return /^[0-9A-Z]{5}$/.test(code);
}

export function isEntityTooLarge(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) {
    return false;
  }

  const record = error as { type?: unknown; status?: unknown; statusCode?: unknown };
  return (
    record.type === 'entity.too.large' ||
    record.status === 413 ||
    record.statusCode === 413
  );
}

export interface HttpErrorBody {
  status: number;
  error: string;
  detail?: string;
}

/**
 * Mappe une exception du flux chat vers une réponse HTTP.
 * Postgres → 503 ; timeout Ollama → 504 ; Ollama → 502 ; busy → 409 ; reste → 500.
 */
export function httpErrorFromUnknown(error: unknown): HttpErrorBody {
  const detail = error instanceof Error ? error.message : 'Erreur inconnue';

  if (error instanceof ConversationBusyError) {
    return {
      status: 409,
      error: error.message,
      detail,
    };
  }

  if (error instanceof OllamaTimeoutError) {
    return {
      status: 504,
      error: "Le modèle local a dépassé le délai d'attente.",
      detail,
    };
  }

  if (error instanceof OllamaError) {
    return {
      status: 502,
      error: 'Échec de la communication avec le modèle local.',
      detail,
    };
  }

  if (isStorageFailure(error)) {
    return {
      status: 503,
      error: 'Le stockage des conversations est indisponible.',
      detail,
    };
  }

  return {
    status: 500,
    error: 'Erreur interne du serveur.',
    detail,
  };
}

/** Corps JSON public : `detail` seulement hors production. */
export function toPublicErrorBody(
  mapped: HttpErrorBody,
  includeDetail = process.env.NODE_ENV !== 'production',
): { error: string; detail?: string } {
  const body: { error: string; detail?: string } = { error: mapped.error };
  if (includeDetail && mapped.detail) {
    body.detail = mapped.detail;
  }
  return body;
}

/** Handler Express JSON : pas de stack ; detail seulement hors production. */
export const jsonApiErrorHandler: ErrorRequestHandler = (err, _req, res, next) => {
  if (res.headersSent) {
    next(err);
    return;
  }

  const mapped = httpErrorFromUnknown(err);
  res.status(mapped.status).json(toPublicErrorBody(mapped));
};
