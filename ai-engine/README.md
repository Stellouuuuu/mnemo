# ai-engine

Couche IA de STELLA (prompts, modèles, plus tard contexte / RAG côté moteur).

## Modèle local actuel

| Élément | Valeur |
|---------|--------|
| Base | `mistral:latest` |
| Modèle produit | `stella:latest` |
| Définition | [`Modelfile`](./Modelfile) |

### Créer / mettre à jour

```bash
ollama create stella -f ai-engine/Modelfile
ollama run stella
```

Sortie du chat CLI : `/bye`

### Règle importante

Le **SYSTEM** du Modelfile décrit **STELLA** (identité, ton, domaines).  
Il ne doit **pas** hardcoder qui est l’utilisateur (« Stellouuu », etc.).  
Ces infos viendront du backend (session / profil) dans le prompt de conversation.
