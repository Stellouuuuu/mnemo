# 06 — Fonctionnalités

## 1. Chat local (v0.1+)

- Envoyer un message
- Recevoir une réponse du modèle local
- Streaming progressif
- Aucun appel OpenAI requis

---

## 2. Système de conversations (v0.2+)

- Plusieurs conversations
- Historique messages
- Gestion du contexte (fenêtre de contexte)
- Titres / liste des chats

---

## 3. Mémoire (v0.3+)

### Mémoire conversationnelle

Contexte du fil actuel (messages récents).

### Mémoire persistante

Infos utiles entre conversations, ex. :

```text
User prefers TypeScript
User works on Mnemo
```

**Règle :** ne pas tout stocker. Décider *ce qui mérite d’être mémorisé*.

---

## 4. RAG / Knowledge (v0.4+)

Pipeline :

```text
PDF → Extraction → Chunks → Embeddings → Vector DB → Recherche → Context → LLM → Réponse
```

Cas d’usage : « Dans mon cours, différence entre useEffect et useMemo ? »

---

## 5. Outils (v0.5+)

Exemples :

- Calculator
- File Reader
- Database
- Code Runner
- Document Search
- (plus tard) Web Search optionnel

Passage de « LLM qui répond » → « système qui utilise des outils ».

---

## 6. Agent (v0.6+)

Planifier une tâche, enchaîner plusieurs outils, produire un résultat cohérent.

---

## 7. Code assistant (transversal)

Dès que le chat marche bien :

- expliquer / générer / corriger du code ;
- proposer une architecture ;
- analyser un fichier uploadé ;
- aider au debug ;
- générer des tests.

---

## 8. Vision (v0.7+)

Screenshots, diagrammes, captures d’erreur — **pas maintenant**.

---

## 9. Auth (quand on multiplie les users / la persistence)

```text
Register → Login → JWT → Dashboard → Conversations
```

Chaque user : ses conversations, sa mémoire, ses docs.

---

## Priorité pédagogique « code »

Mnemo doit être particulièrement utile pour le développement logiciel (objectif étudiant / portfolio).
