import type { Memory } from '../memory/types.js';
import type { MemoryService } from '../memory/memory.service.js';
import type { MemoryExtractor } from '../memory/memory-extractor.js';
import { NoOpMemoryExtractor } from '../memory/ollama-memory-extractor.js';
import { isEligibleForMemoryExtraction, normalizeMemoryCandidate } from '../memory/memory-schema.js';
import {
  ConversationNotFoundError,
  ConversationService as ConversationHistoryService,
  deriveConversationTitle,
  InMemoryConversationStore,
} from '../conversations/index.js';
import { tryAcquireGenerationLock } from '../chat/generation-lock.js';
import { selectRecentChatMessages } from '../chat/history-window.js';
import { env } from '../config/env.js';
import { ConversationBusyError } from '../errors.js';
import {
  FetchAbortedError,
  combineAbortSignals,
} from '../http/fetch-with-timeout.js';
import { STELLA_SYSTEM_PROMPT } from '../prompts/stella-system.js';
import type { ChatMessage, OllamaChatMessage } from '../types/chat.js';
import {
  chatWithOllama,
  type ChatModelClient,
} from './ollama.service.js';
import { buildOllamaMessages, formatUserMemoryBlock } from './prompt-builder.js';

export interface ConversationInput {
  userId: string;
  content: string;
  conversationId?: string;
  signal?: AbortSignal;
}

export interface ConversationContext {
  userId: string;
  messages: ChatMessage[];
  memories: Memory[];
  /** Messages réellement envoyés à Ollama (non exposés dans la réponse HTTP). */
  ollamaMessages: OllamaChatMessage[];
}

export interface ConversationResult {
  conversationId: string;
  messages: ChatMessage[];
  response: string;
}

export { ConversationNotFoundError, ConversationBusyError };

/**
 * Orchestre une conversation :
 * route → ConversationService → ConversationHistory → MemoryExtractor → MemoryService → PromptBuilder → Ollama
 */
export class ConversationService {
  constructor(
    private readonly memoryService: MemoryService,
    private readonly chatModel: ChatModelClient = chatWithOllama,
    private readonly memoryExtractor: MemoryExtractor = new NoOpMemoryExtractor(),
    private readonly conversationHistory: ConversationHistoryService = new ConversationHistoryService(
      new InMemoryConversationStore(),
    ),
  ) {}

  async prepareContext(
    userId: string,
    messages: ChatMessage[],
  ): Promise<ConversationContext> {
    const memories = await this.memoryService.getMemories(userId);
    const memoryBlock = formatUserMemoryBlock(memories);
    const reserved = STELLA_SYSTEM_PROMPT.length + (memoryBlock?.length ?? 0);
    const historyBudget = Math.max(0, env.CHAT_MAX_PROMPT_CHARS - reserved);
    const historyForModel = selectRecentChatMessages(
      messages,
      env.CHAT_MAX_HISTORY_MESSAGES,
      historyBudget,
    );
    const ollamaMessages = buildOllamaMessages({
      systemPrompt: STELLA_SYSTEM_PROMPT,
      memories,
      messages: historyForModel,
    });

    return {
      userId,
      messages,
      memories,
      ollamaMessages,
    };
  }

  async chat(input: ConversationInput): Promise<ConversationResult> {
    await this.conversationHistory.ensureUser(input.userId);

    const conversationId = await this.ensureConversation(input);
    const releaseLock = tryAcquireGenerationLock(conversationId);
    if (!releaseLock) {
      throw new ConversationBusyError();
    }

    try {
      if (input.signal?.aborted) {
        throw new FetchAbortedError();
      }

      await this.conversationHistory.appendNewMessages(conversationId, [
        { role: 'user', content: input.content },
      ]);

      const messagesForModel = await this.loadMessagesForModel(conversationId);

      await this.applyAutomaticMemories({
        userId: input.userId,
        messages: messagesForModel,
        signal: input.signal,
      });

      const context = await this.prepareContext(input.userId, messagesForModel);
      const response = await this.chatModel(context.ollamaMessages, {
        signal: input.signal,
      });

      if (input.signal?.aborted) {
        throw new FetchAbortedError();
      }

      await this.conversationHistory.appendMessage({
        conversationId,
        role: 'assistant',
        content: response,
      });

      const persisted = await this.conversationHistory.listMessages(conversationId);

      return {
        conversationId,
        messages: persisted.map(({ role, content }) => ({ role, content })),
        response,
      };
    } finally {
      releaseLock();
    }
  }

  private async ensureConversation(input: ConversationInput): Promise<string> {
    if (!input.conversationId) {
      const conversation = await this.conversationHistory.createConversation({
        userId: input.userId,
        title: deriveConversationTitle([
          { role: 'user', content: input.content },
        ]),
      });
      return conversation.id;
    }

    await this.conversationHistory.requireConversation(
      input.userId,
      input.conversationId,
    );
    return input.conversationId;
  }

  private async loadMessagesForModel(conversationId: string): Promise<ChatMessage[]> {
    const messages = await this.conversationHistory.listMessages(conversationId);
    return messages.map(({ role, content }) => ({ role, content }));
  }

  /**
   * Extraction dans le même POST, timeout court.
   * En cas d'échec ou de timeout → aucune mémoire, génération chat continue.
   */
  private async applyAutomaticMemories(input: {
    userId: string;
    messages: ChatMessage[];
    signal?: AbortSignal;
  }): Promise<void> {
    try {
      const latestUserMessage = [...input.messages]
        .reverse()
        .find((message) => message.role === 'user');

      // Garde-fou applicatif : une question / négation pure ne doit jamais upsert.
      if (
        !latestUserMessage ||
        !isEligibleForMemoryExtraction(latestUserMessage.content)
      ) {
        return;
      }

      const timeoutMs = env.MEMORY_EXTRACTION_TIMEOUT_MS;
      const timeoutSignal = AbortSignal.timeout(timeoutMs);
      const signal = input.signal
        ? combineAbortSignals([timeoutSignal, input.signal])
        : timeoutSignal;

      const candidates = await withTimeout(
        this.memoryExtractor.extract(input.messages, { signal, timeoutMs }),
        timeoutMs,
        signal,
      );

      for (const candidate of candidates) {
        const normalized = normalizeMemoryCandidate(candidate.key, candidate.value);
        if (normalized === null) {
          continue;
        }

        await this.memoryService.upsertMemory({
          userId: input.userId,
          key: normalized.key,
          value: normalized.value,
        });
      }
    } catch {
      // Isolation des erreurs d'extraction : ne pas bloquer le chat.
    }
  }
}

function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  signal: AbortSignal,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    if (signal.aborted) {
      reject(new Error('memory-extraction-timeout'));
      return;
    }

    const timer = setTimeout(() => {
      reject(new Error('memory-extraction-timeout'));
    }, timeoutMs);

    const onAbort = () => {
      clearTimeout(timer);
      reject(new Error('memory-extraction-timeout'));
    };

    signal.addEventListener('abort', onAbort, { once: true });

    promise.then(
      (value) => {
        clearTimeout(timer);
        signal.removeEventListener('abort', onAbort);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        signal.removeEventListener('abort', onAbort);
        reject(error);
      },
    );
  });
}
