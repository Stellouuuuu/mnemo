import type { RequestHandler } from 'express';
import rateLimit from 'express-rate-limit';
import { env } from '../config/env.js';

export const CHAT_RATE_LIMIT_MESSAGE = {
  error: 'Trop de requêtes. Réessayez plus tard.',
} as const;

export interface ChatRateLimiterOptions {
  windowMs?: number;
  limit?: number;
  /** Désactiver les validations express-rate-limit (tests). */
  validate?: false;
}

/**
 * Rate limit POST /api/chat par userId (après requireAuth).
 * Distinct du sémaphore Ollama : celui-ci borne la file HTTP, pas seulement
 * les générations simultanées.
 */
export function createChatRateLimiter(
  options?: ChatRateLimiterOptions,
): RequestHandler {
  const validate =
    options?.validate === false
      ? false
      : env.TRUST_PROXY
        ? undefined
        : { xForwardedForHeader: false as const, keyGeneratorIpFallback: false as const };

  return rateLimit({
    windowMs: options?.windowMs ?? env.CHAT_RATE_LIMIT_WINDOW_MS,
    limit: options?.limit ?? env.CHAT_RATE_LIMIT_MAX,
    standardHeaders: true,
    legacyHeaders: false,
    ...(validate === undefined ? {} : { validate }),
    keyGenerator: (req) => {
      const userId = req.userId;
      if (typeof userId === 'string' && userId.trim() !== '') {
        return `chat:${userId}`;
      }

      return `chat:ip:${req.ip ?? 'unknown'}`;
    },
    message: CHAT_RATE_LIMIT_MESSAGE,
  });
}
