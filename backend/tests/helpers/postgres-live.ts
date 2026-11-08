import 'dotenv/config';
import type { Pool } from 'pg';
import { runMigrations } from '../../src/db/migrate.js';
import { createPoolFromEnv } from '../../src/db/pool.js';

export function isPostgresRequired(): boolean {
  return process.env.STELLA_REQUIRE_POSTGRES === '1';
}

/**
 * Ouvre un pool live, applique les migrations.
 * En mode test:postgres (STELLA_REQUIRE_POSTGRES=1) : throw si indisponible.
 */
export async function tryCreateLivePostgresPool(): Promise<Pool | null> {
  const required = isPostgresRequired();
  const databaseUrl = process.env.DATABASE_URL?.trim();

  if (!databaseUrl) {
    if (required) {
      throw new Error(
        'test:postgres exige DATABASE_URL. Vérifiez backend/.env ou exportez la variable.',
      );
    }
    return null;
  }

  const pool = createPoolFromEnv(databaseUrl);

  const attempts = 3;
  let lastError: unknown;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      await pool.query('SELECT 1');
      await runMigrations(pool);
      return pool;
    } catch (error) {
      lastError = error;
      if (attempt < attempts) {
        await new Promise((resolve) => setTimeout(resolve, 100 * attempt));
      }
    }
  }

  await pool.end().catch(() => undefined);
  const detail = lastError instanceof Error ? lastError.message : String(lastError);
  if (required) {
    throw new Error(`PostgreSQL indisponible pour test:postgres : ${detail}`);
  }
  return null;
}
