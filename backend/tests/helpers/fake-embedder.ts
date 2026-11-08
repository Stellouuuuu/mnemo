import { EMBEDDING_DIMENSIONS, type Embedder } from '../../src/knowledge/embeddings.js';

function hash(word: string): number {
  let h = 2166136261;
  for (const ch of word) {
    h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  }
  return Math.abs(h);
}

/** Vecteur "sac de mots" déterministe : deux textes qui partagent des mots sont proches. */
export function bagOfWords(text: string): number[] {
  const vector = new Array<number>(EMBEDDING_DIMENSIONS).fill(0);
  for (const word of text.toLowerCase().match(/[\p{L}\p{N}_]{3,}/gu) ?? []) {
    vector[hash(word) % EMBEDDING_DIMENSIONS]! += 1;
  }
  const norm = Math.sqrt(vector.reduce((sum, x) => sum + x * x, 0)) || 1;
  return vector.map((x) => x / norm);
}

export class FakeEmbedder implements Embedder {
  calls = 0;

  async embed(texts: string[]): Promise<number[][]> {
    this.calls += 1;
    return texts.map(bagOfWords);
  }
}
