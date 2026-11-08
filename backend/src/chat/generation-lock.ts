const locks = new Set<string>();

/**
 * Mutex process-local : une seule génération par conversationId.
 *
 * Ne fournit PAS de protection inter-processus (cluster, plusieurs
 * instances Node). Le modèle de déploiement actuel est un seul processus.
 *
 * Toujours appeler la fonction de libération, typiquement dans un `finally`,
 * après succès, timeout Ollama, erreur ou exception — sinon le verrou reste pris.
 *
 * Retourne une fonction de libération, ou null si déjà verrouillé.
 */
export function tryAcquireGenerationLock(
  conversationId: string,
): (() => void) | null {
  if (locks.has(conversationId)) {
    return null;
  }

  locks.add(conversationId);
  let released = false;

  return () => {
    if (released) {
      return;
    }
    released = true;
    locks.delete(conversationId);
  };
}

export function isGenerationLocked(conversationId: string): boolean {
  return locks.has(conversationId);
}
