/**
 * Même corpus et mêmes questions, mais avec la vraie chaîne : Postgres + pgvector, recherche
 * hybride (sens + mots) et seuil de similarité. Indique combien de questions pertinentes
 * retrouvent leur passage, et combien de questions hors sujet ramènent quand même des extraits.
 *
 *   DATABASE_URL=postgresql://... npx tsx eval/hybrid-eval.ts [questions-heldout.json]
 *
 * Le seuil par défaut a été choisi sur questions.json : questions-heldout.json contient des
 * questions écrites après coup, pour vérifier qu'il ne s'applique pas qu'à ces exemples.
 */
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { runMigrations } from '../src/db/migrate.js';
import { createPoolFromEnv } from '../src/db/pool.js';
import { env } from '../src/config/env.js';
import {
  KnowledgeService,
  OllamaEmbedder,
  PostgresKnowledgeStore,
} from '../src/knowledge/index.js';

async function main(): Promise<void> {
  const dir = import.meta.dirname ?? __dirname;
  const pool = createPoolFromEnv();
  await runMigrations(pool);
  const userId = `eval-${randomUUID()}`;
  await pool.query('INSERT INTO users (id) VALUES ($1)', [userId]);

  try {
    const service = new KnowledgeService(new PostgresKnowledgeStore(pool), new OllamaEmbedder());
    for (const file of fs.readdirSync(path.join(dir, 'corpus')).filter((f) => f.endsWith('.md'))) {
      await service.addDocument({
        userId,
        filename: file,
        contentType: 'text/markdown',
        data: fs.readFileSync(path.join(dir, 'corpus', file)),
      });
    }

    const questions = JSON.parse(fs.readFileSync(path.join(dir, process.argv[2] ?? 'questions.json'), 'utf8')) as {
      relevant: { q: string; expect: string }[];
      offTopic: string[];
    };

    let hit1 = 0;
    let hitAny = 0;
    let empty = 0;
    for (const { q, expect } of questions.relevant) {
      const hits = await service.search(userId, q);
      if (hits.length === 0) empty += 1;
      if (hits[0]?.content.toLowerCase().includes(expect)) hit1 += 1;
      if (hits.some((h) => h.content.toLowerCase().includes(expect))) hitAny += 1;
    }

    let falseRetrievals = 0;
    for (const q of questions.offTopic) {
      const hits = await service.search(userId, q);
      if (hits.length > 0) {
        falseRetrievals += 1;
        console.log(`  hors sujet qui ramène ${hits.length} extrait(s) : ${q}`);
      }
    }

    const n = questions.relevant.length;
    console.log(
      `Modèle ${env.EMBEDDING_MODEL}, top ${env.RAG_TOP_K}, seuil ${env.RAG_MIN_SIMILARITY}`,
    );
    console.log(`Pertinentes : bon passage en tête ${hit1}/${n}, présent dans les extraits ${hitAny}/${n}, aucune réponse ${empty}/${n}`);
    console.log(`Hors sujet  : ${falseRetrievals}/${questions.offTopic.length} ramènent des extraits à tort`);
  } finally {
    await pool.query('DELETE FROM users WHERE id = $1', [userId]);
    await pool.end();
  }
}

void main();
