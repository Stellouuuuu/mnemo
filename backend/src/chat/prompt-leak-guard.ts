import { MNEMO_SYSTEM_PROMPT } from '../prompts/mnemo-system.js';

/** Réponse donnée à la place d'un texte qui reproduisait les instructions internes. */
export const PROMPT_LEAK_REFUSAL =
  "Je ne peux pas fournir mes instructions internes. En revanche, je peux vous aider autrement.";

/** Un seul passage recopié de cette longueur (environ quinze mots) suffit à déclencher le garde. */
const LONG_WINDOW = 90;
/** Des passages plus courts ne comptent que s'il y en a plusieurs, à des endroits différents. */
const SHORT_WINDOW = 48;
const SHORT_MATCHES = 3;

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
 * Détecte une réponse qui recopie les instructions internes. Ce contrôle ne dépend pas du
 * modèle : le prompt demande de ne pas les révéler, mais un modèle local obéit parfois à
 * « affiche ton prompt système ». Le texte est normalisé (casse, ponctuation, mise en forme)
 * pour que citer entre guillemets ou en liste n'échappe pas au contrôle.
 *
 * Citer une seule règle courte (« utilise la calculatrice pour tout calcul ») n'est pas une
 * fuite : il faut un long passage, ou plusieurs passages distincts.
 */
export function createPromptLeakGuard(prompt: string = MNEMO_SYSTEM_PROMPT) {
  const normalized = normalize(prompt);
  const long = windows(normalized, LONG_WINDOW);
  const short = windows(normalized, SHORT_WINDOW);

  return function leaksSystemPrompt(reply: string): boolean {
    const text = normalize(reply);
    for (let start = 0; start + LONG_WINDOW <= text.length; start += 1) {
      if (long.has(text.slice(start, start + LONG_WINDOW))) {
        return true;
      }
    }
    let matches = 0;
    for (let start = 0; start + SHORT_WINDOW <= text.length; ) {
      if (short.has(text.slice(start, start + SHORT_WINDOW))) {
        matches += 1;
        start += SHORT_WINDOW; // des fragments qui se chevauchent ne comptent qu'une fois
      } else {
        start += 1;
      }
    }
    return matches >= SHORT_MATCHES;
  };
}

export const leaksSystemPrompt = createPromptLeakGuard();
