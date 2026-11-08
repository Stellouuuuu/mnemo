import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  InMemoryMemoryStore,
  MemoryService,
  NoOpMemoryExtractor,
  OllamaMemoryExtractor,
  parseMemoryExtractionResponse,
} from '../src/memory/index.js';
import type { MemoryExtractor } from '../src/memory/memory-extractor.js';
import type { MemoryCandidate } from '../src/memory/types.js';
import {
  ConversationService as ConversationHistoryService,
  InMemoryConversationStore,
} from '../src/conversations/index.js';
import { env } from '../src/config/env.js';
import { ConversationBusyError, OllamaTimeoutError } from '../src/errors.js';
import { isGenerationLocked } from '../src/chat/generation-lock.js';
import { ConversationService } from '../src/services/conversation.service.js';
import type { ChatMessage, OllamaChatMessage } from '../src/types/chat.js';
import { delay, waitFor } from './helpers/async.js';

function fixedExtractor(candidates: MemoryCandidate[]): MemoryExtractor {
  return {
    async extract(_messages: ChatMessage[]): Promise<MemoryCandidate[]> {
      return candidates;
    },
  };
}

describe('parseMemoryExtractionResponse', () => {
  it('accepte un JSON valide', () => {
    const result = parseMemoryExtractionResponse(
      JSON.stringify({
        memories: [{ key: 'user_name', value: 'Sarah' }],
      }),
    );
    assert.deepEqual(result, [{ key: 'user_name', value: 'Sarah' }]);
  });

  it('retourne [] pour un JSON invalide', () => {
    assert.deepEqual(parseMemoryExtractionResponse('not-json'), []);
    assert.deepEqual(parseMemoryExtractionResponse('{"memories":"x"}'), []);
  });
});

describe('OllamaMemoryExtractor', () => {
  it('A. "Je m\'appelle Sarah." → user_name = Sarah', async () => {
    const extractor = new OllamaMemoryExtractor(async () =>
      JSON.stringify({
        memories: [{ key: 'user_name', value: 'Sarah' }],
      }),
    );

    const result = await extractor.extract([
      { role: 'user', content: "Je m'appelle Sarah." },
    ]);

    assert.deepEqual(result, [{ key: 'user_name', value: 'Sarah' }]);
  });

  it('passe un timeout court à Ollama pour l’extraction', async () => {
    let timeoutMs: number | undefined;
    const extractor = new OllamaMemoryExtractor(async (_messages, options) => {
      timeoutMs = options?.timeoutMs;
      return JSON.stringify({ memories: [] });
    });

    await extractor.extract([{ role: 'user', content: "Je m'appelle Sarah." }]);
    assert.equal(timeoutMs, env.MEMORY_EXTRACTION_TIMEOUT_MS);
  });

  it('B. "Je suis développeuse." → occupation', async () => {
    const extractor = new OllamaMemoryExtractor(async () =>
      JSON.stringify({
        memories: [{ key: 'occupation', value: 'développeuse' }],
      }),
    );

    const result = await extractor.extract([
      { role: 'user', content: 'Je suis développeuse.' },
    ]);

    assert.equal(result.length, 1);
    assert.equal(result[0]?.key, 'occupation');
    assert.match(result[0]!.value, /développeuse/i);
  });

  it('C. "J\'ai mangé du riz aujourd\'hui." → aucune mémoire', async () => {
    const extractor = new OllamaMemoryExtractor(async () =>
      JSON.stringify({ memories: [] }),
    );

    const result = await extractor.extract([
      { role: 'user', content: "J'ai mangé du riz aujourd'hui." },
    ]);

    assert.deepEqual(result, []);
  });

  it('F. JSON invalide → aucune mémoire', async () => {
    const extractor = new OllamaMemoryExtractor(async () => '<<<invalid>>>');
    const result = await extractor.extract([
      { role: 'user', content: "Je m'appelle Sarah." },
    ]);
    assert.deepEqual(result, []);
  });
});

