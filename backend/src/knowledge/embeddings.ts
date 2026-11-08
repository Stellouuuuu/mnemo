import { env } from '../config/env.js';
import { OllamaError, OllamaTimeoutError } from '../errors.js';
import { FetchTimeoutError, fetchWithTimeout } from '../http/fetch-with-timeout.js';

export const EMBEDDING_DIMENSIONS = 1024;

export type EmbeddingKind = 'document' | 'query';

export interface Embedder {
  embed(texts: string[], kind: EmbeddingKind): Promise<number[][]>;
}

const BATCH_SIZE = 16;

/**
 * Certains modèles attendent un préfixe qui dit s'il encode un passage ou une question
 * (nomic-embed-text). bge-m3, le modèle par défaut, n'en demande pas.
 */
const PREFIXES: Record<string, Record<EmbeddingKind, string>> = {
  'nomic-embed-text': { document: 'search_document: ', query: 'search_query: ' },
};

function prefixFor(kind: EmbeddingKind): string {
  const model = env.EMBEDDING_MODEL.split(':')[0] ?? '';
  return PREFIXES[model]?.[kind] ?? '';
}

interface OllamaEmbedResponse {
  embeddings?: unknown;
  error?: string;
}

export class OllamaEmbedder implements Embedder {
  async embed(texts: string[], kind: EmbeddingKind): Promise<number[][]> {
    const vectors: number[][] = [];
    for (let start = 0; start < texts.length; start += BATCH_SIZE) {
      const batch = texts.slice(start, start + BATCH_SIZE).map((text) => prefixFor(kind) + text);
      vectors.push(...(await this.embedBatch(batch)));
    }
    return vectors;
  }

  private async embedBatch(input: string[]): Promise<number[][]> {
    let response: Response;
    try {
      response = await fetchWithTimeout(
        `${env.OLLAMA_BASE_URL}/api/embed`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: env.EMBEDDING_MODEL, input }),
        },
        env.EMBEDDING_TIMEOUT_MS,
      );
    } catch (error) {
      if (error instanceof FetchTimeoutError) {
        throw new OllamaTimeoutError(error.timeoutMs);
      }
      const detail = error instanceof Error ? error.message : 'unknown error';
      throw new OllamaError(`Impossible de contacter Ollama pour les embeddings: ${detail}`);
    }

    let data: OllamaEmbedResponse;
    try {
      data = (await response.json()) as OllamaEmbedResponse;
    } catch {
      throw new OllamaError(`Réponse embeddings invalide (HTTP ${response.status})`);
    }
    if (!response.ok) {
      throw new OllamaError(
        `Erreur embeddings HTTP ${response.status}: ${data.error ?? response.statusText}` +
          ` (modèle ${env.EMBEDDING_MODEL} installé ? ollama pull ${env.EMBEDDING_MODEL})`,
      );
    }

    const vectors = data.embeddings;
    if (
      !Array.isArray(vectors) ||
      vectors.length !== input.length ||
      !vectors.every(
        (v) => Array.isArray(v) && v.length === EMBEDDING_DIMENSIONS && v.every(Number.isFinite),
      )
    ) {
      throw new OllamaError(
        `Embeddings inattendus : ${EMBEDDING_DIMENSIONS} dimensions attendues (modèle ${env.EMBEDDING_MODEL}).`,
      );
    }
    return vectors as number[][];
  }
}
