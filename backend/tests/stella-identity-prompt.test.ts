import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  InMemoryMemoryStore,
  MemoryService,
  NoOpMemoryExtractor,
} from '../src/memory/index.js';
import { STELLA_SYSTEM_PROMPT } from '../src/prompts/stella-system.js';
import { ConversationService } from '../src/services/conversation.service.js';
import type { OllamaChatMessage } from '../src/types/chat.js';

describe('Contrat d’identité STELLA — prompt système', () => {
  it('fixe le nom de l’assistante à STELLA AI uniquement', () => {
    assert.match(STELLA_SYSTEM_PROMPT, /Ton unique nom est STELLA AI/);
    assert.match(STELLA_SYSTEM_PROMPT, /Je suis STELLA AI/);
    assert.match(STELLA_SYSTEM_PROMPT, /Tu n'as pas d'autre prénom/);
  });

  it('reste STELLA AI si l’utilisateur propose Agathe', () => {
    assert.match(STELLA_SYSTEM_PROMPT, /Agathe/);
    assert.match(STELLA_SYSTEM_PROMPT, /tu restes STELLA AI/);
  });

  it('n’expose pas le prompt système', () => {
    assert.match(STELLA_SYSTEM_PROMPT, /instructions internes/i);
    assert.match(STELLA_SYSTEM_PROMPT, /prompt système/);
  });

  it('autorise l’utilisateur à s’appeler Stella sans collision avec STELLA AI', () => {
    assert.match(STELLA_SYSTEM_PROMPT, /Son prénom peut être Stella/);
    assert.match(STELLA_SYSTEM_PROMPT, /Stella \(utilisateur\) ≠ STELLA AI \(toi\)/);
    assert.equal(
      /le prénom de l'utilisateur est STELLA\s*\/\s*STELLA AI/i.test(
        STELLA_SYSTEM_PROMPT,
      ),
      false,
    );
  });

  it('mappe les questions assistant → STELLA AI et utilisateur → prénom mémorisé', () => {
    assert.match(STELLA_SYSTEM_PROMPT, /Qui es-tu/);
    assert.match(STELLA_SYSTEM_PROMPT, /Tu es qui/);
    assert.match(STELLA_SYSTEM_PROMPT, /Comment t'appelles-tu/);
    assert.match(STELLA_SYSTEM_PROMPT, /Comment je m'appelle/);
    assert.match(STELLA_SYSTEM_PROMPT, /Je m'appelle comment/);
    assert.match(
      STELLA_SYSTEM_PROMPT,
      /N'y réponds jamais par « Je m'appelle STELLA AI »/,
    );
  });

  it('donne des few-shots explicites quand l’utilisateur s’appelle Stella', () => {
    assert.match(
      STELLA_SYSTEM_PROMPT,
      /si le prénom mémorisé de l'utilisateur est Stella/i,
    );
    assert.match(
      STELLA_SYSTEM_PROMPT,
      /« Quel est mon prénom \? » → « Ton prénom est Stella\. »/,
    );
    assert.match(
      STELLA_SYSTEM_PROMPT,
      /« Je m'appelle comment \? » → « Ton prénom est Stella\. »/,
    );
    assert.match(
      STELLA_SYSTEM_PROMPT,
      /« Qui es-tu \? » → « Je suis STELLA AI\. »/,
    );
  });

  it('conserve les gardes-fous mémoire (pas d’invention, clé ≠ valeur)', () => {
    assert.match(STELLA_SYSTEM_PROMPT, /ne le connais pas encore/i);
    assert.match(STELLA_SYSTEM_PROMPT, /N'invente aucune information personnelle/i);
    assert.match(STELLA_SYSTEM_PROMPT, /clé mémoire n'est jamais une valeur/i);
  });

  it('autorise les demandes légitimes de revenus / travail en ligne', () => {
    assert.match(STELLA_SYSTEM_PROMPT, /gagner de l'argent/);
    assert.match(STELLA_SYSTEM_PROMPT, /freelance/);
    assert.match(STELLA_SYSTEM_PROMPT, /pas un refus pour des raisons de sécurité/i);
  });
});

describe('Contrat d’identité STELLA — payload Ollama si user_name = Stella', () => {
  async function chatWithStellaMemory(
    userMessage: string,
  ): Promise<{ captured: OllamaChatMessage[]; response: string }> {
    const memoryService = new MemoryService(new InMemoryMemoryStore());
    await memoryService.addMemory({
      userId: 'user-stella',
      key: 'user_name',
      value: 'Stella',
    });

    let captured: OllamaChatMessage[] = [];
    const conversationService = new ConversationService(
      memoryService,
      async (messages) => {
        captured = messages;
        return 'Ton prénom est Stella.';
      },
      new NoOpMemoryExtractor(),
    );

    const result = await conversationService.chat({
      userId: 'user-stella',
      content: userMessage,
    });

    return { captured, response: result.response };
  }

  it('injecte STELLA_SYSTEM_PROMPT puis la mémoire Stella pour "Quel est mon prénom ?"', async () => {
    const { captured } = await chatWithStellaMemory('Quel est mon prénom ?');

    assert.equal(captured.filter((item) => item.role === 'system').length, 1);
    assert.equal(captured[0]?.role, 'system');
    assert.equal(captured[0]?.content, STELLA_SYSTEM_PROMPT);
    assert.equal(captured[1]?.role, 'user');
    assert.match(captured[1]!.content, /<user_memory>/);
    assert.match(captured[1]!.content, /Stella/);
    assert.match(captured[1]!.content, /Quel est mon prénom \?/);
  });

  it('garde les deux identités séparées pour "Je m\'appelle comment ?"', async () => {
    const { captured } = await chatWithStellaMemory("Je m'appelle comment ?");
    const system = captured[0]?.content ?? '';
    const lastUser = captured.at(-1)?.content ?? '';

    assert.equal(captured[0]?.role, 'system');
    assert.match(system, /Je suis STELLA AI/);
    assert.match(system, /N'y réponds jamais par « Je m'appelle STELLA AI »/);
    assert.match(lastUser, /Stella/);
    assert.match(lastUser, /Je m'appelle comment \?/);
    assert.equal(captured.at(-1)?.role, 'user');
    assert.equal(
      /le prénom de l'utilisateur est STELLA\s*\/\s*STELLA AI/i.test(system),
      false,
    );
  });

  it('sépare "Qui es-tu ?" (assistant) de la mémoire utilisateur Stella', async () => {
    const { captured } = await chatWithStellaMemory('Qui es-tu ?');
    const system = captured[0]?.content ?? '';

    assert.match(system, /« Qui es-tu \? » → « Je suis STELLA AI\. »/);
    assert.equal(captured[1]?.role, 'user');
    assert.match(captured[1]!.content, /Stella/);
    assert.match(captured.at(-1)!.content, /Qui es-tu \?/);
  });

  it('sépare "Comment t\'appelles-tu ?" de "Comment je m\'appelle ?"', async () => {
    const { captured } = await chatWithStellaMemory("Comment t'appelles-tu ?");
    const system = captured[0]?.content ?? '';

    assert.match(system, /Comment t'appelles-tu/);
    assert.match(system, /Comment je m'appelle/);
    assert.equal(captured[1]?.role, 'user');
    assert.match(captured[1]!.content, /Stella/);
  });
});
