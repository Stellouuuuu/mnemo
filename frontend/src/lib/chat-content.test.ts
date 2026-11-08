import { describe, expect, it } from 'vitest';
import { parseChatContent } from './chat-content';

describe('parseChatContent', () => {
  it('sépare les paragraphes sur les lignes vides', () => {
    const blocks = parseChatContent(
      'Bonjour Sarah.\n\nJe peux t’aider sur plusieurs sujets.',
    );

    expect(blocks).toEqual([
      { type: 'paragraph', text: 'Bonjour Sarah.' },
      { type: 'paragraph', text: 'Je peux t’aider sur plusieurs sujets.' },
    ]);
  });

  it('conserve les sauts de ligne dans un paragraphe', () => {
    const blocks = parseChatContent('Ligne une\nLigne deux');

    expect(blocks).toEqual([
      { type: 'paragraph', text: 'Ligne une\nLigne deux' },
    ]);
  });

  it('détecte une liste à puces simple', () => {
    const blocks = parseChatContent(
      'Tu peux notamment me demander :\n- le temps\n- une idée\n- un résumé',
    );

    expect(blocks).toEqual([
      { type: 'paragraph', text: 'Tu peux notamment me demander :' },
      {
        type: 'list',
        ordered: false,
        items: ['le temps', 'une idée', 'un résumé'],
      },
    ]);
  });

  it('détecte une liste numérotée simple', () => {
    const blocks = parseChatContent('1. premier\n2. deuxième\n3. troisième');

    expect(blocks).toEqual([
      {
        type: 'list',
        ordered: true,
        items: ['premier', 'deuxième', 'troisième'],
      },
    ]);
  });

  it('extrait un bloc de code fencé avec langage', () => {
    const blocks = parseChatContent(
      'Voici :\n```typescript\nconst hello = "world";\n```\nFin.',
    );

    expect(blocks).toEqual([
      { type: 'paragraph', text: 'Voici :' },
      { type: 'code', language: 'typescript', code: 'const hello = "world";' },
      { type: 'paragraph', text: 'Fin.' },
    ]);
  });

  it('ferme un fence ouvert jusqu’à la fin du texte', () => {
    const blocks = parseChatContent('Intro\n```js\nconst x = 1;');

    expect(blocks).toEqual([
      { type: 'paragraph', text: 'Intro' },
      { type: 'code', language: 'js', code: 'const x = 1;' },
    ]);
  });

  it('sanitise le langage et laisse le HTML comme texte', () => {
    const blocks = parseChatContent('```<script>\nalert(1)\n```\n<b>gras</b>');

    expect(blocks[0]).toEqual({
      type: 'code',
      language: 'script',
      code: 'alert(1)',
    });
    expect(blocks[1]).toEqual({ type: 'paragraph', text: '<b>gras</b>' });
  });

  it('retourne un tableau vide pour un contenu blanc', () => {
    expect(parseChatContent('   \n  ')).toEqual([]);
  });
});
