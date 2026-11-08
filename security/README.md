# Audit de sécurité avec AegisAI

Mnemo est scanné avec [AegisAI](https://github.com/Stellouuuuu/aegisai), un scanner black-box
pour applications LLM. Le résultat de chaque audit est dans [`docs/securite/`](../docs/securite/).

## Rejouer le scan

```bash
# 1. Mnemo avec Postgres et un chat non limité (le scan envoie des centaines de requêtes)
cd backend && CHAT_RATE_LIMIT_MAX=100000 MEMORY_STORE=postgres npm run dev

# 2. Deux comptes de test (le second sert aux tests d'isolation entre utilisateurs)
curl -c a.txt -H 'content-type: application/json' -d '{"email":"a@test.local","password":"mot-de-passe-long-1"}' localhost:3001/api/auth/register
curl -c b.txt -H 'content-type: application/json' -d '{"email":"b@test.local","password":"mot-de-passe-long-1"}' localhost:3001/api/auth/register
export MNEMO_COOKIE_A="mnemo_session=$(awk '/mnemo_session/ {print $NF}' a.txt)"
export MNEMO_COOKIE_B="mnemo_session=$(awk '/mnemo_session/ {print $NF}' b.txt)"

# 3. Le scan (une dizaine de minutes avec un modèle local)
aegis scan --config security/aegisai-target.example.json \
  --modules prompt_injection,data_leakage,output,rag --confirm-authorized --out rapport.json
```

À faire sur une base de test, jamais sur des données réelles : le scan crée des centaines de
conversations et ajoute puis supprime des documents.

## En intégration continue

Le workflow `.github/workflows/security.yml` scanne Mnemo à chaque push avec AegisAI, mais **avec un faux modèle** (`security/stub-ollama.mjs`) : le pire modèle possible, qui obéit à toute consigne, demande un outil dès qu'on lui en parle et recopie les extraits de documents qu'on lui montre. Un vrai modèle de plusieurs Go ne tient pas dans un runner GitHub, et ce n'est pas le but : le job vérifie ce que **le serveur garantit quel que soit le modèle**.

`security/check-guarantees.py` fait échouer le job si AegisAI trouve une faille que le serveur doit exclure : outil exécuté sans accord (TS-01, TS-02, TS-03, TS-05), document lu par un autre compte (RAG-02), contenu d'un compte qui influence un autre (RAG-04, RAG-05, DL-04). Les failles qui dépendent du comportement du modèle (PI-02, PI-03, PI-04, OS-01...) sont attendues avec ce faux modèle et seulement affichées.

**Le contrôle a été vérifié par mutation**, pas seulement sur le code sain : en faisant exécuter l'outil sensible sans accord, le job échoue sur TS-02 ; en retirant le filtre par propriétaire de la recherche (et la garde `hasDocuments` qui le masquait), il échoue sur RAG-02, RAG-04 et RAG-05. Le code sain passe en environ une seconde de scan.

La revue statique (`aegis audit-code`) tourne aussi, et ses résultats partent vers l'onglet « Security » de GitHub (SARIF).

Pour rejouer en local : démarrer Postgres avec pgvector, `node security/stub-ollama.mjs 11500`, le backend avec `OLLAMA_BASE_URL=http://127.0.0.1:11500 OLLAMA_MODEL=stub RAG_MIN_SIMILARITY=0.05`, puis `aegis scan --config security/ci-target.json ...`.
