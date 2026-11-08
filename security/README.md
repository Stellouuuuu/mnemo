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
