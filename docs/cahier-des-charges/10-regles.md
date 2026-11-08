# 10 — Règles du projet

## Non négociables

1. **Local first** — le chat principal ne dépend pas d’OpenAI / API payante.
2. **Produit ≠ Labo** — les expériences from-scratch vont dans `ai-lab/`.
3. **Version par version** — pas de RAG avant un chat stable.
4. **Documenter le pourquoi** — chaque décision / échec notable → journal d’apprentissage.
5. **Ollama ≠ Mnemo** — on construit l’app au-dessus du runtime.
6. **Pas de secrets dans Git** — `.env` ignoré, `.env.example` seulement.
7. **Critères de validation** — une feature n’est finie que si la checklist passe.

---

## Branches d’apprentissage

### Vert — Produit

Construire Mnemo utilisable.

### Bleu — Recherche

Comprendre tokens, attention, transformers, mini-LLM…

Les deux coexistent. Le bleu ne casse jamais le vert.

---

## Style de travail recommandé

1. Lire la checklist de la version en cours
2. Faire une petite slice
3. Tester
4. Écrire 5–10 lignes dans le journal (*pourquoi / résultat / échec*)
5. **Commit + push sur GitHub quand l’étape voulue fonctionne** (checklist OK)

Repo distant : `git@github.com:Stellouuuuu/stella-ai.git`  
Dossier de travail : `stella-ai/` (pas le parent).
