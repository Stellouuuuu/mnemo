/**
 * Mesure la recherche de passages sur un petit corpus français : le bon passage remonte-t-il,
 * et une question hors sujet se distingue-t-elle d'une question pertinente ?
 *
 *   EMBEDDING_MODEL=bge-m3 npx tsx eval/retrieval-eval.ts
 *
 * Sans base de données : les vecteurs sont comparés en mémoire (similarité cosinus seule).
 */
import fs from 'node:fs';
import path from 'node:path';
import { chunkSegments } from '../src/knowledge/chunking.js';

const BASE = process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434';
const MODEL = process.env.EMBEDDING_MODEL ?? 'bge-m3';
const PREFIXES: Record<string, { document: string; query: string }> = {
  'nomic-embed-text': { document: 'search_document: ', query: 'search_query: ' },
};
const prefix = PREFIXES[MODEL] ?? { document: '', query: '' };
const K = 3;

async function embed(texts: string[], kind: 'document' | 'query'): Promise<number[][]> {
  const out: number[][] = [];
  for (let i = 0; i < texts.length; i += 8) {
    const response = await fetch(`${BASE}/api/embed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: MODEL,
        input: texts.slice(i, i + 8).map((t) => prefix[kind] + t),
      }),
    });
    const data = (await response.json()) as { embeddings: number[][] };
    out.push(...data.embeddings);
  }
  return out;
}

function cosine(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i += 1) {
    dot += a[i]! * b[i]!;
    na += a[i]! * a[i]!;
    nb += b[i]! * b[i]!;
  }
  return dot / Math.sqrt(na * nb);
}

async function main(): Promise<void> {
  const dir = path.join(import.meta.dirname ?? __dirname, 'corpus');
  const chunks = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.md'))
    .flatMap((file) =>
      chunkSegments([{ page: null, text: fs.readFileSync(path.join(dir, file), 'utf8') }]).map(
        (c) => ({ file, content: c.content }),
      ),
    );
  const vectors = await embed(
    chunks.map((c) => c.content),
    'document',
  );

  const questions = JSON.parse(
    fs.readFileSync(path.join(import.meta.dirname ?? __dirname, 'questions.json'), 'utf8'),
  ) as { relevant: { q: string; expect: string }[]; offTopic: string[] };

  const rank = async (q: string) => {
    const [v] = await embed([q], 'query');
    return chunks
      .map((chunk, i) => ({ chunk, sim: cosine(v!, vectors[i]!) }))
      .sort((a, b) => b.sim - a.sim);
  };

  let hit1 = 0;
  let hitK = 0;
  const relevantBest: number[] = [];
  for (const { q, expect } of questions.relevant) {
    const ranked = await rank(q);
    relevantBest.push(ranked[0]!.sim);
    if (ranked[0]!.chunk.content.toLowerCase().includes(expect)) hit1 += 1;
    if (ranked.slice(0, K).some((r) => r.chunk.content.toLowerCase().includes(expect))) hitK += 1;
  }

  const offBest: number[] = [];
  for (const q of questions.offTopic) {
    offBest.push((await rank(q))[0]!.sim);
  }

  const n = questions.relevant.length;
  const stat = (xs: number[]) =>
    `min ${Math.min(...xs).toFixed(3)}  médiane ${[...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]!.toFixed(3)}  max ${Math.max(...xs).toFixed(3)}`;

  // Meilleur seuil sur la similarité du meilleur passage : proportion de questions bien classées.
  let bestThreshold = 0;
  let bestAccuracy = 0;
  for (let t = 0.2; t <= 0.9; t += 0.005) {
    const correct =
      relevantBest.filter((s) => s >= t).length + offBest.filter((s) => s < t).length;
    const accuracy = correct / (relevantBest.length + offBest.length);
    if (accuracy > bestAccuracy) {
      bestAccuracy = accuracy;
      bestThreshold = t;
    }
  }

  console.log(`Modèle : ${MODEL}  (${vectors[0]!.length} dimensions, ${chunks.length} passages)`);
  console.log(`hit@1 : ${hit1}/${n}   hit@${K} : ${hitK}/${n}`);
  console.log(`Similarité du meilleur passage, questions pertinentes : ${stat(relevantBest)}`);
  console.log(`Similarité du meilleur passage, questions hors sujet  : ${stat(offBest)}`);
  console.log(
    `Meilleur seuil unique : ${bestThreshold.toFixed(3)} (${(bestAccuracy * 100).toFixed(0)} % de questions bien classées)`,
  );
}

void main();
