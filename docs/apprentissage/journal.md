# Journal de bord — STELLA AI

Les entrées les plus récentes en haut.

---

## 2026-08-21 — Modelfile Ollama : identité STELLA (poussé)

**Version / phase :** Phase 0 → pont vers v0.1  
**Commit :** `7945a16` — `feat(ai): define STELLA identity and user context`

**Objectif de la session :**
- Créer un modèle local personnalisé `stella` à partir de Mistral + prompt système

**Ce que j’ai fait :**
- Écrit `ai-engine/Modelfile` (`FROM mistral:latest`, temperature 0.7, SYSTEM)
- `ollama create stella -f ai-engine/Modelfile` → success
- Testé avec `ollama run stella`
- Corrigé le prompt : plus d’identité user en dur (« Stellouuu »)
- Commit + push sur GitHub

**Pourquoi :**
- Le Modelfile fixe *qui est STELLA* (personnalité, ton, domaines)
- L’identité de l’utilisateur doit venir de l’**application** (session / profil), pas du modèle partagé
- Sinon le modèle invente ou mélange « comment m’appeler » / qui est qui

**Ce que j’ai compris :**
- `ollama create` = calque un nouveau modèle par-dessus un modèle de base + SYSTEM/PARAM
- `stella:latest` ≠ nouvel entraînement : c’est Mistral + instructions
- Premier échec `Error: no FROM line` = Modelfile vide / pas encore sauvé
- `quit` n’est pas la commande de sortie Ollama → utiliser `/bye` ou Ctrl+D
- Un SYSTEM trop « je connais déjà Stella » fait mal répondre aux questions d’identité user

**Ce qui a marché :**
- Modèle `stella:latest` listé (4.4 Go, base mistral)
- Réponses en français, se présente comme STELLA AI locale
- Après correction : « je ne suppose pas qui tu es »

**Ce qui n’a pas marché (puis corrigé) :**
- V1 prompt : utilisatrice principale Stella / « Stellouuu » en dur
- Résultat : confusion sur « comment dois-tu m’appeler ? » (répondait sur son propre nom)
- Décision : section UTILISATEURS neutre + infos fournies par l’app plus tard

**Commandes utiles :**
```bash
ollama create stella -f ai-engine/Modelfile
ollama list
ollama run stella
# sortir : /bye
```

**Prochaine micro-étape :**
- Brancher backend → `http://localhost:11434` avec le modèle `stella`
- Puis UI React (v0.1 Local Chat)

**Temps passé :** session Modelfile + tests + push

---

## 2026-08-21 — Repo GitHub branché (workflow push par étape)

**Version / phase :** Phase 0

**Objectif de la session :**
- Lier le travail local au dépôt distant pour versionner chaque jalon

**Ce que j’ai fait :**
- Clone de `git@github.com:Stellouuuuu/stella-ai.git` dans `stella-ai/`
- Déplacement de toute la doc Phase 0 **dans** ce clone (vrai repo Git)
- Règle de travail : un push quand une étape voulue fonctionne

**Pourquoi :**
- Historique propre sur GitHub = portfolio + sauvegarde
- Évite de travailler hors du dépôt (docs orphelines dans le dossier parent)

**Règle de push :**
- Phase 0 docs OK → 1er commit/push
- Puis v0.1 validée (checklist) → push
- Idem v0.2, v0.3…

**Prochaine micro-étape :**
- Premier commit Phase 0 + `git push -u origin main` (quand Stella le demande)
- Ouvrir le dossier `stella-ai/` comme workspace Cursor

---

## 2026-08-21 — Phase 0 : lancement du cahier des charges

**Version / phase :** Phase 0

**Objectif de la session :**
- Poser la vision STELLA AI sans coder
- Séparer « produit » et « apprentissage »

**Ce que j’ai fait :**
- Défini la vision : assistant local, pas d’API OpenAI pour le cœur
- Structuré le repo docs : cahier des charges + cahier d’apprentissage
- Découpé la roadmap v0.1 → v1.0

**Pourquoi (lien avec STELLA) :**
- Sans plan clair, on mélange tout (RAG, agents, vision) et rien ne marche
- Le journal servira à comprendre *pourquoi* chaque brique existe

**Ce que j’ai compris :**
- Ollama ≠ STELLA : Ollama exécute le modèle ; STELLA est l’application
- On n’entraîne pas un gros LLM from scratch au début
- Produit et `ai-lab/` doivent rester séparés

**Ce qui a marché :**
- Clarification Phase 0 (docs avant code)

**Ce qui n’a pas marché :**
- Rien encore (pas d’install modèle)

**Prochaine micro-étape :**
- ~~Remplir la fiche machine~~ → faite (i7-13620H, 16 Go RAM, RTX 4050 mais driver KO)
- Réparer `nvidia-smi` / driver NVIDIA
- Installer Ollama + tester un petit modèle
- Choisir le modèle v0.1 puis valider Phase 0

**Temps passé :** session de cadrage

---

## 2026-08-21 — Scan machine (pré-v0.1)

**Version / phase :** Phase 0

**Ce que j’ai compris :**
- Config correcte pour du local 7B **si** le GPU marche
- Aujourd’hui : RAM saturée + driver NVIDIA HS → risque d’échec si on force un gros modèle
- Docker / Node / Python déjà là → bon pour la stack prévue

**Ce qui n’a pas marché :**
- `nvidia-smi` : driver NVIDIA ne communique pas
- Cause probable : driver non installé / cassé / secure boot / kernel mismatch
- Suite : diagnostiquer et réparer avant de choisir le modèle définitif
