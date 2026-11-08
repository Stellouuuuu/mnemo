import type { RequestHandler } from 'express';
import type { AuthService } from '../auth/auth.service.js';
import { clearSessionCookie, SESSION_COOKIE_NAME } from '../auth/session-cookie.js';
import { isStorageFailure } from '../errors.js';

export function createRequireAuth(authService: AuthService | null): RequestHandler {
  return async (req, res, next) => {
    if (!authService) {
      res.status(503).json({
        error: "L'authentification nécessite PostgreSQL.",
      });
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

      req.userId = user.id;
      next();
    } catch (error) {
      if (isStorageFailure(error)) {
        res.status(503).json({
          error: "Le service d'authentification est indisponible.",
        });
        return;
      }
      next(error);
    }
  };
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
