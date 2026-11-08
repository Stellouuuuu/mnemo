import type { Pool, QueryResultRow } from 'pg';
import type { KnowledgeStore, SearchParams } from './knowledge-store.js';
import type { KnowledgeDocument, NewChunk, RetrievedChunk } from './types.js';
import { randomUUID } from 'node:crypto';

interface DocumentRow extends QueryResultRow {
  id: string;
  user_id: string;
  title: string;
  mime_type: string;
  size_bytes: number;
  chunk_count: number;
  flagged_count: number;
  created_at: Date;
}

interface HitRow extends QueryResultRow {
  id: string;
  document_id: string;
  title: string;
  page: number | null;
  content: string;
  similarity: number;
  score: number;
}

function mapDocument(row: DocumentRow): KnowledgeDocument {
  return {
    id: row.id,
    userId: row.user_id,
    title: row.title,
    mimeType: row.mime_type,
    sizeBytes: row.size_bytes,
    chunkCount: row.chunk_count,
    flaggedCount: row.flagged_count,
    createdAt: row.created_at,
  };
}

function toVectorLiteral(vector: number[]): string {
  return `[${vector.join(',')}]`;
}

/**
 * Question -> requête de texte intégral : chaque mot compte (OU), les mieux couverts passent
 * devant. Seuls des mots alphanumériques sont gardés, donc rien de la question ne peut
 * être interprété comme de la syntaxe de requête.
 */
export function buildKeywordQuery(question: string): string {
  const words = [...new Set(question.toLowerCase().match(/[\p{L}\p{N}_]{3,}/gu) ?? [])];
  return words.length === 0 ? '__aucun_mot__' : words.slice(0, 12).join(' | ');
}

/** Constante de la fusion par rangs (RRF) : 60 est la valeur usuelle. */
const RRF_K = 60;

/**
 * Recherche hybride : les passages les plus proches par le sens (pgvector) et ceux qui
 * contiennent les mots de la question (texte intégral français) sont classés chacun de leur
 * côté, puis fusionnés. Le filtre par propriétaire est dans chaque sous-requête.
 */
const SEARCH_SQL = `
WITH dense AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY embedding <=> $2::vector) AS rank
  FROM (
    SELECT id, embedding FROM document_chunks
    WHERE user_id = $1
    ORDER BY embedding <=> $2::vector
    LIMIT $4
  ) nearest
),
sparse AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY ts_rank_cd(tsv, query) DESC) AS rank
  FROM (
    SELECT c.id, c.tsv, q.query FROM document_chunks c,
      to_tsquery('french', $3) AS q(query)
    WHERE c.user_id = $1 AND c.tsv @@ q.query
    ORDER BY ts_rank_cd(c.tsv, q.query) DESC
    LIMIT $4
  ) matching
)
SELECT c.id, c.document_id, d.title, c.page, c.content,
       1 - (c.embedding <=> $2::vector) AS similarity,
       COALESCE(1.0 / (${RRF_K} + dense.rank), 0) + COALESCE(1.0 / (${RRF_K} + sparse.rank), 0) AS score
FROM dense
FULL OUTER JOIN sparse ON dense.id = sparse.id
JOIN document_chunks c ON c.id = COALESCE(dense.id, sparse.id)
JOIN documents d ON d.id = c.document_id
WHERE c.user_id = $1
ORDER BY score DESC
LIMIT $5
`;

export class PostgresKnowledgeStore implements KnowledgeStore {
  constructor(private readonly pool: Pool) {}

  async countDocuments(userId: string): Promise<number> {
    const result = await this.pool.query<{ count: string }>(
      'SELECT COUNT(*) AS count FROM documents WHERE user_id = $1',
      [userId],
    );
    return Number(result.rows[0]?.count ?? 0);
  }

  async listDocuments(userId: string): Promise<KnowledgeDocument[]> {
    const result = await this.pool.query<DocumentRow>(
      `SELECT id, user_id, title, mime_type, size_bytes, chunk_count, flagged_count, created_at
       FROM documents WHERE user_id = $1 ORDER BY created_at DESC, id`,
      [userId],
    );
    return result.rows.map(mapDocument);
  }

  async addDocument(
    document: Omit<KnowledgeDocument, 'createdAt' | 'chunkCount'>,
    chunks: NewChunk[],
  ): Promise<KnowledgeDocument> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const inserted = await client.query<DocumentRow>(
        `INSERT INTO documents (id, user_id, title, mime_type, size_bytes, chunk_count, flagged_count)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id, user_id, title, mime_type, size_bytes, chunk_count, flagged_count, created_at`,
        [
          document.id,
          document.userId,
          document.title,
          document.mimeType,
          document.sizeBytes,
          chunks.length,
          document.flaggedCount,
        ],
      );
      for (const chunk of chunks) {
        await client.query(
          `INSERT INTO document_chunks
             (id, document_id, user_id, chunk_index, page, content, embedding)
           VALUES ($1, $2, $3, $4, $5, $6, $7::vector)`,
          [
            randomUUID(),
            document.id,
            document.userId,
            chunk.index,
            chunk.page,
            chunk.content,
            toVectorLiteral(chunk.embedding),
          ],
        );
      }
      await client.query('COMMIT');
      return mapDocument(inserted.rows[0]!);
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async deleteDocument(userId: string, documentId: string): Promise<boolean> {
    const result = await this.pool.query(
      'DELETE FROM documents WHERE id = $1 AND user_id = $2',
      [documentId, userId],
    );
    return (result.rowCount ?? 0) > 0;
  }

  async search(params: SearchParams): Promise<RetrievedChunk[]> {
    const candidates = Math.max(params.limit * 4, 20);
    const result = await this.pool.query<HitRow>(SEARCH_SQL, [
      params.userId,
      toVectorLiteral(params.embedding),
      buildKeywordQuery(params.query),
      candidates,
      params.limit * 2,
    ]);

    return result.rows
      // Les mots servent à classer, pas à admettre : un mot courant partagé avec une question
      // hors sujet ne doit pas suffire à ramener un extrait.
      .filter((row) => Number(row.similarity) >= params.minSimilarity)
      .slice(0, params.limit)
      .map((row) => ({
        chunkId: row.id,
        documentId: row.document_id,
        title: row.title,
        page: row.page,
        content: row.content,
        similarity: Number(row.similarity),
        score: Number(row.score),
      }));
  }
}
