import type { RequestHandler } from 'express';
import { env } from '../config/env.js';
import { expandLoopbackOrigins } from '../http/allowed-origins.js';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * CSRF : pour les méthodes mutables, si le navigateur envoie Origin,
 * elle doit correspondre à FRONTEND_ORIGIN (ou l’alias loopback
 * localhost ↔ 127.0.0.1 du même port).
 * Absence d’Origin (curl, tests, outils locaux) : autorisée.
 * Ne remplace pas CORS.
 */
export function requireAllowedOrigin(
  allowedOrigin = env.FRONTEND_ORIGIN,
): RequestHandler {
  const allowed = expandLoopbackOrigins(allowedOrigin);

  return (req, res, next) => {
    if (SAFE_METHODS.has(req.method)) {
      next();
      return;
    }

    const origin = readOrigin(req.headers.origin);
    if (origin === undefined) {
      next();
      return;
    }

    if (origin === '*' || !allowed.has(origin)) {
      res.status(403).json({ error: 'Origine non autorisée.' });
      return;
    }

    next();
  };
}

function readOrigin(raw: string | string[] | undefined): string | undefined {
  if (typeof raw !== 'string') {
    return undefined;
  }

  const origin = raw.trim();
  return origin === '' ? undefined : origin;
}
