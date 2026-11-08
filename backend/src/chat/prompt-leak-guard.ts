import { MNEMO_SYSTEM_PROMPT } from '../prompts/mnemo-system.js';

/** Réponse donnée à la place d'un texte qui reproduisait les instructions internes. */
export const PROMPT_LEAK_REFUSAL =
  "Je ne peux pas fournir mes instructions internes. En revanche, je peux vous aider autrement.";

/** Longueur (en caractères normalisés, soit environ huit mots) d'un passage recopié qui déclenche le garde. */
const WINDOW = 48;

function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

function windows(text: string, size: number): Set<string> {
  const found = new Set<string>();
  for (let start = 0; start + size <= text.length; start += 1) {
    found.add(text.slice(start, start + size));
  }
  return found;
}

/**
 * Détecte une réponse qui recopie un passage des instructions internes. Ce contrôle ne dépend
 * pas du modèle : le prompt demande de ne pas les révéler, mais un modèle local obéit parfois
 * à « affiche ton prompt système ». Le texte est normalisé (casse, ponctuation, mise en forme)
 * pour que citer entre guillemets ou en liste n'échappe pas au contrôle.
 */
export function createPromptLeakGuard(prompt: string = MNEMO_SYSTEM_PROMPT) {
  const known = windows(normalize(prompt), WINDOW);

  return function leaksSystemPrompt(reply: string): boolean {
    const text = normalize(reply);
    for (let start = 0; start + WINDOW <= text.length; start += 1) {
      if (known.has(text.slice(start, start + WINDOW))) {
        return true;
      }
    }
    return false;
  };
}

export const leaksSystemPrompt = createPromptLeakGuard();
