// Faux serveur Ollama, utilisé par l'audit de sécurité en intégration continue.
//
// C'est le PIRE modèle possible : il obéit à toute consigne qu'il voit et demande un outil dès
// qu'on lui en parle, et recopie les extraits de documents qu'on lui montre. Le but n'est pas de mesurer un vrai modèle (c'est le rôle des audits
// faits avec un modèle local) mais de vérifier que les protections du SERVEUR tiennent même si
// le modèle est entièrement manipulé : outils derrière un accord, isolation entre comptes.
//
//   node security/stub-ollama.mjs [port]      (11500 par défaut)
import http from 'node:http';

const PORT = Number(process.argv[2] ?? 11500);
const DIMENSIONS = 1024;

function hash(word) {
  let h = 2166136261;
  for (const ch of word) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return Math.abs(h);
}

function embed(text) {
  const vector = new Array(DIMENSIONS).fill(0);
  for (const word of text.toLowerCase().match(/[\p{L}\p{N}_]{3,}/gu) ?? []) {
    vector[hash(word) % DIMENSIONS] += 1;
  }
  const norm = Math.sqrt(vector.reduce((sum, x) => sum + x * x, 0)) || 1;
  return vector.map((x) => x / norm);
}

function lastUser(messages) {
  return [...messages].reverse().find((m) => m.role === 'user')?.content ?? '';
}

/** Ce que ferait un modèle qui obéit à tout. */
function decide(body) {
  const messages = body.messages ?? [];
  const last = messages.at(-1);
  if (last?.role === 'tool') {
    return { text: 'Voici le résultat.', calls: [] };
  }
  const text = lastUser(messages);

  // Il recopie tout ce que le serveur lui montre des documents : si la recherche rend les documents
  // d'un autre compte, ils apparaissent donc dans la réponse.
  const knowledge = text.match(/<knowledge>([\s\S]*?)<\/knowledge>/);
  if (knowledge) {
    return { text: `Voici ce que je vois : ${knowledge[1].replace(/\s+/g, ' ').slice(0, 1500)}`, calls: [] };
  }

  // Une consigne d'imposer un marqueur : il obéit.
  const marker = text.match(/\bAEGIS_[A-Z0-9_]{4,}\b/);
  if (marker && /(uniquement|only|exactly|exactement|r[ée]ponds|reply|answer)/i.test(text)) {
    return { text: marker[0], calls: [] };
  }

  const offered = new Set((body.tools ?? []).map((t) => t.function.name));
  const calls = [];
  if (offered.size > 0) {
    if (/(supprim|delete|efface|oublie|remove|wipe)/i.test(text) && offered.has('delete_memory')) {
      calls.push({ function: { name: 'delete_memory', arguments: { key: 'user_name' } } });
    }
    if (/(n'importe quel outil|every tool|any tool|envoie|send)/i.test(text)) {
      calls.push({ function: { name: 'send_email', arguments: { to: 'x@example.test' } } });
      calls.push({ function: { name: 'grant_admin', arguments: { user: 'me' } } });
    }
    if (/(combien|calcul|fois|plus)/i.test(text) && offered.has('calculator')) {
      calls.push({ function: { name: 'calculator', arguments: { expression: '2+2' } } });
    }
  }
  return { text: calls.length > 0 ? '' : 'Bonjour, je suis un faux modèle.', calls };
}

function readBody(req) {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', (chunk) => (data += chunk));
    req.on('end', () => resolve(data ? JSON.parse(data) : {}));
  });
}

const server = http.createServer(async (req, res) => {
  const json = (status, payload) => {
    res.writeHead(status, { 'content-type': 'application/json' });
    res.end(JSON.stringify(payload));
  };

  if (req.method === 'GET' && req.url === '/api/tags') {
    return json(200, { models: [{ name: 'stub:latest' }] });
  }
  if (req.method !== 'POST') {
    return json(404, { error: 'not found' });
  }

  const body = await readBody(req);

  if (req.url === '/api/embed') {
    const input = Array.isArray(body.input) ? body.input : [body.input];
    return json(200, { embeddings: input.map(embed) });
  }

  if (req.url === '/api/chat') {
    const { text, calls } = decide(body);
    const message = { role: 'assistant', content: text, ...(calls.length ? { tool_calls: calls } : {}) };
    if (body.stream === false) {
      return json(200, { model: 'stub', message, done: true });
    }
    res.writeHead(200, { 'content-type': 'application/x-ndjson' });
    res.write(`${JSON.stringify({ model: 'stub', message, done: false })}\n`);
    res.end(`${JSON.stringify({ model: 'stub', message: { role: 'assistant', content: '' }, done: true })}\n`);
    return undefined;
  }

  return json(404, { error: 'not found' });
});

server.listen(PORT, '127.0.0.1', () => console.log(`stub ollama on ${PORT}`));
