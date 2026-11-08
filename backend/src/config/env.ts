import 'dotenv/config';

function readEnv(name: string, fallback: string): string {
  const value = process.env[name];
  if (value === undefined || value.trim() === '') {
    return fallback;
  }
  return value;
}

function readOptionalEnv(name: string): string | undefined {
  const value = process.env[name];
  if (value === undefined || value.trim() === '') {
    return undefined;
  }
  return value;
}

export type MemoryStoreMode = 'inmemory' | 'postgres';

function resolveMemoryStore(): MemoryStoreMode {
  const configured = readOptionalEnv('MEMORY_STORE')?.toLowerCase();

  if (configured === 'postgres') {
    return 'postgres';
  }

  if (configured === 'inmemory') {
    return 'inmemory';
  }

  // Défaut : postgres seulement si DATABASE_URL est présent et MEMORY_STORE=postgres
  // Sinon inmemory pour rester compatible git clone.
  return 'inmemory';
}

function readEnvNumber(name: string, fallback: number): number {
  const raw = readOptionalEnv(name);
  if (raw === undefined) {
    return fallback;
  }

  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return parsed;
}

export const env = {
  PORT: Number(readEnv('PORT', '3000')),
  /** Interface d’écoute. Défaut loopback ; 0.0.0.0 seulement si exposé volontairement. */
  HOST: readEnv('HOST', '127.0.0.1'),
  OLLAMA_BASE_URL: readEnv('OLLAMA_BASE_URL', 'http://localhost:11434'),
  OLLAMA_MODEL: readEnv('OLLAMA_MODEL', 'qwen2.5:3b'),
  MEMORY_STORE: resolveMemoryStore(),
  DATABASE_URL: readOptionalEnv('DATABASE_URL'),
  /** Timeout des appels /api/chat Ollama (ms). */
  OLLAMA_TIMEOUT_MS: readEnvNumber('OLLAMA_TIMEOUT_MS', 60_000),
  /** Timeout des probes /health (ms). */
  HEALTH_CHECK_TIMEOUT_MS: readEnvNumber('HEALTH_CHECK_TIMEOUT_MS', 3_000),
  /** Taille max d'un message user/assistant dans POST /api/chat. */
  CHAT_MAX_MESSAGE_CHARS: readEnvNumber('CHAT_MAX_MESSAGE_CHARS', 8_000),
  /** Nombre max de messages d'historique envoyés au modèle (pas la DB). */
  CHAT_MAX_HISTORY_MESSAGES: readEnvNumber('CHAT_MAX_HISTORY_MESSAGES', 40),
  /** Budget caractères du prompt Ollama (system + mémoire + historique). */
  CHAT_MAX_PROMPT_CHARS: readEnvNumber('CHAT_MAX_PROMPT_CHARS', 16_000),
  /** Nombre max de messages dans le body POST /api/chat. */
  CHAT_MAX_BODY_MESSAGES: readEnvNumber('CHAT_MAX_BODY_MESSAGES', 50),
  /** Timeout court de l'extraction mémoire (ms) : n'empêche pas le chat. */
  MEMORY_EXTRACTION_TIMEOUT_MS: readEnvNumber('MEMORY_EXTRACTION_TIMEOUT_MS', 8_000),
  /** Générations Ollama simultanées (chat + extraction). */
  OLLAMA_MAX_CONCURRENT: readEnvNumber('OLLAMA_MAX_CONCURRENT', 2),
  /** Température de génération (0.4 : plus stable qu’à 0.7, encore naturel). */
  OLLAMA_TEMPERATURE: readEnvNumber('OLLAMA_TEMPERATURE', 0.4),
  /** Modèle d'embeddings Ollama (1024 dimensions : doit correspondre à la migration 005). */
  EMBEDDING_MODEL: readEnv('EMBEDDING_MODEL', 'bge-m3'),
  /** Délai d'un appel d'embeddings (ms). */
  EMBEDDING_TIMEOUT_MS: readEnvNumber('EMBEDDING_TIMEOUT_MS', 60_000),
  /** Nombre de passages retrouvés par question. */
  RAG_TOP_K: readEnvNumber('RAG_TOP_K', 4),
  /** Similarité minimale (0 à 1) pour qu'un passage trouvé par le sens soit gardé. */
  RAG_MIN_SIMILARITY: readEnvNumber('RAG_MIN_SIMILARITY', 0.45),
  /** Documents par utilisateur. */
  RAG_MAX_DOCUMENTS_PER_USER: readEnvNumber('RAG_MAX_DOCUMENTS_PER_USER', 20),
  /** Passages par document (borne le temps d'indexation). */
  RAG_MAX_CHUNKS_PER_DOCUMENT: readEnvNumber('RAG_MAX_CHUNKS_PER_DOCUMENT', 400),
  /** Budget caractères des extraits ajoutés au prompt. */
  RAG_CONTEXT_MAX_CHARS: readEnvNumber('RAG_CONTEXT_MAX_CHARS', 4_000),
  /** Budget de l'agent : nombre maximal d'appels d'outils pour répondre à un message. */
  AGENT_MAX_STEPS: readEnvNumber('AGENT_MAX_STEPS', 6),
  /** Lit les PDF scannés par reconnaissance de texte (Tesseract, en local). `0` ou `false` la désactive. */
  OCR_ENABLED: !['0', 'false', 'off'].includes(readEnv('OCR_ENABLED', 'true').toLowerCase()),
  /** Pages reconnues au maximum par document (une page prend 1 à 3 secondes). */
  OCR_MAX_PAGES: readEnvNumber('OCR_MAX_PAGES', 20),
  /** Outils (calculatrice, recherche dans les documents, effacement d'un souvenir). `0` ou `false` les désactive. */
  TOOLS_ENABLED: !['0', 'false', 'off'].includes(readEnv('TOOLS_ENABLED', 'true').toLowerCase()),
  /** Limite du body JSON Express (ex. 256kb). */
  JSON_BODY_LIMIT: readEnv('JSON_BODY_LIMIT', '256kb'),
  /** Origine du frontend (CORS + credentials). */
  FRONTEND_ORIGIN: readEnv('FRONTEND_ORIGIN', 'http://localhost:5173'),
  /** Durée de vie d'une session (ms). */
  SESSION_TTL_MS: readEnvNumber('SESSION_TTL_MS', 7 * 24 * 60 * 60 * 1000),
  /** Cookie Secure : true en production HTTPS, override possible. */
  COOKIE_SECURE: resolveCookieSecure(),
  /** Tentatives login/register par fenêtre. */
  AUTH_RATE_LIMIT_MAX: readEnvNumber('AUTH_RATE_LIMIT_MAX', 10),
  AUTH_RATE_LIMIT_WINDOW_MS: readEnvNumber('AUTH_RATE_LIMIT_WINDOW_MS', 15 * 60 * 1000),
  /** POST /api/chat par utilisateur authentifié (indépendant du sémaphore Ollama). */
  CHAT_RATE_LIMIT_MAX: readEnvNumber('CHAT_RATE_LIMIT_MAX', 30),
  CHAT_RATE_LIMIT_WINDOW_MS: readEnvNumber('CHAT_RATE_LIMIT_WINDOW_MS', 15 * 60 * 1000),
  /** Nombre max de sessions actives par utilisateur (les plus anciennes sont évincées). */
  SESSION_MAX_PER_USER: readEnvNumber('SESSION_MAX_PER_USER', 5),
  /** Reverse proxy (nginx, etc.) : app.set('trust proxy', 1). */
  TRUST_PROXY: readOptionalEnv('TRUST_PROXY')?.toLowerCase() === 'true',
};

function resolveCookieSecure(): boolean {
  const configured = readOptionalEnv('COOKIE_SECURE')?.toLowerCase();
  if (configured === 'true') {
    return true;
  }
  if (configured === 'false') {
    return false;
  }
  return process.env.NODE_ENV === 'production';
}
