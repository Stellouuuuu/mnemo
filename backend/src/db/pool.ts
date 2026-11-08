import { Pool } from 'pg';
import { env } from '../config/env.js';

/**
 * Crée un pool PostgreSQL à partir de DATABASE_URL.
 * Ne logge jamais l'URL complète (secrets).
 */
export function createPoolFromEnv(connectionString = env.DATABASE_URL): Pool {
  if (!connectionString || connectionString.trim() === '') {
    throw new Error('DATABASE_URL est manquant pour le mode postgres.');
  }

  return new Pool({
    connectionString,
    // Évite de laisser des connexions ouvertes trop longtemps en dev
    max: 10,
  });
}

export function redactDatabaseUrl(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.password) {
      parsed.password = '***';
    }
    return parsed.toString();
  } catch {
    return '[invalid-database-url]';
  }
}
