# 02 — Périmètre & hors périmètre

## Dans le périmètre (cible long terme)

- Chat local (LLM open source via runtime type Ollama)
- Conversations multi-tours + historique
- Streaming des réponses
- Mémoire conversationnelle + mémoire persistante
- Upload / indexation de documents (PDF…) + RAG
- Outils (calculateur, fichiers, code…)
- Mode agent (planification + multi-outils)
- Vision (images) — version tardive
- Fine-tuning expérimental — version tardive
- Auth multi-utilisateurs (JWT) + données isolées par user
- Interface React moderne
- Docker pour faciliter le démarrage (quand pertinent)

---

## Hors périmètre (au moins au début)

| Hors scope | Raison |
|------------|--------|
| Appels OpenAI / Claude / Gemini pour le cœur | Contredit la vision « local » |
| Entraîner un LLM compétitif from scratch | Ressources impossibles pour un solo |
| Vision dès v0.1 | Trop tôt ; après chat / mémoire / RAG |
| App mobile native | Focus web d’abord |
| Déploiement cloud obligatoire | Local first ; cloud optionnel plus tard |
| Remplacer Cursor / Copilot entièrement | Mnemo aide au code, ce n’est pas l’IDE |

---

## Périmètre strict de la Phase 0

- Rédiger et valider ce cahier des charges
- Remplir la fiche machine
- Choisir une stratégie modèle réaliste pour v0.1
- **Aucun code applicatif obligatoire**

---

## Périmètre v0.1 (rappel)

Uniquement :

```text
UI React  →  Backend Express  →  Modèle local (Ollama)
```

Pas encore : auth, BDD persistante complète, RAG, outils, vision.
