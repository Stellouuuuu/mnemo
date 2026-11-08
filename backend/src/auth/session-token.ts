import { createHash, randomBytes } from 'node:crypto';

const TOKEN_BYTES = 32;

/** Token opaque envoyé au client (cookie). Ne jamais persister cette valeur. */
export function generateSessionToken(): string {
  return randomBytes(TOKEN_BYTES).toString('base64url');
}

/** Hash SHA-256 hexadécimal pour stockage PostgreSQL. */
export function hashSessionToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}
