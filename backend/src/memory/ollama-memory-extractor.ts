import { MEMORY_EXTRACTION_SYSTEM_PROMPT } from '../prompts/memory-extraction.js';
import type { ChatMessage, OllamaChatMessage } from '../types/chat.js';
import type { ChatModelClient } from '../services/ollama.service.js';
import { chatWithOllama } from '../services/ollama.service.js';
import { env } from '../config/env.js';
import type { MemoryCandidate } from './types.js';
import type { MemoryExtractOptions, MemoryExtractor } from './memory-extractor.js';
import { isEligibleForMemoryExtraction } from './memory-schema.js';
import { parseMemoryExtractionResponse } from './parse-memory-extraction.js';

/**
 * Extraction via Ollama avec un prompt dédié (pas le prompt conversationnel STELLA).
 */
export class OllamaMemoryExtractor implements MemoryExtractor {
  constructor(private readonly chatModel: ChatModelClient = chatWithOllama) {}

  async extract(
    messages: ChatMessage[],
    options?: MemoryExtractOptions,
  ): Promise<MemoryCandidate[]> {
    const latestUserMessage = [...messages]
      .reverse()
      .find((message) => message.role === 'user');

    if (!latestUserMessage) {
      return [];
    }

    // Défense niveau 1 : questions / négations pures → aucune mémoire.
    if (!isEligibleForMemoryExtraction(latestUserMessage.content)) {
      return [];
    }

    const extractionMessages: OllamaChatMessage[] = [
      {
        role: 'system',
        content: MEMORY_EXTRACTION_SYSTEM_PROMPT,
      },
      {
        role: 'user',
        content: [
          'Analyse ce message utilisateur et retourne uniquement le JSON demandé.',
          'Si c\'est une question, une négation seule, ou une demande d\'information, retourne {"memories":[]}.',
          '',
          'Message :',
          latestUserMessage.content,
        ].join('\n'),
      },
    ];

    try {
      const raw = await this.chatModel(extractionMessages, {
        timeoutMs: options?.timeoutMs ?? env.MEMORY_EXTRACTION_TIMEOUT_MS,
        signal: options?.signal,
      });
      // Défense niveau 2+3 : parse + schéma (rejette "mon", etc.)
      return parseMemoryExtractionResponse(raw);
    } catch {
      return [];
    }
  }
}

/** Extracteur neutre (tests / désactivation). */
export class NoOpMemoryExtractor implements MemoryExtractor {
  async extract(_messages: ChatMessage[]): Promise<MemoryCandidate[]> {
    return [];
  }
}
