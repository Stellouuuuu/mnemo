import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  InMemoryMemoryStore,
  MemoryService,
  NoOpMemoryExtractor,
  normalizeMemoryCandidate,
  normalizeMemoryKey,
  parseMemoryExtractionResponse,
} from '../src/memory/index.js';
import type { MemoryExtractor } from '../src/memory/memory-extractor.js';
import type { MemoryCandidate } from '../src/memory/types.js';
import { STELLA_SYSTEM_PROMPT } from '../src/prompts/stella-system.js';
import { ConversationService } from '../src/services/conversation.service.js';
import type { ChatMessage, OllamaChatMessage } from '../src/types/chat.js';

function fixedExtractor(candidates: MemoryCandidate[]): MemoryExtractor {
  return {
    async extract(_messages: ChatMessage[]): Promise<MemoryCandidate[]> {
      return candidates;
    },
  };
}

describe('Schéma mémoire strict — bugs clés / invention', () => {
  it('A. "Je m\'appelle Sarah." → user_name = Sarah', async () => {
    const parsed = parseMemoryExtractionResponse(
      JSON.stringify({
        memories: [{ key: 'user_name', value: 'Sarah' }],
      }),
    );
    assert.deepEqual(parsed, [{ key: 'user_name', value: 'Sarah' }]);

    const memoryService = new MemoryService(new InMemoryMemoryStore());
    await new ConversationService(
      memoryService,
      async () => 'ok',
      fixedExtractor(parsed),
    ).chat({
      userId: 'user-A',
      content: "Je m'appelle Sarah.",
    });

    assert.equal(
      (await memoryService.getMemoryByKey('user-A', 'user_name'))?.value,
      'Sarah',
    );
  });

  it('B. "En fait je m\'appelle Julie maintenant." → user_name = Julie', async () => {
    const memoryService = new MemoryService(new InMemoryMemoryStore());

    await new ConversationService(
      memoryService,
      async () => 'ok',
      fixedExtractor([{ key: 'user_name', value: 'Sarah' }]),
    ).chat({
      userId: 'user-A',
      content: "Je m'appelle Sarah.",
    });

    await new ConversationService(
      memoryService,
      async () => 'ok',
      fixedExtractor([{ key: 'user_name', value: 'Julie' }]),
    ).chat({
      userId: 'user-A',
      content: "En fait je m'appelle Julie maintenant.",
    });

    const memories = await memoryService.getMemories('user-A');
    assert.equal(memories.filter((m) => m.key === 'user_name').length, 1);
    assert.equal(
      (await memoryService.getMemoryByKey('user-A', 'user_name'))?.value,
      'Julie',
    );
  });

  it('C. clé "mon_prenom" normalisée vers user_name (ou rejetée si non mappable)', () => {
    assert.equal(normalizeMemoryKey('mon_prenom'), 'user_name');

    const normalized = parseMemoryExtractionResponse(
      JSON.stringify({
        memories: [{ key: 'mon_prenom', value: 'Julie' }],
      }),
    );
    assert.deepEqual(normalized, [{ key: 'user_name', value: 'Julie' }]);

    const rejected = parseMemoryExtractionResponse(
      JSON.stringify({
        memories: [{ key: 'favorite_color_xyz', value: 'bleu' }],
      }),
    );
    assert.deepEqual(rejected, []);
  });

  it('D. valeur "mon prénom" rejetée', () => {
    assert.equal(normalizeMemoryCandidate('user_name', 'mon prénom'), null);
    assert.equal(normalizeMemoryCandidate('user_name', 'mon prenom'), null);

    const parsed = parseMemoryExtractionResponse(
      JSON.stringify({
        memories: [{ key: 'user_name', value: 'mon prénom' }],
      }),
    );
    assert.deepEqual(parsed, []);
  });

  it('E. nouvelle session sans user_name : pas d’invention dans le contexte Ollama', async () => {
    const memoryService = new MemoryService(new InMemoryMemoryStore());
    let captured: OllamaChatMessage[] = [];

    const conversationService = new ConversationService(
      memoryService,
      async (messages) => {
        captured = messages;
        return 'Je ne connais pas encore ton prénom. Si tu me le donnes, je pourrai m\'en souvenir.';
      },
      new NoOpMemoryExtractor(),
    );

    const result = await conversationService.chat({
      userId: 'fresh-session',
      content: 'Quel est mon prénom ?',
    });

    assert.equal((await memoryService.getMemories('fresh-session')).length, 0);
    assert.equal(
      captured.some((m) => m.content.trimStart().startsWith('<user_memory>')),
      false,
    );
    assert.match(STELLA_SYSTEM_PROMPT, /ne le connais pas encore/i);
    assert.match(STELLA_SYSTEM_PROMPT, /N'invente aucune information personnelle/i);
    assert.match(STELLA_SYSTEM_PROMPT, /clé mémoire n'est jamais une valeur/i);
    assert.match(result.response, /ne connais pas encore ton prénom/i);
    assert.equal(/ton prénom est mon prénom/i.test(result.response), false);
  });

  it('F. mémoire user-A invisible pour user-B', async () => {
    const memoryService = new MemoryService(new InMemoryMemoryStore());

    await new ConversationService(
      memoryService,
      async () => 'ok',
      fixedExtractor([{ key: 'user_name', value: 'Sarah' }]),
    ).chat({
      userId: 'user-A',
      content: "Je m'appelle Sarah.",
    });

    let capturedB: OllamaChatMessage[] = [];
    await new ConversationService(
      memoryService,
      async (messages) => {
        capturedB = messages;
        return 'Je ne connais pas encore ton prénom.';
      },
      new NoOpMemoryExtractor(),
    ).chat({
      userId: 'user-B',
      content: 'Quel est mon prénom ?',
    });

    assert.equal(
      (await memoryService.getMemoryByKey('user-B', 'user_name')),
      null,
    );
    assert.equal(
      capturedB.some(
        (m) =>
          m.content.trimStart().startsWith('<user_memory>') &&
          m.content.includes('Sarah'),
      ),
      false,
    );
    assert.equal(
      (await memoryService.getMemoryByKey('user-A', 'user_name'))?.value,
      'Sarah',
    );
  });
});
