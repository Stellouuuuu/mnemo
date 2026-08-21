# 05 — Stack technique

## Choix retenus (provisoires)

### Frontend

| Techno | Pourquoi |
|--------|----------|
| React | UI moderne, écosystème riche, compétences portfolio |
| TypeScript | Moins d’erreurs, meilleur refactor |
| Vite | Démarrage rapide, DX agréable |
| Tailwind CSS | UI rapide sans CSS lourd au début |

### Backend

| Techno | Pourquoi |
|--------|----------|
| Node.js + Express | API HTTP simple, même langage que le front (TS) |
| TypeScript | Cohérence avec le frontend |

### IA

| Techno | Pourquoi |
|--------|----------|
| Ollama | Runtime local simple pour démarrer |
| Modèles OSS | Qwen / Gemma / Mistral / Llama selon machine |
| Python (+ PyTorch / HF plus tard) | Embeddings, expériences, fine-tune, `ai-lab` |

### Données

| Techno | Pourquoi |
|--------|----------|
| PostgreSQL | Solide, relationnel, multi-users |
| pgvector | RAG sans autre base vectorielle au début |

### DevOps / outils

| Techno | Pourquoi |
|--------|----------|
| Git + GitHub | Versioning, portfolio |
| Docker / docker-compose | Postgres (et services) reproductibles |
| Postman (ou équivalent) | Tester l’API |

---

## Ce qu’on peut changer

Si la machine ou le projet le justifie :

- autre runtime que Ollama (llama.cpp, etc.) ;
- FastAPI en Python pour une partie IA plus tard ;
- autre UI (si besoin) ;
- SQLite en tout début pour prototyper (puis Postgres).

Toute déviation doit être notée dans le [cahier d’apprentissage](../apprentissage/journal.md) avec **pourquoi**.

---

## Séparation Application / Intelligence

```text
backend/     → cerveau applicatif (routes, auth, orchestration)
ai-engine/   → couche IA (prompts, contexte, appels modèle)
ai-lab/      → expériences pédagogiques isolées
```
