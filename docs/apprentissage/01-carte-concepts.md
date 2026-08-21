# 01 — Carte des concepts

Explications **simples**. Tu affineras au fur et à mesure dans le journal et dans `ai-lab/`.

---

## LLM (Large Language Model)

Un modèle entraîné à prédire le *prochain token* (morceau de texte).  
Il ne « comprend » pas comme un humain : il continue le texte de façon statistiquement plausible, guidé par le prompt et le contexte.

**Dans STELLA :** le cerveau qui génère les réponses (Qwen, Gemma…).

---

## Token

Unité de texte pour le modèle (souvent un bout de mot, pas forcément un mot entier).

Exemple approximatif : `"TypeScript"` → parfois 1–3 tokens selon le tokenizer.

**Pourquoi ça compte :** la fenêtre de contexte et le coût (même local : RAM / temps) se comptent en tokens.

---

## Context window

Nombre max de tokens que le modèle peut « voir » d’un coup (prompt + historique + réponse).

Si l’historique est trop long → on tronque, résume, ou on s’appuie sur la mémoire / le RAG.

---

## Embedding

Vecteur de nombres qui représente le *sens* d’un texte.  
Deux textes proches en sens → vecteurs proches.

**Dans STELLA (RAG) :** comparer ta question aux chunks de documents.

---

## RAG (Retrieval-Augmented Generation)

1. Chercher des passages pertinents dans *tes* docs  
2. Les coller dans le contexte du prompt  
3. Demander au LLM de répondre *à partir de ça*

Évite d’inventer quand la réponse est dans tes PDFs — **si** le retrieval est bon.

---

## Vector database / pgvector

Stocke des embeddings et permet une recherche « par similarité ».

**Chez nous :** PostgreSQL + extension pgvector (plutôt qu’une base vectorielle séparée au début).

---

## Attention / Transformer

Mécanismes internes du modèle : le Transformer utilise l’attention pour pondérer quelles parties du contexte comptent pour prédire la suite.

**Pour le produit :** pas besoin de tout recoder.  
**Pour apprendre :** on pourra le rejouer en miniature dans `ai-lab/`.

---

## Prompt / Prompt Manager

Le texte qu’on envoie au modèle (instructions système + contexte + message user).

Un bon prompt + bon contexte > changer de modèle trop tôt.

---

## Tool calling

Le modèle demande d’appeler un outil (ex. calculatrice), le backend exécute, renvoie le résultat, le modèle continue.

---

## Agent

Boucle : réfléchir → choisir un outil → observer → répéter jusqu’à un résultat.

Plus fragile qu’un simple chat : on le fait **après** outils stables.

---

## Fine-tuning

Ré-entraîner (partiellement) un modèle sur *tes* données pour adapter le style / le domaine.

Coûteux et délicat → version tardive (v0.8). RAG suffit souvent d’abord.

---

## Ollama

Programme qui fait tourner des modèles locaux et expose une API simple.

**Ce n’est pas STELLA** — c’est le moteur sous le capot.
