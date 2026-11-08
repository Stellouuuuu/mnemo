# 01 — Vision & objectifs

## Vision

**Mnemo** est un assistant IA personnel qui tourne **principalement en local**, sans dépendre d’API commerciales payantes pour le cœur du produit.

Ce n’est pas « juste un chatbot ».

On construit progressivement un **système** capable de :

- comprendre une conversation ;
- garder une mémoire ;
- analyser des documents (RAG) ;
- répondre à partir de connaissances fournies ;
- utiliser des outils ;
- générer et expliquer du code ;
- plus tard : analyser des images ;
- évoluer vers un agent ;
- à terme : être personnalisé / fine-tuné.

---

## Objectif 1 — Produit

À la fin, pouvoir présenter :

> **Mnemo — Local AI Personal Assistant**

avec :

- une vraie interface ;
- un backend ;
- une base de données ;
- un moteur IA local ;
- plusieurs fonctionnalités (chat, mémoire, RAG, outils…).

---

## Objectif 2 — Comprendre l’IA

Au fil du projet, maîtriser (au moins conceptuellement, puis en pratique) :

```text
LLM
│
├── Tokens
├── Embeddings
├── Attention
├── Transformers
├── Context window
├── RAG
├── Vector databases
├── Agents
├── Tool calling
├── Fine-tuning
└── Evaluation
```

Éventuellement : construire un **petit modèle pédagogique** dans `ai-lab/` (pas dans le produit).

---

## Ce que Mnemo n’est pas

| Mnemo n’est pas… | Pourquoi |
|-------------------|----------|
| Un wrapper OpenAI | Objectif = local, indépendance |
| Ollama lui-même | Ollama = runtime ; Mnemo = l’application au-dessus |
| Un LLM entraîné from scratch dès le jour 1 | Trop coûteux ; on commence avec un modèle open source existant |
| Un clone de ChatGPT en une semaine | On avance version par version |

---

## Promesse produit (simple)

> Tu parles à Mnemo sur ton PC.  
> Elle répond avec un modèle local.  
> Plus tard : elle se souvient, lit tes docs, utilise des outils.
