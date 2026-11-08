import type { KnowledgeDocument, NewChunk, RetrievedChunk } from './types.js';

export interface SearchParams {
  userId: string;
  /** Texte de la question, pour la recherche par mots. */
  query: string;
  /** Vecteur de la question, pour la recherche par le sens. */
  embedding: number[];
  limit: number;
  /** Similarité minimale pour qu'un passage soit gardé (les mots ne servent qu'à classer). */
  minSimilarity: number;
}

export interface KnowledgeStore {
  countDocuments(userId: string): Promise<number>;
  listDocuments(userId: string): Promise<KnowledgeDocument[]>;
  /** Enregistre le document et tous ses passages, ou rien du tout. */
  addDocument(
    document: Omit<KnowledgeDocument, 'createdAt' | 'chunkCount'>,
    chunks: NewChunk[],
  ): Promise<KnowledgeDocument>;
  deleteDocument(userId: string, documentId: string): Promise<boolean>;
  /** Ne renvoie que les passages de `userId`. */
  search(params: SearchParams): Promise<RetrievedChunk[]>;
}
