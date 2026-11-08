import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { describe, it } from 'node:test';
import express from 'express';
import { requireAllowedOrigin } from '../src/middleware/require-allowed-origin.js';
import { securityHeaders } from '../src/middleware/security-headers.js';
import { toPublicHealthReport, type HealthReport } from '../src/services/health.service.js';

const ALLOWED = 'http://localhost:5173';

async function listen(app: express.Express): Promise<{ baseUrl: string; server: Server }> {
  const server = createServer(app);
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve());
  });
  const address = server.address() as AddressInfo;
  return { baseUrl: `http://127.0.0.1:${address.port}`, server };
}

function closeServer(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

function securityApp(): express.Express {
  const app = express();
  app.use(express.json());
  app.use(securityHeaders());
  app.use('/api', requireAllowedOrigin(ALLOWED));
  app.get('/health', (_req, res) => {
    const report: HealthReport = {
      status: 'error',
      service: 'stella-ai-backend',
      checks: {
        postgres: {
          status: 'error',
          detail: 'password authentication failed for user "stella"',
        },
        ollama: { status: 'ok' },
      },
    };
    res.status(503).json(toPublicHealthReport(report));
  });
  app.post('/api/chat', (_req, res) => {
    res.json({ ok: true });
  });
  app.post('/api/auth/login', (_req, res) => {
    res.json({ ok: true });
  });
  app.delete('/api/conversations/x', (_req, res) => {
    res.status(204).send();
  });
  return app;
}

describe('headers de sécurité', () => {
  it('pose X-Content-Type-Options, Referrer-Policy et X-Frame-Options', async () => {
    const { baseUrl, server } = await listen(securityApp());
    try {
      const response = await fetch(`${baseUrl}/health`);
      assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
      assert.equal(response.headers.get('referrer-policy'), 'no-referrer');
      assert.equal(response.headers.get('x-frame-options'), 'DENY');
    } finally {
      await closeServer(server);
    }
  });
});

describe('GET /health public', () => {
  it('n’expose aucune information interne si Postgres est en erreur', async () => {
    const { baseUrl, server } = await listen(securityApp());
    try {
      const response = await fetch(`${baseUrl}/health`);
      assert.equal(response.status, 503);
      const body = (await response.json()) as {
        status?: string;
        checks?: { postgres?: { status?: string; detail?: string } };
      };
      const serialized = JSON.stringify(body);
      assert.equal(body.status, 'error');
      assert.equal(body.checks?.postgres?.status, 'error');
      assert.equal(body.checks?.postgres?.detail, undefined);
      assert.equal(serialized.includes('password'), false);
      assert.equal(serialized.includes('authentication'), false);
    } finally {
      await closeServer(server);
    }
  });
});

describe('Origin / CSRF sur routes mutables', () => {
  it('accepte l’alias loopback localhost ↔ 127.0.0.1', async () => {
    const { baseUrl, server } = await listen(securityApp());
    try {
      const response = await fetch(`${baseUrl}/api/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Origin: 'http://127.0.0.1:5173',
        },
        body: JSON.stringify({ content: 'Bonjour' }),
      });
      assert.equal(response.status, 200);
    } finally {
      await closeServer(server);
    }
  });

  it('accepte l’origine autorisée', async () => {
    const { baseUrl, server } = await listen(securityApp());
    try {
      const response = await fetch(`${baseUrl}/api/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Origin: ALLOWED,
        },
        body: JSON.stringify({ content: 'Bonjour' }),
      });
      assert.equal(response.status, 200);
    } finally {
      await closeServer(server);
    }
  });

  it('refuse une origine étrangère (403)', async () => {
    const { baseUrl, server } = await listen(securityApp());
    try {
      const chat = await fetch(`${baseUrl}/api/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Origin: 'https://evil.example',
        },
        body: JSON.stringify({ content: 'Bonjour' }),
      });
      const auth = await fetch(`${baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Origin: 'https://evil.example',
        },
        body: JSON.stringify({ email: 'a@b.c', password: 'password1' }),
      });
      const del = await fetch(`${baseUrl}/api/conversations/x`, {
        method: 'DELETE',
        headers: { Origin: 'https://evil.example' },
      });
      assert.equal(chat.status, 403);
      assert.equal(auth.status, 403);
      assert.equal(del.status, 403);
      const body = (await chat.json()) as { error?: string };
      assert.match(body.error ?? '', /Origine/);
    } finally {
      await closeServer(server);
    }
  });

  it('autorise l’absence d’Origin (CLI / tests)', async () => {
    const { baseUrl, server } = await listen(securityApp());
    try {
      const response = await fetch(`${baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: 'Bonjour' }),
      });
      assert.equal(response.status, 200);
    } finally {
      await closeServer(server);
    }
  });
});
