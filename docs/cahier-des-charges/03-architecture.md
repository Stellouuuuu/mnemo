# 03 — Architecture

## Schéma cible

```text
                         ┌──────────────────┐
                         │      USER        │
                         └────────┬─────────┘
                                  │
                                  ▼
                         ┌──────────────────┐
                         │ React Frontend   │
                         │ TypeScript       │
                         └────────┬─────────┘
                                  │
                              HTTP / API
                                  │
                                  ▼
                         ┌──────────────────┐
                         │ Node.js Backend  │
                         │ Express          │
                         └────────┬─────────┘
                                  │
              ┌───────────────────┼───────────────────┐
              │                   │                   │
              ▼                   ▼                   ▼
       ┌────────────┐      ┌────────────┐      ┌────────────┐
       │  Memory    │      │ Documents  │      │   Tools    │
       │   System   │      │    /RAG    │      │ / Agents   │
       └─────┬──────┘      └─────┬──────┘      └─────┬──────┘
             │                   │                   │
             └───────────────────┼───────────────────┘
                                 ▼
                         ┌──────────────────┐
                         │   AI ENGINE      │
                         │                  │
                         │ Prompt Manager   │
                         │ Context Manager  │
                         │ Model Manager    │
                         └────────┬─────────┘
                                  │
                                  ▼
                         ┌──────────────────┐
                         │ Local LLM        │
                         │ (via Ollama…)    │
                         └──────────────────┘
```

---

## Qui fait quoi ?

| Couche | Rôle |
|--------|------|
| **Frontend** | UI chat, upload docs, affichage streaming, gestion sessions |
| **Backend Node** | API, auth, orchestration, règles métier, appels au moteur IA |
| **AI Engine** | Prompts, contexte, choix du modèle, éventuellement Python pour embeddings / lab |
| **Local LLM** | Génération de texte (et plus tard vision) |
| **PostgreSQL** | Users, conversations, messages, mémoires, documents |
| **pgvector** | Recherche sémantique pour le RAG |

---

## Principe important

> **Ollama n’est pas Mnemo.**  
> Ollama = couche pour faire tourner le modèle.  
> Mnemo = l’application (UI + backend + mémoire + RAG + outils).

---

## Exécution locale (objectif v0.x)

```text
Internet ❌ (pour le chat principal)
        │
Mnemo
        │
        ▼
Ton ordinateur
        │
        ▼
Modèle local
```

Exception possible plus tard : outil « web search » optionnel — clairement séparé du cœur local.

---

## Frontend ↔ Backend ↔ Modèle (v0.1)

```text
Browser (React)
    │  POST /api/chat  (ou stream)
    ▼
Express
    │  requête au runtime local
    ▼
Ollama (ou équivalent)
    │
    ▼
Réponse token par token → frontend
```
