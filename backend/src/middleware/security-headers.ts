import type { RequestHandler } from 'express';

/**
 * Headers de sécurité minimaux pour une API JSON (sans CSP agressive).
 */
export function securityHeaders(): RequestHandler {
  return (_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Frame-Options', 'DENY');
    next();
  };
}