describe('ConversationService — mémorisation automatique', () => {
  it('A. enregistre user_name = Sarah', async () => {
    const memoryService = new MemoryService(new InMemoryMemoryStore());
    const conversationService = new ConversationService(
      memoryService,
      async () => 'ok',
      fixedExtractor([{ key: 'user_name', value: 'Sarah' }]),
    );

    await conversationService.chat({
      userId: 'user-A',
      content: "Je m'appelle Sarah.",
    });

    const memory = await memoryService.getMemoryByKey('user-A', 'user_name');
    assert.equal(memory?.value, 'Sarah');
  });

  it('B. enregistre occupation', async () => {
    const memoryService = new MemoryService(new InMemoryMemoryStore());
    const conversationService = new ConversationService(
      memoryService,
      async () => 'ok',
      fixedExtractor([{ key: 'occupation', value: 'développeuse' }]),
    );

    await conversationService.chat({
      userId: 'user-A',
      content: 'Je suis développeuse.',
    });

    const memory = await memoryService.getMemoryByKey('user-A', 'occupation');
    assert.equal(memory?.value, 'développeuse');
  });

  it('C. ne mémorise pas un fait temporaire', async () => {
    const memoryService = new MemoryService(new InMemoryMemoryStore());
    const conversationService = new ConversationService(
      memoryService,
      async () => 'ok',
      fixedExtractor([]),
    );

    await conversationService.chat({
      userId: 'user-A',
      content: "J'ai mangé du riz aujourd'hui.",
    });

    assert.equal((await memoryService.getMemories('user-A')).length, 0);
  });

  it('D. met à jour user_name Sarah → Julie (upsert)', async () => {
    const memoryService = new MemoryService(new InMemoryMemoryStore());
    const history = new ConversationHistoryService(new InMemoryConversationStore());

    const first = new ConversationService(
      memoryService,
      async () => 'ok',
      fixedExtractor([{ key: 'user_name', value: 'Sarah' }]),
      history,
    );
    const firstResult = await first.chat({
      userId: 'user-A',
      content: "Je m'appelle Sarah.",
    });

    const second = new ConversationService(
      memoryService,
      async () => 'ok',
      fixedExtractor([{ key: 'user_name', value: 'Julie' }]),
      history,
    );
    await second.chat({
      userId: 'user-A',
      conversationId: firstResult.conversationId,
      content: "En fait je m'appelle Julie.",
    });

    const memories = await memoryService.getMemories('user-A');
    const nameMemories = memories.filter((m) => m.key === 'user_name');
    assert.equal(nameMemories.length, 1);
    assert.equal(nameMemories[0]?.value, 'Julie');
  });

  it('E. isole user-A et user-B', async () => {
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
      fixedExtractor([{ key: 'user_name', value: 'John' }]),
    ).chat({
      userId: 'user-B',
      content: "Je m'appelle John.",
    });

    assert.equal(
      (await memoryService.getMemoryByKey('user-A', 'user_name'))?.value,
      'Sarah',
    );
    assert.equal(
      (await memoryService.getMemoryByKey('user-B', 'user_name'))?.value,
      'John',
    );
    assert.equal(
      (await memoryService.getMemories('user-A')).every((m) => m.userId === 'user-A'),
      true,
    );
  });

  it('F. extracteur en erreur / JSON invalide : conversation OK, pas de mémoire', async () => {
    const memoryService = new MemoryService(new InMemoryMemoryStore());
    let chatCalled = false;

    const failingExtractor: MemoryExtractor = {
      async extract() {
        throw new Error('extraction boom');
      },
    };

    const conversationService = new ConversationService(
      memoryService,
      async () => {
        chatCalled = true;
        return 'Toujours là.';
      },
      failingExtractor,
    );

    const result = await conversationService.chat({
      userId: 'user-A',
      content: 'Bonjour',
    });

    assert.equal(chatCalled, true);
    assert.equal(result.response, 'Toujours là.');
    assert.equal((await memoryService.getMemories('user-A')).length, 0);

    // Variante JSON invalide via OllamaMemoryExtractor
    const invalidJsonService = new ConversationService(
      memoryService,
      async () => 'ok',
      new OllamaMemoryExtractor(async () => 'not-json'),
    );

    await invalidJsonService.chat({
      userId: 'user-B',
      content: "Je m'appelle Sarah.",
    });
    assert.equal((await memoryService.getMemories('user-B')).length, 0);
  });

  it('injecte la mémoire extraite dans le contexte Ollama du tour suivant immédiat', async () => {
    const memoryService = new MemoryService(new InMemoryMemoryStore());
    let captured: OllamaChatMessage[] = [];

    const conversationService = new ConversationService(
      memoryService,
      async (messages) => {
        captured = messages;
        return 'Ton prénom est Sarah.';
      },
      fixedExtractor([{ key: 'user_name', value: 'Sarah' }]),
    );

    await conversationService.chat({
      userId: 'user-A',
      content: "Je m'appelle Sarah.",
    });

    assert.match(JSON.stringify(captured), /Prénom \/ nom : Sarah/);
  });
});

