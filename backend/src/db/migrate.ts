import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import type { Pool } from 'pg';
import { createPoolFromEnv } from './pool.js';

async function ensureMigrationsTable(pool: Pool): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
}

function resolveMigrationsDir(): string {
  const candidates = [
    path.join(__dirname, 'migrations'),
    path.join(process.cwd(), 'src/db/migrations'),
    path.join(process.cwd(), 'dist/db/migrations'),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  throw new Error(
    'Dossier de migrations introuvable (src/db/migrations ou dist/db/migrations).',
  );
}

export async function runMigrations(pool: Pool): Promise<string[]> {
  await ensureMigrationsTable(pool);

  const dir = resolveMigrationsDir();
  const files = fs
    .readdirSync(dir)
    .filter((name) => name.endsWith('.sql'))
    .sort();

  const applied: string[] = [];

  for (const file of files) {
    const id = file;
    const existing = await pool.query(
      'SELECT 1 FROM schema_migrations WHERE id = $1',
      [id],
    );

    if ((existing.rowCount ?? 0) > 0) {
      continue;
    }

    const sql = fs.readFileSync(path.join(dir, file), 'utf8');
    const client = await pool.connect();

    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (id) VALUES ($1)', [id]);
      await client.query('COMMIT');
      applied.push(id);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  return applied;
}

async function main(): Promise<void> {
  if (!process.env.DATABASE_URL || process.env.DATABASE_URL.trim() === '') {
    console.error('DATABASE_URL est requis pour exécuter les migrations.');
    process.exit(1);
  }

  const pool = createPoolFromEnv();

  try {
    const applied = await runMigrations(pool);
    if (applied.length === 0) {
      console.log('Migrations : déjà à jour.');
    } else {
      console.log(`Migrations appliquées : ${applied.join(', ')}`);
    }
  } finally {
    await pool.end();
  }
}

const isDirectRun = require.main === module;
if (isDirectRun) {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Échec des migrations : ${message}`);
    process.exit(1);
  });
}
