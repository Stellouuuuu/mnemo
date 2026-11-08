import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ChatMessage } from './ChatMessage';

const ATTACK = '<script>alert(1)</script><img src=x onerror=alert(1)> <a href="javascript:alert(1)">x</a>';

function render(content: string, snippet = 'extrait') {
  return renderToStaticMarkup(
    createElement(ChatMessage, {
      message: {
        id: 'm1',
        role: 'assistant',
        content,
        sources: [{ documentId: 'd', title: ATTACK, page: 1, snippet }],
      },
    }),
  );
}

// Le scanner AegisAI signale que le modèle écrit du HTML actif quand on le lui demande. Ce n'est
// exploitable que si l'interface l'interprète : ces tests vérifient qu'elle l'affiche comme du texte.
describe('affichage d’une réponse contenant du HTML actif', () => {
  it('échappe les balises du texte et du bloc de code', () => {
    const html = render(`${ATTACK}\n\n\`\`\`html\n${ATTACK}\n\`\`\``);
    expect(html).not.toMatch(/<script/i);
    expect(html).not.toMatch(/<img/i);
    expect(html).not.toMatch(/<a /i);
    expect(html).toContain('&lt;script&gt;');
  });

  it('échappe aussi le titre et l’extrait d’une source', () => {
    const html = render('ok', ATTACK);
    expect(html).not.toMatch(/<script/i);
    expect(html).not.toMatch(/<img/i);
  });
});
