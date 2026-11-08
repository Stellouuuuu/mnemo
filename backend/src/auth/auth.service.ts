import { randomUUID } from 'node:crypto';
import type { Pool, QueryResultRow } from 'pg';
import { env } from '../config/env.js';
import {
  hashPassword,
  verifyPassword,
  verifyPasswordAgainstDummy,
} from './password.js';
import { PostgresSessionStore } from './postgres-session-store.js';
import { generateSessionToken, hashSessionToken } from './session-token.js';

export class AuthError extends Error {
  readonly statusCode: number;

  constructor(statusCode: number, message: string) {
    super(message);
    this.name = 'AuthError';
    this.statusCode = statusCode;
  }
}

export interface PublicUser {
  id: string;
  email: string;
  displayName: string | null;
}

interface UserRow extends QueryResultRow {
  id: string;
  email: string | null;
  password_hash: string | null;
  display_name: string | null;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 8;
export const MAX_PASSWORD_LENGTH = 72;
export const MAX_DISPLAY_NAME_LENGTH = 80;
export const INVALID_CREDENTIALS = 'E-mail ou mot de passe incorrect.';
export const REGISTER_CONFLICT_PUBLIC =
  'Impossible de créer un compte avec ces informations.';

export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

export function assertEmail(email: string): void {
  if (email.length < 3 || email.length > 254 || !EMAIL_PATTERN.test(email)) {
    throw new AuthError(400, 'Adresse e-mail invalide.');
  }
}

export function assertPassword(password: string): void {
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new AuthError(
      400,
      `Le mot de passe doit contenir au moins ${MIN_PASSWORD_LENGTH} caractères.`,
    );
  }

  if (password.length > MAX_PASSWORD_LENGTH) {
    throw new AuthError(400, 'Le mot de passe est trop long.');
  }
}

export function assertDisplayName(displayName: string | null): void {
  if (displayName !== null && displayName.length > MAX_DISPLAY_NAME_LENGTH) {
    throw new AuthError(
      400,
      `Le nom affiché ne doit pas dépasser ${MAX_DISPLAY_NAME_LENGTH} caractères.`,
    );
  }
}

function toPublicUser(row: UserRow): PublicUser {
  if (row.email === null) {
    throw new AuthError(401, 'Compte non connectable.');
  }

  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
  };
}

export class AuthService {
  constructor(
    private readonly pool: Pool,
    private readonly sessions: PostgresSessionStore,
    private readonly ttlMs = env.SESSION_TTL_MS,
  ) {}

  async register(input: {
    email: string;
    password: string;
    displayName?: string;
  }): Promise<{ user: PublicUser; sessionToken: string }> {
    const email = normalizeEmail(input.email);
    assertEmail(email);
    assertPassword(input.password);

    const displayName = input.displayName?.trim() || null;
    assertDisplayName(displayName);

    const passwordHash = await hashPassword(input.password);
    const id = randomUUID();

    try {
      const inserted = await this.pool.query<UserRow>(
        `INSERT INTO users (id, email, password_hash, display_name)
         VALUES ($1, $2, $3, $4)
         RETURNING id, email, password_hash, display_name`,
        [id, email, passwordHash, displayName],
      );

      const user = toPublicUser(inserted.rows[0]!);
      const sessionToken = await this.createSession(user.id);
      return { user, sessionToken };
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new AuthError(400, REGISTER_CONFLICT_PUBLIC);
      }
      throw error;
    }
  }

  async login(input: {
    email: string;
    password: string;
  }): Promise<{ user: PublicUser; sessionToken: string }> {
    const email = normalizeEmail(input.email);
    assertEmail(email);
    if (input.password.length > MAX_PASSWORD_LENGTH) {
      throw new AuthError(400, 'Le mot de passe est trop long.');
    }

    const result = await this.pool.query<UserRow>(
      `SELECT id, email, password_hash, display_name
       FROM users
       WHERE email = $1 AND password_hash IS NOT NULL`,
      [email],
    );

    const row = result.rows[0];
    if (!row || row.password_hash === null) {
      await verifyPasswordAgainstDummy(input.password);
      throw new AuthError(401, INVALID_CREDENTIALS);
    }

    const ok = await verifyPassword(input.password, row.password_hash);
    if (!ok) {
      throw new AuthError(401, INVALID_CREDENTIALS);
    }

    const user = toPublicUser(row);
    const sessionToken = await this.createSession(user.id);
    return { user, sessionToken };
  }

  async logout(sessionToken: string): Promise<void> {
    const tokenHash = hashSessionToken(sessionToken);
    await this.sessions.deleteByTokenHash(tokenHash);
  }

  async logoutAll(sessionToken: string): Promise<void> {
    const user = await this.getUserFromSessionToken(sessionToken);
    if (user) {
      await this.sessions.deleteByUserId(user.id);
      return;
    }

    await this.logout(sessionToken);
  }

  async getUserFromSessionToken(sessionToken: string): Promise<PublicUser | null> {
    const tokenHash = hashSessionToken(sessionToken);
    const session = await this.sessions.findValidByTokenHash(tokenHash);
    if (!session) {
      return null;
    }

    const result = await this.pool.query<UserRow>(
      `SELECT id, email, password_hash, display_name
       FROM users
       WHERE id = $1 AND email IS NOT NULL AND password_hash IS NOT NULL`,
      [session.userId],
    );

    const row = result.rows[0];
    if (!row) {
      return null;
    }

    return toPublicUser(row);
  }

  private async createSession(userId: string): Promise<string> {
    const sessionToken = generateSessionToken();
    const tokenHash = hashSessionToken(sessionToken);
    const expiresAt = new Date(Date.now() + this.ttlMs);
    await this.sessions.create({ userId, tokenHash, expiresAt });
    return sessionToken;
  }
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === '23505'
  );
}
