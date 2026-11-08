# ai-engine

Couche IA de Mnemo (prompts, modèles, plus tard contexte / RAG côté moteur).

## Modèle local actuel

| Élément | Valeur |
|---------|--------|
| Base | `mistral:latest` |
| Modèle produit | `mnemo:latest` |
| Définition | [`Modelfile`](./Modelfile) |

### Créer / mettre à jour

```bash
ollama create mnemo -f ai-engine/Modelfile
ollama run mnemo
```

Sortie du chat CLI : `/bye`

### Règle importante

Le **SYSTEM** du Modelfile décrit **Mnemo** (identité, ton, domaines).  
Il ne doit **pas** hardcoder qui est l’utilisateur (« Stellouuu », etc.).  
Ces infos viendront du backend (session / profil) dans le prompt de conversation.
