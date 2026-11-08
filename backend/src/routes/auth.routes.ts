import { Router } from 'express';
import type { RequestHandler } from 'express';
import rateLimit from 'express-rate-limit';
import { AuthError, type AuthService } from '../auth/auth.service.js';
import {
  clearSessionCookie,
  SESSION_COOKIE_NAME,
  sessionCookieOptions,
} from '../auth/session-cookie.js';
import { env } from '../config/env.js';
import { isStorageFailure } from '../errors.js';

export function createAuthRateLimiter(): RequestHandler {
  return rateLimit({
    windowMs: env.AUTH_RATE_LIMIT_WINDOW_MS,
    limit: env.AUTH_RATE_LIMIT_MAX,
    standardHeaders: true,
    legacyHeaders: false,
    ...(env.TRUST_PROXY ? {} : { validate: { xForwardedForHeader: false } }),
    message: { error: 'Trop de tentatives. Réessayez plus tard.' },
  });
}

export function createAuthRouter(
  authService: AuthService | null,
  options?: { rateLimiter?: RequestHandler },
): Router {
  const router = Router();
  const limiter = options?.rateLimiter ?? createAuthRateLimiter();

  router.post('/register', limiter, async (req, res, next) => {
    if (!authService) {
      res.status(503).json({ error: "L'authentification nécessite PostgreSQL." });
      return;
    }

    const parsed = parseCredentials(req.body);
    if (!parsed.ok) {
      res.status(400).json({ error: parsed.error });
      return;
    }

    try {
      const result = await authService.register({
        email: parsed.email,
        password: parsed.password,
        displayName: parsed.displayName,
      });
      res.cookie(SESSION_COOKIE_NAME, result.sessionToken, sessionCookieOptions());
      res.status(201).json({ user: result.user });
    } catch (error) {
      handleAuthError(error, res, next);
    }
  });

  router.post('/login', limiter, async (req, res, next) => {
    if (!authService) {
      res.status(503).json({ error: "L'authentification nécessite PostgreSQL." });
      return;
    }

    const parsed = parseCredentials(req.body);
    if (!parsed.ok) {
      res.status(400).json({ error: parsed.error });
      return;
    }

    try {
      const result = await authService.login({
        email: parsed.email,
        password: parsed.password,
      });
      res.cookie(SESSION_COOKIE_NAME, result.sessionToken, sessionCookieOptions());
      res.json({ user: result.user });
    } catch (error) {
      handleAuthError(error, res, next);
    }
  });

  router.post('/logout', async (req, res, next) => {
    if (!authService) {
      res.status(503).json({ error: "L'authentification nécessite PostgreSQL." });
      return;
    }

    const token = readCookie(req.cookies, SESSION_COOKIE_NAME);
    try {
      if (token) {
        if (wantsLogoutAll(req.body, req.query)) {
          await authService.logoutAll(token);
        } else {
          await authService.logout(token);
        }
      }
      clearSessionCookie(res);
      res.status(204).send();
    } catch (error) {
      if (isStorageFailure(error)) {
        res.status(503).json({
          error: "Le service d'authentification est indisponible.",
        });
        return;
      }
      next(error);
    }
  });

  router.get('/me', async (req, res, next) => {
    if (!authService) {
      res.status(503).json({ error: "L'authentification nécessite PostgreSQL." });
      return;
    }

    const token = readCookie(req.cookies, SESSION_COOKIE_NAME);
    if (!token) {
      clearSessionCookie(res);
      res.status(401).json({ error: 'Authentification requise.' });
      return;
    }

    try {
      const user = await authService.getUserFromSessionToken(token);
      if (!user) {
        clearSessionCookie(res);
        res.status(401).json({ error: 'Authentification requise.' });
        return;
      }
      res.json({ user });
    } catch (error) {
      if (isStorageFailure(error)) {
        res.status(503).json({
          error: "Le service d'authentification est indisponible.",
        });
        return;
      }
      next(error);
    }
  });

  return router;
}

function handleAuthError(
  error: unknown,
  res: { status: (code: number) => { json: (body: unknown) => void } },
  next: (err: unknown) => void,
): void {
  if (error instanceof AuthError) {
    res.status(error.statusCode).json({ error: error.message });
    return;
  }
  next(error);
}

function parseCredentials(body: unknown):
  | { ok: true; email: string; password: string; displayName?: string }
  | { ok: false; error: string } {
  if (typeof body !== 'object' || body === null) {
    return { ok: false, error: 'Corps JSON invalide.' };
  }

  const record = body as Record<string, unknown>;
  if (typeof record.email !== 'string') {
    return { ok: false, error: 'Le champ "email" est obligatoire.' };
  }
  if (typeof record.password !== 'string') {
    return { ok: false, error: 'Le champ "password" est obligatoire.' };
  }

  const displayName =
    typeof record.displayName === 'string' ? record.displayName : undefined;

  return {
    ok: true,
    email: record.email,
    password: record.password,
    displayName,
  };
}

function wantsLogoutAll(body: unknown, query: unknown): boolean {
  if (typeof body === 'object' && body !== null && (body as { all?: unknown }).all === true) {
    return true;
  }

  if (typeof query === 'object' && query !== null) {
    const all = (query as { all?: unknown }).all;
    return all === '1' || all === 'true';
  }

  return false;
}

function readCookie(
  cookies: Record<string, unknown> | undefined,
  name: string,
): string | undefined {
  const value = cookies?.[name];
  if (typeof value !== 'string' || value.trim() === '') {
    return undefined;
  }
  return value;
}
