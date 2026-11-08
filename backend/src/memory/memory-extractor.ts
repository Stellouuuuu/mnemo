import type { ChatMessage } from '../types/chat.js';
import type { MemoryCandidate } from '../memory/types.js';

export interface MemoryExtractOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
}

/**
 * Analyse des messages pour proposer des souvenirs candidats.
 * Indépendant de la génération de réponse conversationnelle.
 */
export interface MemoryExtractor {
  extract(
    messages: ChatMessage[],
    options?: MemoryExtractOptions,
  ): Promise<MemoryCandidate[]>;
}
