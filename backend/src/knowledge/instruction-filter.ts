/**
 * Repère les phrases d'un document qui s'adressent à une IA ("ignore tes instructions",
 * "réponds uniquement par X", "SYSTEM NOTE : ..."). Un document est une donnée : ces phrases
 * sont retirées de ce qui est montré au modèle, tout en restant dans le document stocké.
 *
 * C'est une réduction du risque, pas une garantie : un attaquant peut reformuler. Le filtre peut
 * aussi retirer une phrase légitime (un cours sur la sécurité qui cite une injection) : le
 * document est alors signalé à l'utilisateur.
 */
const PATTERNS: RegExp[] = [
  /\b(ignor\w*|disregard|forget|oubli\w*)\b[^.\n]{0,60}\b(instructions?|consignes?|r[eè]gles?|rules?|prompt)\b/i,
  /\b(ignor\w*|disregard)\b[^.\n]{0,30}\b(tout|everything|all)\b/i,
  /\b(r[ée]ponds?|r[ée]pondre|reply|answer|respond|termine|finish|end)\b[^.\n]{0,50}\b(uniquement|seulement|only|exactly|exactement)\b/i,
  /\b(l['’ ]?assistant|l['’ ]?ia|the assistant|the ai|the model|le mod[eè]le)\s+(doit|doivent|must|should|devra|will)\b/i,
  /\b(you must now|tu dois (maintenant|d[ée]sormais)|from now on|d[ée]sormais,? tu)\b/i,
  /(^|[\s[(])(system|syst[eè]me|admin\w*)\s*(note|prompt|message|override|instruction)s?\s*[:\]]/i,
  /\[\s*(system|syst[eè]me|instruction)\b[^\]]*\]/i,
  /\b(instructions?|notes?|consignes?)\s+(pour|for|to)\s+(l['’ ]?assistant|l['’ ]?ia|the assistant|the ai)\b/i,
  /\b(appelle|appeler|call|invoke|invoque|utilise|use|ex[ée]cute|execute)\b[^.\n]{0,25}\b(delete_memory|search_documents|calculator|l['’ ]?outil|the tool|a tool)\b/i,
  /\b(r[ée]v[eè]le|reveal|affiche|print|recopie|copy)\b[^.\n]{0,40}\b(prompt syst[eè]me|system prompt|instructions? internes?|secrets?)\b/i,
];

export const REDACTION_MARK = '[consigne adressée à une IA, retirée]';

export function looksLikeInstruction(sentence: string): boolean {
  return PATTERNS.some((pattern) => pattern.test(sentence));
}

/** Découpe en phrases ou en lignes, en gardant la ponctuation et les retours à la ligne. */
function pieces(text: string): string[] {
  return text.match(/[^.!?\n]+[.!?]*\s*|\n+/g) ?? [text];
}

export interface RedactionResult {
  text: string;
  removed: number;
}

export function redactInstructions(text: string): RedactionResult {
  let removed = 0;
  const kept = pieces(text).map((piece) => {
    if (piece.trim() !== '' && looksLikeInstruction(piece)) {
      removed += 1;
      return `${REDACTION_MARK} `;
    }
    return piece;
  });
  return { text: removed === 0 ? text : kept.join('').replace(/\s+$/, ''), removed };
}

/** Nombre de phrases d'un texte qui s'adressent à une IA. */
export function countInstructionSentences(text: string): number {
  return redactInstructions(text).removed;
}
