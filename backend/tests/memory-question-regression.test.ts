import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  InMemoryMemoryStore,
  MemoryService,
  NoOpMemoryExtractor,
  OllamaMemoryExtractor,
  isEligibleForMemoryExtraction,
  isGenericMemoryValue,
  isInformationSeekingQuestion,
  normalizeMemoryCandidate,
  parseMemoryExtractionResponse,
} from '../src/memory/index.js';
import type { MemoryExtractor } from '../src/memory/memory-extractor.js';
import type { MemoryCandidate } from '../src/memory/types.js';
import { ConversationService } from '../src/services/conversation.service.js';
import type { ChatMessage } from '../src/types/chat.js';

function fixedExtractor(candidates: MemoryCandidate[]): MemoryExtractor {
  return {
    async extract(_messages: ChatMessage[]): Promise<MemoryCandidate[]> {
      return candidates;
    },
  };
}

describe('Régression — questions / négations / corrections mémoire', () => {
  it('détecte les questions d’information', () => {
    assert.equal(isInformationSeekingQuestion('Quel est mon prénom ?'), true);
    assert.equal(isInformationSeekingQuestion('Tu connais mon prénom ?'), true);
    assert.equal(isInformationSeekingQuestion('Tu te souviens de mon prénom ?'), true);
    assert.equal(isInformationSeekingQuestion("Quel est mon domaine d'étude ?"), true);
    assert.equal(isInformationSeekingQuestion('Est-ce que tu sais où j\'habite ?'), true);
    assert.equal(isInformationSeekingQuestion('Que sais-tu sur moi ?'), true);
    assert.equal(isInformationSeekingQuestion('Dis-moi mon prénom'), true);

    assert.equal(isInformationSeekingQuestion("Je m'appelle Sarah."), false);
    assert.equal(isInformationSeekingQuestion('Mon prénom est Sarah.'), false);
    assert.equal(isInformationSeekingQuestion("J'habite à Cotonou."), false);
  });

  it('négations pures inéligibles ; correction positive éligible', () => {
    assert.equal(isEligibleForMemoryExtraction('Je ne m\'appelle pas Sarah.'), false);
    assert.equal(isEligibleForMemoryExtraction('Mon prénom n\'est pas Julie.'), false);
    assert.equal(isEligibleForMemoryExtraction('Quel est mon prénom ?'), false);

    assert.equal(isEligibleForMemoryExtraction("Je m'appelle Sarah."), true);
    assert.equal(
      isEligibleForMemoryExtraction("Je ne m'appelle pas Sarah, je m'appelle Julie."),
      true,
    );
    assert.equal(
      isEligibleForMemoryExtraction('En fait je m\'appelle Julie maintenant.'),
      true,
    );
  });

  it('ne déclenche pas l’extraction sur les messages non déclaratifs', () => {
    const ineligible = [
      'Bonjour',
      'super',
      "raconte-moi une histoire",
      "raconte-moi une histoire d'animaux",
      "donne-moi 5 sites pour gagner de l'argent",
      'explique-moi PostgreSQL',
      'Tu te souviens de moi ?',
    ];

    for (const content of ineligible) {
      assert.equal(
        isEligibleForMemoryExtraction(content),
        false,
        `should be ineligible: ${content}`,
      );
    }
  });

  it('déclenche l’extraction sur une préférence explicite', () => {
    assert.equal(
      isEligibleForMemoryExtraction('Je préfère travailler en Python.'),
      true,
    );
  });

  it('question "Quel est mon prénom ?" => [] (extractor, sans appeler le LLM)', async () => {
    let llmCalled = false;
    const extractor = new OllamaMemoryExtractor(async () => {
      llmCalled = true;
      return JSON.stringify({
        memories: [{ key: 'user_name', value: 'mon' }],
      });
    });

    const result = await extractor.extract([
      { role: 'user', content: 'Quel est mon prénom ?' },
    ]);

    assert.deepEqual(result, []);
    assert.equal(llmCalled, false);
  });

  it('questions variées => []', async () => {
    const extractor = new OllamaMemoryExtractor(async () =>
      JSON.stringify({
        memories: [{ key: 'user_name', value: 'mon' }],
      }),
    );

    for (const content of [
      'Tu connais mon prénom ?',
      "Quel est mon domaine d'étude ?",
      'Est-ce que tu sais où j\'habite ?',
      'Que sais-tu sur moi ?',
    ]) {
      assert.deepEqual(
        await extractor.extract([{ role: 'user', content }]),
        [],
        content,
      );
    }
  });

  it('négation pure => [] même si le LLM invente une valeur', async () => {
    let llmCalled = false;
    const extractor = new OllamaMemoryExtractor(async () => {
      llmCalled = true;
      return JSON.stringify({
        memories: [{ key: 'user_name', value: 'Sarah' }],
      });
    });

    assert.deepEqual(
      await extractor.extract([
        { role: 'user', content: "Je ne m'appelle pas Sarah." },
      ]),
      [],
    );
    assert.equal(llmCalled, false);
  });

  it('"super" et une demande d’histoire ne déclenchent pas le LLM d’extraction', async () => {
    let llmCalled = false;
    const extractor = new OllamaMemoryExtractor(async () => {
      llmCalled = true;
      return JSON.stringify({ memories: [{ key: 'user_name', value: 'Hack' }] });
    });

    for (const content of [
      'super',
      "raconte-moi une histoire d'animaux",
      "donne-moi 5 sites pour gagner de l'argent",
    ]) {
      llmCalled = false;
      assert.deepEqual(
        await extractor.extract([{ role: 'user', content }]),
        [],
        content,
      );
      assert.equal(llmCalled, false, content);
    }
  });

  it('"Je m\'appelle Sarah." => user_name Sarah', async () => {
    const extractor = new OllamaMemoryExtractor(async () =>
      JSON.stringify({
        memories: [{ key: 'user_name', value: 'Sarah' }],
      }),
    );

    assert.deepEqual(
      await extractor.extract([
        { role: 'user', content: "Je m'appelle Sarah." },
      ]),
      [{ key: 'user_name', value: 'Sarah' }],
    );
  });

  it('"Mon prénom est Sarah." => user_name Sarah', async () => {
    const extractor = new OllamaMemoryExtractor(async () =>
      JSON.stringify({
        memories: [{ key: 'user_name', value: 'Sarah' }],
      }),
    );

    assert.deepEqual(
      await extractor.extract([
        { role: 'user', content: 'Mon prénom est Sarah.' },
      ]),
      [{ key: 'user_name', value: 'Sarah' }],
    );
  });

  it('après user_name=Sarah, une question ne doit jamais modifier Sarah', async () => {
    const memoryService = new MemoryService(new InMemoryMemoryStore());

    await new ConversationService(
      memoryService,
      async () => 'ok',
      fixedExtractor([{ key: 'user_name', value: 'Sarah' }]),
    ).chat({
      userId: 'user-A',
      content: "Je m'appelle Sarah.",
    });

    assert.equal(
      (await memoryService.getMemoryByKey('user-A', 'user_name'))?.value,
      'Sarah',
    );

    // Même un extracteur qui renverrait "Hack" ne doit rien écrire sur une question.
    await new ConversationService(
      memoryService,
      async () => 'Je ne connais pas encore ton prénom.',
      fixedExtractor([{ key: 'user_name', value: 'Hack' }]),
    ).chat({
      userId: 'user-A',
      content: 'Quel est mon prénom ?',
    });

    assert.equal(
      (await memoryService.getMemoryByKey('user-A', 'user_name'))?.value,
      'Sarah',
    );

    // value="mon" également bloquée
    await new ConversationService(
      memoryService,
      async () => 'ok',
      fixedExtractor([{ key: 'user_name', value: 'mon' }]),
    ).chat({
      userId: 'user-A',
      content: 'Quel est mon prénom ?',
    });

    assert.equal(
      (await memoryService.getMemoryByKey('user-A', 'user_name'))?.value,
      'Sarah',
    );
  });

  it('négation pure ne doit pas écraser une mémoire existante', async () => {
    const memoryService = new MemoryService(new InMemoryMemoryStore());

    await memoryService.upsertMemory({
      userId: 'user-A',
      key: 'user_name',
      value: 'Sarah',
    });

    await new ConversationService(
      memoryService,
      async () => 'ok',
      fixedExtractor([{ key: 'user_name', value: 'PasSarah' }]),
    ).chat({
      userId: 'user-A',
      content: "Je ne m'appelle pas Sarah.",
    });

    assert.equal(
      (await memoryService.getMemoryByKey('user-A', 'user_name'))?.value,
      'Sarah',
    );
  });

  it('correction de prénom Sarah → Julie (upsert)', async () => {
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

  it('changement de valeur location Paris → Cotonou', async () => {
    const memoryService = new MemoryService(new InMemoryMemoryStore());

    await new ConversationService(
      memoryService,
      async () => 'ok',
      fixedExtractor([{ key: 'location', value: 'Paris' }]),
    ).chat({
      userId: 'user-A',
      content: "J'habite à Paris.",
    });

    await new ConversationService(
      memoryService,
      async () => 'ok',
      fixedExtractor([{ key: 'location', value: 'Cotonou' }]),
    ).chat({
      userId: 'user-A',
      content: "J'habite à Cotonou.",
    });

    assert.equal((await memoryService.getMemories('user-A')).length, 1);
    assert.equal(
      (await memoryService.getMemoryByKey('user-A', 'location'))?.value,
      'Cotonou',
    );
  });

  it('valeurs génériques rejetées par le schéma/parser', () => {
    const rejected = [
      'mon',
      'quel',
      'moi',
      'prénom',
      'prenom',
      'mon prénom',
      'quoi',
      'où',
      'comment',
      'je',
      'ma',
      'mes',
    ];

    for (const value of rejected) {
      assert.equal(isGenericMemoryValue(value), true, `should reject: ${value}`);
      assert.equal(
        normalizeMemoryCandidate('user_name', value),
        null,
        `normalize should reject: ${value}`,
      );
      assert.deepEqual(
        parseMemoryExtractionResponse(
          JSON.stringify({
            memories: [{ key: 'user_name', value }],
          }),
        ),
        [],
        `parser should reject: ${value}`,
      );
    }

    assert.deepEqual(
      parseMemoryExtractionResponse(
        JSON.stringify({
          memories: [{ key: 'user_name', value: 'mon' }],
        }),
      ),
      [],
    );
  });

  it('NoOp ne casse pas les questions', async () => {
    const memoryService = new MemoryService(new InMemoryMemoryStore());
    await memoryService.upsertMemory({
      userId: 'user-A',
      key: 'user_name',
      value: 'Sarah',
    });

    await new ConversationService(
      memoryService,
      async () => 'ok',
      new NoOpMemoryExtractor(),
    ).chat({
      userId: 'user-A',
      content: 'Quel est mon prénom ?',
    });

    assert.equal(
      (await memoryService.getMemoryByKey('user-A', 'user_name'))?.value,
      'Sarah',
    );
  });
});
