export { chunkSegments } from './chunking.js';
export { OllamaEmbedder, EMBEDDING_DIMENSIONS, type Embedder } from './embeddings.js';
export {
  MAX_UPLOAD_BYTES,
  SUPPORTED_MIME_TYPES,
  UnsupportedDocumentError,
  extractSegments,
  normalizeMimeType,
  sanitizeTitle,
} from './extract.js';
export { InMemoryKnowledgeStore } from './in-memory-knowledge-store.js';
export { KnowledgeService, toSourceRef } from './knowledge.service.js';
export type { KnowledgeStore } from './knowledge-store.js';
export { PostgresKnowledgeStore } from './postgres-knowledge-store.js';
export type { KnowledgeDocument, RetrievedChunk, SourceRef } from './types.js';
