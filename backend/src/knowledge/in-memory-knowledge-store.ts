import type { KnowledgeStore, SearchParams } from './knowledge-store.js';
import type { KnowledgeDocument, NewChunk, RetrievedChunk } from './types.js';

interface StoredChunk extends NewChunk {
  chunkId: string;
  documentId: string;
  userId: string;
}

function cosine(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i += 1) {
    dot += a[i]! * b[i]!;
    na += a[i]! * a[i]!;
    nb += b[i]! * b[i]!;
  }
  return na === 0 || nb === 0 ? 0 : dot / Math.sqrt(na * nb);
}

/** Stockage en mémoire pour les tests : même contrat que la version Postgres, sans mots-clés. */
export class InMemoryKnowledgeStore implements KnowledgeStore {
  private readonly documents = new Map<string, KnowledgeDocument>();
  private readonly chunks: StoredChunk[] = [];
  private counter = 0;

  async countDocuments(userId: string): Promise<number> {
    return [...this.documents.values()].filter((d) => d.userId === userId).length;
  }

  async listDocuments(userId: string): Promise<KnowledgeDocument[]> {
    return [...this.documents.values()]
      .filter((d) => d.userId === userId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async addDocument(
    document: Omit<KnowledgeDocument, 'createdAt' | 'chunkCount'>,
    chunks: NewChunk[],
  ): Promise<KnowledgeDocument> {
    const stored: KnowledgeDocument = {
      ...document,
      chunkCount: chunks.length,
      createdAt: new Date(),
    };
    this.documents.set(document.id, stored);
    for (const chunk of chunks) {
      this.counter += 1;
      this.chunks.push({
        ...chunk,
        chunkId: `chunk-${this.counter}`,
        documentId: document.id,
        userId: document.userId,
      });
    }
    return stored;
  }

  async deleteDocument(userId: string, documentId: string): Promise<boolean> {
    const doc = this.documents.get(documentId);
    if (!doc || doc.userId !== userId) {
      return false;
    }
    this.documents.delete(documentId);
    for (let i = this.chunks.length - 1; i >= 0; i -= 1) {
      if (this.chunks[i]!.documentId === documentId) {
        this.chunks.splice(i, 1);
      }
    }
    return true;
  }

  async search(params: SearchParams): Promise<RetrievedChunk[]> {
    return this.chunks
      .filter((chunk) => chunk.userId === params.userId)
      .map((chunk) => {
        const similarity = cosine(chunk.embedding, params.embedding);
        return { chunk, similarity };
      })
      .filter(({ similarity }) => similarity >= params.minSimilarity)
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, params.limit)
      .map(({ chunk, similarity }) => ({
        chunkId: chunk.chunkId,
        documentId: chunk.documentId,
        title: this.documents.get(chunk.documentId)?.title ?? '',
        page: chunk.page,
        content: chunk.content,
        similarity,
        score: similarity,
      }));
  }
}
