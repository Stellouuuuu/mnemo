# 08 — Structure du repository

## Cible

```text
mnemo/
│
├── frontend/          # React + TS + Vite
├── backend/           # Node + Express + TS
├── ai-engine/         # Couche IA (prompts, modèles, éventuellement Python)
├── ai-lab/            # Expériences pédagogiques isolées
├── database/          # Migrations, schémas, seeds
├── docs/              # Cahiers des charges & apprentissage
├── tests/
├── scripts/
│
├── .env.example
├── .gitignore
├── docker-compose.yml
└── README.md
```

État actuel Phase 0 : surtout `docs/` + `README` + `ai-lab/` (placeholder).

---

## Pourquoi séparer `ai-engine` ?

| Dossier | Sens |
|---------|------|
| `backend/` | Application : HTTP, auth, règles |
| `ai-engine/` | Intelligence : comment parler au modèle, construire le contexte |
| `ai-lab/` | Apprendre (tokenizer, attention, mini-LLM…) sans casser le produit |

---

## Contenu prévu de `ai-lab/`

```text
ai-lab/
├── tokenizer/
├── embeddings/
├── attention/
├── transformer/
├── mini-llm/
└── experiments/
```

Chaque sous-dossier aura un mini README : *objectif, ce que j’ai appris, ce qui a planté*.
