# Journal de bord — STELLA AI

Les entrées les plus récentes en haut.

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
