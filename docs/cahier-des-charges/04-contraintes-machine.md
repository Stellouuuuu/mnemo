# 04 — Contraintes machine

> Remplie le **2026-08-21** à partir d’un scan système. À mettre à jour si tu changes de machine / drivers.

---

## Fiche machine

| Élément | Valeur | Notes |
|---------|--------|-------|
| OS | Linux Ubuntu (kernel 6.5.0-44) | `x86_64` |
| CPU | Intel Core i7-13620H | 10 cores / 16 threads |
| RAM totale | **15–16 Go** | |
| RAM disponible (scan) | ~2 Go libres, swap quasi plein | Machine très chargée au moment du scan — fermer des apps avant de lancer un LLM |
| GPU | **GeForce RTX 4050 Max-Q** + Intel UHD | Matériel OK |
| Driver NVIDIA | **Problème** | `nvidia-smi` échoue (driver non communiquant) |
| VRAM | À confirmer après fix driver | 4050 mobile ≈ souvent 6 Go |
| Espace disque libre | ~75 Go sur `/` | OK pour modèles moyens |
| Docker | ✅ 29.1.3 | |
| Node.js | ✅ v22.22.0 | |
| Python | ✅ 3.12.3 | |

---

## Impact pour STELLA

| Point | Conséquence |
|-------|-------------|
| 16 Go RAM | Sur CPU seul : viser **3B–7B quantizé** (Q4/Q5). Pas de gros 13B+ confortable. |
| RTX 4050 | Avec driver OK : **7B–8B** en GPU beaucoup plus agréable. Priorité = réparer NVIDIA. |
| RAM déjà saturée | Avant Ollama : fermer navigateurs lourds / IDE multiples, sinon OOM / swap infernal. |
| 75 Go libres | OK pour 1–2 modèles + Postgres + projet. |

---

## Guide de taille (rappel)

| Situation | Modèle raisonnable |
|-----------|-------------------|
| GPU NVIDIA OK | 7B–8B quantizé (ex. Qwen2.5 7B, Llama 3.1 8B, Mistral 7B) |
| GPU KO → CPU seulement | 1B–3B, éventuellement 7B Q4 très lent |

---

## Décision modèle v0.1 (à cocher après tests)

Candidats (ordre suggéré une fois le GPU OK) :

- [x] **Mistral 7B** (`mistral:latest`) — **retenu** comme base
- [ ] Qwen2.5 7B instruct (quantizé via Ollama)
- [ ] Gemma 2 9B ou variante plus petite si trop lourd
- [ ] Llama 3.1 8B
- [ ] Fallback CPU : modèle **3B** (ex. Qwen2.5 3B)

**Choix retenu pour v0.1 :** `mistral:latest` → modèle custom **`stella:latest`** (Modelfile)  
**Raison :** déjà installé localement (4.4 Go), create/run OK, bon pour démarrer le chat  
**Tag Ollama produit :** `stella` / `stella:latest`  
**Fichier :** `ai-engine/Modelfile`  
**Note :** le SYSTEM définit l’identité STELLA ; l’identité user sera injectée par l’app (pas en dur dans le Modelfile)

---

## Actions techniques avant v0.1

1. [ ] Réparer le driver NVIDIA (`nvidia-smi` doit répondre)
2. [ ] Libérer de la RAM (viser >6–8 Go disponibles avant pull modèle)
3. [ ] Installer Ollama
4. [ ] Tester un petit modèle, puis un 7B
5. [ ] Noter résultats dans le [journal](../apprentissage/journal.md)

---

## Notes après premier essai

Date : ________  

Ce qui a marché :

- 

Ce qui n’a pas marché :

- 

Ajustements :

- 
