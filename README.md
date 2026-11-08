# Mnemo

Assistant IA personnel **local** — sans API commerciale payante (pas d’OpenAI, Anthropic, etc. pour le cœur du produit).

> **Repo :** [Stellouuuuu/stella-ai](https://github.com/Stellouuuuu/stella-ai)  
> **Phase actuelle : v0.3 terminée, prochaine étape v0.4 (documents et RAG).** Le chat en streaming, les conversations, l'authentification et la mémoire (avec son écran de contrôle) fonctionnent.  
> **Workflow :** push sur GitHub dès qu’une étape (checklist) fonctionne.

---

![Écran de mémoire de Mnemo](docs/images/memory-panel.png)

*L'écran « Ce que Mnemo sait de vous » : l'utilisateur voit, corrige ou efface ce qui est retenu.*

## Deux documents à lire en premier

| Document | Pour qui ? | Contenu |
|----------|------------|---------|
| [Cahier des charges](docs/cahier-des-charges/00-INDEX.md) | Le **produit** | Vision, architecture, stack, versions, critères de validation |
| [Cahier d’apprentissage](docs/apprentissage/00-INDEX.md) | **Toi** | Pourquoi on fait X, concepts IA, ce qui a marché / échoué |

---

## Objectif en une phrase

Construire progressivement un système d’IA local (chat → mémoire → RAG → outils → agents), tout en comprenant vraiment comment ça marche.

---

## Règle d’or

Deux branches d’apprentissage séparées :

- **Produit** (`frontend/`, `backend/`, `ai-engine/`) — Mnemo qui fonctionne
- **Labo** (`ai-lab/`) — expériences pédagogiques (tokenizer, mini-LLM, etc.) sans casser l’app

---

## Versions prévues

| Version | Nom | Idée clé |
|---------|-----|----------|
| v0.1 | Local Chat | Première conversation locale |
| v0.2 | Conversations | Historique, streaming, contexte |
| v0.3 | Memory | Mémoire persistante |
| v0.4 | Knowledge | Documents + RAG |
| v0.5 | Tools | Outils (calcul, fichiers, code…) |
| v0.6 | Agent | Planification multi-outils |
| v0.7 | Vision | Analyse d’images |
| v0.8 | Fine-tuning | Dataset + fine-tune |
| v1.0 | Personal AI | Assistant complet |

Détail et checklists : [docs/versions/](docs/versions/).

---

## Stack cible (provisoire)

- **Frontend** : React, TypeScript, Vite, Tailwind
- **Backend** : Node.js, TypeScript, Express
- **IA** : Ollama + modèles open source (Qwen / Gemma / Mistral / Llama…)
- **Base** : PostgreSQL + pgvector
- **Infra** : Git, Docker, etc.

Le choix définitif du modèle dépendra de ma machine (RAM / GPU / disque).

---

## Prochaine étape

1. Lire le [cahier des charges](docs/cahier-des-charges/00-INDEX.md)
2. Lire le [cahier d’apprentissage](docs/apprentissage/00-INDEX.md)
3. Remplir la [fiche machine](docs/cahier-des-charges/04-contraintes-machine.md)
4. Valider Phase 0 → passer à v0.1
