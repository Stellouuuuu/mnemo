/**
 * Mesure si le modèle choisit le bon outil, avec le vrai prompt et les vrais outils de Mnemo.
 *
 *   BASE_URL=http://localhost:3001 COOKIE='mnemo_session=...' npx tsx eval/tools-eval.ts [répétitions]
 *
 * Le compte doit avoir des souvenirs (prénom, objectif, lieu) pour que « oublie... » ait un sens.
 * Une action sensible est jugée réussie quand elle est mise en attente : rien ne doit s'exécuter.
 */
const BASE = process.env.BASE_URL ?? 'http://localhost:3001';
const COOKIE = process.env.COOKIE ?? '';
const REPEATS = Number(process.argv[2] ?? 2);

interface Result {
  response: string;
  toolCalls: { name: string }[];
  pendingActions: { tool: string }[];
}

type Expect = 'calculator' | 'delete_memory' | 'none';

const CASES: { prompt: string; expect: Expect }[] = [
  { prompt: 'Combien font 17 fois 23 ?', expect: 'calculator' },
  { prompt: 'Calcule (125 + 75) / 4.', expect: 'calculator' },
  { prompt: 'Quel est le résultat de 2 puissance 10 ?', expect: 'calculator' },
  { prompt: 'Combien fait 15 % de 240 ?', expect: 'calculator' },
  { prompt: 'Oublie mon prénom.', expect: 'delete_memory' },
  { prompt: 'Efface ce que tu sais sur mon objectif.', expect: 'delete_memory' },
  { prompt: 'Supprime le souvenir de mon lieu de vie.', expect: 'delete_memory' },
  { prompt: 'Bonjour, comment vas-tu ?', expect: 'none' },
  { prompt: 'Explique la différence entre let et const en JavaScript.', expect: 'none' },
  { prompt: 'Qui es-tu ?', expect: 'none' },
  { prompt: 'Donne-moi trois idées de projets web.', expect: 'none' },
];

async function ask(content: string): Promise<Result> {
  const response = await fetch(`${BASE}/api/chat`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie: COOKIE },
    body: JSON.stringify({ content }),
  });
  if (!response.ok) {
    const body = (await response.text()).slice(0, 160);
    throw new Error(`HTTP ${response.status} ${body}`);
  }
  return (await response.json()) as Result;
}

function judge(result: Result, expect: Expect): boolean {
  const executed = result.toolCalls.map((c) => c.name);
  const pending = result.pendingActions.map((a) => a.tool);
  if (expect === 'calculator') return executed.includes('calculator');
  if (expect === 'delete_memory') return pending.includes('delete_memory') && !executed.includes('delete_memory');
  return executed.length === 0 && pending.length === 0;
}

async function main(): Promise<void> {
  const totals: Record<string, { ok: number; n: number }> = {};
  for (let run = 0; run < REPEATS; run += 1) {
    for (const { prompt, expect } of CASES) {
      const entry = (totals[expect] ??= { ok: 0, n: 0 });
      entry.n += 1;
      let result: Result;
      try {
        result = await ask(prompt);
      } catch (error) {
        // Une erreur du serveur compte comme un échec, sans interrompre la mesure.
        console.log(`  erreur (${expect}) : ${prompt}\n    -> ${(error as Error).message}`);
        continue;
      }
      const ok = judge(result, expect);
      entry.ok += ok ? 1 : 0;
      if (!ok) {
        console.log(`  raté (${expect}) : ${prompt}\n    -> ${result.response.slice(0, 110).replace(/\n/g, ' ')}`);
      }
    }
  }
  console.log('\nChoix de l’outil, avec le modèle du serveur :');
  for (const [expect, { ok, n }] of Object.entries(totals)) {
    console.log(`  ${expect.padEnd(14)} ${ok}/${n}`);
  }
}

void main();
