# 02 — Pourquoi cette architecture ?

Chaque décision a un *pourquoi*. Si tu changes un choix, mets à jour ce fichier + une entrée journal.

---

## Pourquoi local (pas OpenAI) ?

- Apprendre vraiment comment un système IA s’assemble
- Pas de facture API pour chaque token
- Données / conversations restent sur ta machine
- Portfolio différenciant : « j’ai construit un assistant local »

Contrepartie : ta machine limite la taille du modèle ; qualité ≠ GPT-4 au début — c’est OK.

---

## Pourquoi un modèle existant (pas from scratch) ?

Entraîner un LLM compétitif = énorme compute + data + mois/années.  
On **utilise** un modèle OSS, et on **apprend** les bases dans `ai-lab/` (mini modèles).

---

## Pourquoi un Modelfile Ollama ?

Un Modelfile dit : « prends ce modèle de base + ces paramètres + ce SYSTEM prompt = mon modèle nommé `stella` ».

Ce n’est **pas** un fine-tuning. C’est une configuration réutilisable.

| Dans le Modelfile | Dans l’application (plus tard) |
|-------------------|--------------------------------|
| Qui est STELLA | Qui est l’utilisateur connecté |
| Ton / domaines | Historique de conversation |
| Temperature, etc. | Mémoire, RAG, outils |

**Leçon apprise :** mettre le surnom de l’utilisatrice dans le SYSTEM a confondu le modèle. L’identité user = contexte applicatif.


---

## Pourquoi React + Express ?

- Stack courante en entreprise / stages
- Même famille de langage (TypeScript) front et back
- Séparation claire UI / API

---

## Pourquoi PostgreSQL + pgvector ?

- Une seule base pour users, messages **et** vecteurs
- Moins de services à gérer au début
- Compétence CV solide

---

## Pourquoi séparer `ai-engine` et `backend` ?

Pour forcer la question :

> « Est-ce de la logique *application* ou de la logique *IA* ? »

Exemple : « créer une conversation » = backend.  
« Construire le prompt avec mémoire + chunks RAG » = ai-engine.

---

## Pourquoi `ai-lab/` à part ?

Pour pouvoir casser des choses en apprenant (mini transformer, tokenizer…) **sans** rendre STELLA inutilisable.

---

## Pourquoi versionner (v0.1, v0.2…) ?

Parce que tout faire d’un coup = projet mort.  
Chaque version a une checklist : tu sais quand tu as « réussi ».

---

## Pourquoi documenter les échecs ?

Un échec noté devient une leçon.  
Un échec oublié se répète.  
Le journal sert aussi au portfolio / soutenance : « j’ai testé X, ça n’allait pas à cause de Y, j’ai choisi Z ».
