/** Un document ajouté par l'utilisateur à sa base de connaissances. */
export interface KnowledgeDocument {
  id: string;
  userId: string;
  title: string;
  mimeType: string;
  sizeBytes: number;
  chunkCount: number;
  createdAt: Date;
}

/** Un passage prêt à être stocké. */
export interface NewChunk {
  index: number;
  page: number | null;
  content: string;
  embedding: number[];
}

/** Un passage retrouvé par la recherche. */
export interface RetrievedChunk {
  chunkId: string;
  documentId: string;
  title: string;
  page: number | null;
  content: string;
  /** Similarité cosinus entre la question et le passage (0 à 1). */
  similarity: number;
  /** Score de fusion des deux classements (sens + mots-clés). */
  score: number;
}

/** Ce qui est montré à l'utilisateur pour justifier une réponse. */
export interface SourceRef {
  documentId: string;
  title: string;
  page: number | null;
  snippet: string;
}
