import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { extractTextToolCalls } from '../src/tools/text-calls.js';

describe('extractTextToolCalls', () => {
  it('lit un tableau d’appels à la fin du texte', () => {
    const found = extractTextToolCalls('Je calcule.\n[{"name":"calculator","arguments":{"expression":"1+1"}}]');
    assert.deepEqual(found, {
      calls: [{ name: 'calculator', arguments: { expression: '1+1' } }],
      cleanText: 'Je calcule.',
    });
  });

  it('accepte un objet seul, « parameters » et un bloc de code', () => {
    const found = extractTextToolCalls('```json\n{"name":"search_documents","parameters":{"query":"x"}}\n```');
    assert.deepEqual(found?.calls, [{ name: 'search_documents', arguments: { query: 'x' } }]);
    assert.equal(found?.cleanText, '');
  });

  it('ignore le JSON ordinaire, invalide ou suivi de texte', () => {
    for (const text of [
      'Bonjour',
      '{"name": "Sarah"}x',
      '[{"name": 12, "arguments": {}}]',
      '[{"name":"a","arguments":{}} Et voilà',
      '{"name": "Sarah", "age": 3}',
      'Le champ "name": sert à nommer.',
      '[]',
    ]) {
      assert.equal(extractTextToolCalls(text), null, text);
    }
  });

  it('retrouve l’appel suivi d’une phrase, et garde la phrase', () => {
    const found = extractTextToolCalls(
      'Je calcule : [{"name":"calculator","arguments":{"expression":"(1+2)*3"}}] Voilà, c’est fait.',
    );
    assert.deepEqual(found?.calls, [{ name: 'calculator', arguments: { expression: '(1+2)*3' } }]);
    assert.equal(found?.cleanText, 'Je calcule :\n\nVoilà, c’est fait.');
  });

  it('borne le nombre d’appels et refuse un nom démesuré', () => {
    const many = JSON.stringify(Array.from({ length: 10 }, () => ({ name: 'calculator', arguments: {} })));
    assert.equal(extractTextToolCalls(many)?.calls.length, 3);
    assert.equal(extractTextToolCalls(`[{"name":"${'x'.repeat(65)}","arguments":{}}]`), null);
  });
});
