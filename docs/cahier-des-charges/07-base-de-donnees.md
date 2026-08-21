# 07 — Base de données

## Choix

**PostgreSQL** (+ **pgvector** pour le RAG).

Schéma précis = phase backend. Ici : intention.

---

## Tables prévues (évolutif)

| Table | Rôle |
|-------|------|
| `users` | Comptes |
| `conversations` | Fils de discussion |
| `messages` | Messages user / assistant / system |
| `memories` | Souvenirs persistants |
| `documents` | Métadonnées fichiers uploadés |
| `document_chunks` | Morceaux de texte |
| `embeddings` | Vecteurs (ou colonnes vector dans chunks) |
| `tools` | Catalogue d’outils (plus tard) |

---

## Idées de relations

```text
users 1──* conversations 1──* messages
users 1──* memories
users 1──* documents 1──* document_chunks
```

---

## Règles données

- Isolation par utilisateur
- Pas de secrets en clair dans le repo
- Les embeddings ne se versionnent pas dans Git (trop lourds)