describe('ConversationService — isolation mémoire par userId', () => {
  it('user-A ne récupère que les souvenirs de user-A', async () => {
    const memoryService = new MemoryService(new InMemoryMemoryStore());
    const conversationService = new ConversationService(
      memoryService,
      async () => 'ok',
      new NoOpMemoryExtractor(),
    );

    await memoryService.addMemory({
      userId: 'user-A',
      key: 'first_name',
      value: 'Alice',
    });
    await memoryService.addMemory({
      userId: 'user-B',
      key: 'first_name',
      value: 'Bob',
    });

    const contextA = await conversationService.prepareContext('user-A', [
      { role: 'user', content: 'Bonjour' },
    ]);

    assert.equal(contextA.memories[0]?.value, 'Alice');
  });

  it('user-B ne récupère que les souvenirs de user-B', async () => {
    const memoryService = new MemoryService(new InMemoryMemoryStore());
    const conversationService = new ConversationService(
      memoryService,
      async () => 'ok',
      new NoOpMemoryExtractor(),
    );

    await memoryService.addMemory({
      userId: 'user-A',
      key: 'first_name',
      value: 'Alice',
    });
    await memoryService.addMemory({
      userId: 'user-B',
      key: 'first_name',
      value: 'Bob',
    });

    const contextB = await conversationService.prepareContext('user-B', [
      { role: 'user', content: 'Bonjour' },
    ]);

    assert.equal(contextB.memories[0]?.value, 'Bob');
  });
});

describe('ConversationService — mémoire injectée dans Ollama', () => {
  it('utilisateur avec mémoire préexistante : contexte contient Sarah', async () => {
    const memoryService = new MemoryService(new InMemoryMemoryStore());
    let captured: OllamaChatMessage[] = [];

    await memoryService.addMemory({
      userId: 'user-A',
      key: 'user_name',
      value: 'Sarah',
    });

    const conversationService = new ConversationService(
      memoryService,
      async (messages) => {
        captured = messages;
        return 'Ton prénom est Sarah.';
      },
      new NoOpMemoryExtractor(),
    );

    await conversationService.chat({
      userId: 'user-A',
      content: 'Quel est mon prénom ?',
    });

    assert.match(JSON.stringify(captured), /Prénom \/ nom : Sarah/);
  });

  it('isolation : user-A ne reçoit pas John', async () => {
    const memoryService = new MemoryService(new InMemoryMemoryStore());
    let captured: OllamaChatMessage[] = [];

    await memoryService.addMemory({
      userId: 'user-A',
      key: 'user_name',
      value: 'Sarah',
    });
    await memoryService.addMemory({
      userId: 'user-B',
      key: 'user_name',
      value: 'John',
    });

    const conversationService = new ConversationService(
      memoryService,
      async (messages) => {
        captured = messages;
        return 'ok';
      },
      new NoOpMemoryExtractor(),
    );

    await conversationService.chat({
      userId: 'user-A',
      content: 'Quel est mon prénom ?',
    });

    const serialized = JSON.stringify(captured);
    assert.match(serialized, /Sarah/);
    assert.equal(serialized.includes('John'), false);
  });

  it('sans mémoire : conversation normale', async () => {
    const memoryService = new MemoryService(new InMemoryMemoryStore());
    let captured: OllamaChatMessage[] = [];

    const conversationService = new ConversationService(
      memoryService,
      async (messages) => {
        captured = messages;
        return 'Bonjour !';
      },
      new NoOpMemoryExtractor(),
    );

    const result = await conversationService.chat({
      userId: 'user-empty',
      content: 'Bonjour',
    });

    assert.equal(result.response, 'Bonjour !');
    assert.equal(
      captured.some((m) => m.content.trimStart().startsWith('<user_memory>')),
      false,
    );
  });
});

