# 09 — Roadmap & versions

On ne construit pas tout d’un coup.

| Version | Nom | Ajouts principaux |
|---------|-----|-------------------|
| **v0.1** | Local Chat | UI → Backend → Modèle local |
| **v0.2** | Conversations | Historique, streaming, contexte |
| **v0.3** | Memory | Mémoire persistante + récupération |
| **v0.4** | Knowledge | PDF, embeddings, RAG |
| **v0.5** | Tools | Tool calling (calc, fichiers, code…) |
| **v0.6** | Agent | Planification multi-outils |
| **v0.7** | Vision | Analyse d’images |
| **v0.8** | Fine-tuning | Dataset + expérimentation |
| **v1.0** | Personal AI | Assistant complet intégré |

---

## Vue v1.0

```text
             Mnemo
                 │
     ┌───────────┼───────────┐
     │           │           │
 Conversation  Memory     Knowledge
     │           │           │
     └───────────┼───────────┘
                 │
              Agents
                 │
          ┌──────┴──────┐
          │             │
       Tools          Vision
          │             │
          └──────┬──────┘
                 │
              Local LLM
```

---

## Règle de passage de version

Une version n’est « done » que si sa **checklist** dans `docs/versions/` est cochée.

Pas de feature creep : si une idée arrive trop tôt → noter dans le journal, planifier plus tard.
