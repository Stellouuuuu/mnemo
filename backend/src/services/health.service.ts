import type { Pool } from 'pg';
import { env } from '../config/env.js';
import { FetchTimeoutError, fetchWithTimeout } from '../http/fetch-with-timeout.js';

export type DependencyStatus = 'ok' | 'error' | 'skipped';

export interface DependencyCheck {
  status: DependencyStatus;
  /** Détail interne uniquement — jamais renvoyé par GET /health. */
  detail?: string;
}

export interface HealthReport {
  status: 'ok' | 'error';
  service: 'mnemo-backend';
  checks: {
    postgres: DependencyCheck;
    ollama: DependencyCheck;
  };
}

export interface PublicHealthCheck {
  status: DependencyStatus;
}

export interface PublicHealthReport {
  status: 'ok' | 'error';
  service: 'mnemo-backend';
  checks: {
    postgres: PublicHealthCheck;
    ollama: PublicHealthCheck;
  };
}

export async function checkPostgres(pool: Pool | undefined): Promise<DependencyCheck> {
  if (!pool) {
    return { status: 'skipped' };
  }

  try {
    await pool.query('SELECT 1');
    return { status: 'ok' };
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'Erreur inconnue';
    return { status: 'error', detail };
  }
}

export async function checkOllama(
  baseUrl = env.OLLAMA_BASE_URL,
  timeoutMs = env.HEALTH_CHECK_TIMEOUT_MS,
): Promise<DependencyCheck> {
  const url = `${baseUrl.replace(/\/$/, '')}/api/tags`;

  try {
    const response = await fetchWithTimeout(url, { method: 'GET' }, timeoutMs);
    if (!response.ok) {
      return {
        status: 'error',
        detail: `HTTP ${response.status}`,
      };
    }

    return { status: 'ok' };
  } catch (error) {
    if (error instanceof FetchTimeoutError) {
      return { status: 'error', detail: error.message };
    }

    const detail = error instanceof Error ? error.message : 'Erreur inconnue';
    return { status: 'error', detail };
  }
}

export async function buildHealthReport(pool: Pool | undefined): Promise<HealthReport> {
  const [postgres, ollama] = await Promise.all([
    checkPostgres(pool),
    checkOllama(),
  ]);

  const postgresRequired = pool !== undefined;
  const failed =
    ollama.status === 'error' || (postgresRequired && postgres.status === 'error');

  if (postgres.status === 'error') {
    console.error('health check failed: postgres');
  }
  if (ollama.status === 'error') {
    console.error('health check failed: ollama');
  }

  return {
    status: failed ? 'error' : 'ok',
    service: 'mnemo-backend',
    checks: { postgres, ollama },
  };
}

/** Réponse publique : statuts uniquement, aucun détail d’infrastructure. */
export function toPublicHealthReport(report: HealthReport): PublicHealthReport {
  return {
    status: report.status,
    service: report.service,
    checks: {
      postgres: { status: report.checks.postgres.status },
      ollama: { status: report.checks.ollama.status },
    },
  };
}