describe('ConversationService — robustesse génération', () => {
  it('renvoie 409 et n’ajoute pas le second user si une génération est en cours', async () => {
    const memoryService = new MemoryService(new InMemoryMemoryStore());
    const history = new ConversationHistoryService(new InMemoryConversationStore());
    await history.ensureUser('user-lock');
    const conversation = await history.createConversation({
      userId: 'user-lock',
      title: 'lock',
    });

    let entered = 0;
    let releaseGate!: () => void;
    const gate = new Promise<void>((resolve) => {
      releaseGate = resolve;
    });

    const conversationService = new ConversationService(
      memoryService,
      async () => {
        entered += 1;
        await gate;
        return 'assistant-ok';
      },
      new NoOpMemoryExtractor(),
      history,
    );

    const first = conversationService.chat({
      userId: 'user-lock',
      conversationId: conversation.id,
      content: 'first',
    });

    await waitFor(() => entered === 1);

    await assert.rejects(
      () =>
        conversationService.chat({
          userId: 'user-lock',
          conversationId: conversation.id,
          content: 'second',
        }),
      (error: unknown) => error instanceof ConversationBusyError,
    );

    releaseGate();
    const result = await first;
    assert.equal(result.response, 'assistant-ok');

    const stored = await history.listMessages(conversation.id);
    assert.equal(stored.some((message) => message.content === 'second'), false);
    assert.equal(stored.filter((message) => message.role === 'assistant').length, 1);
  });

  it('persiste le user et pas l’assistant si Ollama timeout', async () => {
    const memoryService = new MemoryService(new InMemoryMemoryStore());
    const history = new ConversationHistoryService(new InMemoryConversationStore());
    const conversationService = new ConversationService(
      memoryService,
      async () => {
        throw new OllamaTimeoutError(1_000);
      },
      new NoOpMemoryExtractor(),
      history,
    );

    await assert.rejects(
      () =>
        conversationService.chat({
          userId: 'user-timeout',
          content: 'hello-timeout',
        }),
      (error: unknown) => error instanceof OllamaTimeoutError,
    );

    const conversations = await history.listConversations('user-timeout');
    assert.equal(conversations.length, 1);
    const stored = await history.listMessages(conversations[0]!.id);
    assert.equal(stored.length, 1);
    assert.equal(stored[0]?.role, 'user');
    assert.equal(stored[0]?.content, 'hello-timeout');
    assert.equal(isGenerationLocked(conversations[0]!.id), false);
  });

  it('libère le lock après une exception puis accepte une nouvelle génération', async () => {
    const memoryService = new MemoryService(new InMemoryMemoryStore());
    const history = new ConversationHistoryService(new InMemoryConversationStore());
    let attempts = 0;
    const conversationService = new ConversationService(
      memoryService,
      async () => {
        attempts += 1;
        if (attempts === 1) {
          throw new Error('échec Ollama simulé');
        }
        return 'reprise-ok';
      },
      new NoOpMemoryExtractor(),
      history,
    );

    await history.ensureUser('user-lock-release');
    const conversation = await history.createConversation({
      userId: 'user-lock-release',
      title: 'lock-release',
    });

    await assert.rejects(
      () =>
        conversationService.chat({
          userId: 'user-lock-release',
          conversationId: conversation.id,
          content: 'first-fail',
        }),
      (error: unknown) => error instanceof Error && error.message === 'échec Ollama simulé',
    );
    assert.equal(isGenerationLocked(conversation.id), false);

    const retry = await conversationService.chat({
      userId: 'user-lock-release',
      conversationId: conversation.id,
      content: 'second-ok',
    });
    assert.equal(retry.response, 'reprise-ok');
    assert.equal(isGenerationLocked(conversation.id), false);
  });

  it('un timeout d’extraction n’empêche pas le chat et n’écrit pas la mémoire', async () => {
    const previous = env.MEMORY_EXTRACTION_TIMEOUT_MS;
    env.MEMORY_EXTRACTION_TIMEOUT_MS = 40;

    const memoryService = new MemoryService(new InMemoryMemoryStore());
    const slowExtractor: MemoryExtractor = {
      async extract() {
        await delay(250);
        return [{ key: 'user_name', value: 'Late' }];
      },
    };

    let chatCalled = false;
    const conversationService = new ConversationService(
      memoryService,
      async () => {
        chatCalled = true;
        return 'Toujours là.';
      },
      slowExtractor,
    );

    try {
      const started = Date.now();
      const result = await conversationService.chat({
        userId: 'user-extract-timeout',
        content: "Je m'appelle Sarah.",
      });
      const elapsed = Date.now() - started;

      assert.equal(result.response, 'Toujours là.');
      assert.equal(chatCalled, true);
      assert.ok(elapsed < 200);
      assert.equal((await memoryService.getMemories('user-extract-timeout')).length, 0);
    } finally {
      env.MEMORY_EXTRACTION_TIMEOUT_MS = previous;
    }
  });

  it('retry après timeout : même content ne duplique pas le user', async () => {
    const memoryService = new MemoryService(new InMemoryMemoryStore());
    const history = new ConversationHistoryService(new InMemoryConversationStore());
    let attempts = 0;
    const conversationService = new ConversationService(
      memoryService,
      async () => {
        attempts += 1;
        if (attempts === 1) {
          throw new OllamaTimeoutError(1_000);
        }
        return 'assistant-retry';
      },
      new NoOpMemoryExtractor(),
      history,
    );

    const first = conversationService.chat({
      userId: 'user-retry',
      content: 'hello-retry',
    });
    await assert.rejects(
      first,
      (error: unknown) => error instanceof OllamaTimeoutError,
    );

    const conversations = await history.listConversations('user-retry');
    assert.equal(conversations.length, 1);
    const conversationId = conversations[0]!.id;

    const result = await conversationService.chat({
      userId: 'user-retry',
      conversationId,
      content: 'hello-retry',
    });

    assert.equal(result.response, 'assistant-retry');
    const stored = await history.listMessages(conversationId);
    assert.equal(stored.filter((message) => message.role === 'user').length, 1);
    assert.equal(stored.filter((message) => message.role === 'assistant').length, 1);
    assert.equal(stored[0]?.content, 'hello-retry');
    assert.equal(stored[1]?.content, 'assistant-retry');
  });

  it('limite le prompt Ollama au budget de caractères', async () => {
    const memoryService = new MemoryService(new InMemoryMemoryStore());
    const history = new ConversationHistoryService(new InMemoryConversationStore());
    let captured: OllamaChatMessage[] = [];
    const conversationService = new ConversationService(
      memoryService,
      async (messages) => {
        captured = messages;
        return 'ok';
      },
      new NoOpMemoryExtractor(),
      history,
    );

    await history.ensureUser('user-budget');
    const conversation = await history.createConversation({
      userId: 'user-budget',
      title: 'budget',
    });

    const bulky: ChatMessage[] = [];
    for (let index = 0; index < 8; index += 1) {
      bulky.push({ role: 'user', content: `u${index}-${'x'.repeat(4_000)}` });
      bulky.push({ role: 'assistant', content: `a${index}-${'y'.repeat(4_000)}` });
    }
    await history.appendNewMessages(conversation.id, bulky);

    await conversationService.chat({
      userId: 'user-budget',
      conversationId: conversation.id,
      content: 'dernier-budget',
    });

    const historySent = captured.filter((message) => message.role !== 'system');
    const total = captured.reduce((sum, message) => sum + message.content.length, 0);
    assert.equal(historySent.at(-1)?.content, 'dernier-budget');
    assert.ok(total <= env.CHAT_MAX_PROMPT_CHARS);
    assert.ok(historySent.length < bulky.length);
  });
});
