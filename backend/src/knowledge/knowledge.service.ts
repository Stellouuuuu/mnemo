import { randomUUID } from 'node:crypto';
import { env } from '../config/env.js';
import { chunkSegments } from './chunking.js';
import type { Embedder } from './embeddings.js';
import {
  MAX_UPLOAD_BYTES,
  UnsupportedDocumentError,
  extractSegments,
  normalizeMimeType,
  sanitizeTitle,
} from './extract.js';
import type { KnowledgeStore } from './knowledge-store.js';
import type { KnowledgeDocument, RetrievedChunk, SourceRef } from './types.js';

export interface AddDocumentInput {
  userId: string;
  filename: string | undefined;
  contentType: string | undefined;
  data: Buffer;
}

const SNIPPET_CHARS = 220;

export function toSourceRef(chunk: RetrievedChunk): SourceRef {
  const flat = chunk.content.replace(/\s+/g, ' ').trim();
  return {
    documentId: chunk.documentId,
    title: chunk.title,
    page: chunk.page,
    snippet: flat.length > SNIPPET_CHARS ? `${flat.slice(0, SNIPPET_CHARS - 1)}…` : flat,
  };
}

/** Ajouter, lister, retirer des documents, et retrouver les passages utiles à une question. */
export class KnowledgeService {
  constructor(
    private readonly store: KnowledgeStore,
    private readonly embedder: Embedder,
  ) {}

  listDocuments(userId: string): Promise<KnowledgeDocument[]> {
    return this.store.listDocuments(userId);
  }

  deleteDocument(userId: string, documentId: string): Promise<boolean> {
    return this.store.deleteDocument(userId, documentId);
  }

  async hasDocuments(userId: string): Promise<boolean> {
    return (await this.store.countDocuments(userId)) > 0;
  }

  async addDocument(input: AddDocumentInput): Promise<KnowledgeDocument> {
    const mimeType = normalizeMimeType(input.contentType);
    if (!mimeType) {
      throw new UnsupportedDocumentError(
        'Format non pris en charge : envoyez un PDF, un fichier .txt ou .md.',
        415,
      );
    }
    if (input.data.length > MAX_UPLOAD_BYTES) {
      throw new UnsupportedDocumentError('Le fichier dépasse la taille maximale (8 Mo).', 413);
    }
    if ((await this.store.countDocuments(input.userId)) >= env.RAG_MAX_DOCUMENTS_PER_USER) {
      throw new UnsupportedDocumentError(
        `Limite atteinte : ${env.RAG_MAX_DOCUMENTS_PER_USER} documents par compte.`,
        409,
      );
    }

    const segments = await extractSegments(input.data, mimeType);
    const pieces = chunkSegments(segments);
    if (pieces.length === 0) {
      throw new UnsupportedDocumentError(
        "Aucun texte trouvé dans ce document (un PDF scanné n'est pas lisible).",
      );
    }
    if (pieces.length > env.RAG_MAX_CHUNKS_PER_DOCUMENT) {
      throw new UnsupportedDocumentError(
        `Document trop long : ${pieces.length} passages, ${env.RAG_MAX_CHUNKS_PER_DOCUMENT} au maximum.`,
        413,
      );
    }

    const vectors = await this.embedder.embed(
      pieces.map((piece) => piece.content),
      'document',
    );

    return this.store.addDocument(
      {
        id: randomUUID(),
        userId: input.userId,
        title: sanitizeTitle(input.filename),
        mimeType,
        sizeBytes: input.data.length,
      },
      pieces.map((piece, index) => ({
        index,
        page: piece.page,
        content: piece.content,
        embedding: vectors[index]!,
      })),
    );
  }

  /** Les passages des documents de `userId` qui répondent le mieux à `question`. */
  async search(userId: string, question: string): Promise<RetrievedChunk[]> {
    const text = question.trim();
    if (text === '') {
      return [];
    }
    const [embedding] = await this.embedder.embed([text], 'query');
    if (!embedding) {
      return [];
    }
    return this.store.search({
      userId,
      query: text,
      embedding,
      limit: env.RAG_TOP_K,
      minSimilarity: env.RAG_MIN_SIMILARITY,
    });
  }
}
