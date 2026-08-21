# Cahier des charges — STELLA AI

Ce dossier décrit **le produit** : ce qu’on construit, pourquoi, avec quelle architecture, et comment on saura que ça marche.

Ce n’est **pas** le journal d’apprentissage (voir `../apprentissage/`).

---

## Sommaire

| # | Document | Contenu |
|---|----------|---------|
| 01 | [Vision & objectifs](01-vision-objectifs.md) | Pourquoi STELLA, objectifs produit & pédagogiques |
| 02 | [Périmètre & hors périmètre](02-perimetre.md) | Ce qu’on fait / ne fait pas (surtout au début) |
| 03 | [Architecture](03-architecture.md) | Schéma global, rôles des composants |
| 04 | [Contraintes machine](04-contraintes-machine.md) | RAM, GPU, modèles possibles — **à remplir** |
| 05 | [Stack technique](05-stack.md) | Choix techniques et raisons |
| 06 | [Fonctionnalités](06-fonctionnalites.md) | Mémoire, RAG, outils, vision, auth… |
| 07 | [Base de données](07-base-de-donnees.md) | Tables prévues (schéma détaillé plus tard) |
| 08 | [Structure du repo](08-structure-repo.md) | Dossiers et responsabilités |
| 09 | [Roadmap & versions](09-roadmap.md) | v0.1 → v1.0 |
| 10 | [Règles du projet](10-regles.md) | Principes non négociables |

Checklists de validation : [`../versions/`](../versions/).

---

## Statut Phase 0

| Critère | Statut |
|---------|--------|
| Vision écrite | ✅ |
| Architecture cible définie | ✅ |
| Stack proposée | ✅ |
| Versions découpées | ✅ |
| Fiche machine remplie | ✅ (RTX 4050 présente, driver à réparer) |
| Décision modèle v0.1 | ⬜ après fix GPU + test Ollama |
| Go pour coder v0.1 | ⬜ |

**Phase 0 = plan clair. On code seulement après validation de cette phase.**
