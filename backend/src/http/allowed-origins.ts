/**
 * localhost et 127.0.0.1 sont des hôtes distincts pour le navigateur.
 * Vite affiche souvent http://127.0.0.1:PORT alors que FRONTEND_ORIGIN
 * est http://localhost:PORT — CORS échoue alors (fetch réseau, status 0).
 */
export function expandLoopbackOrigins(primary: string): Set<string> {
  const allowed = new Set<string>();
  const trimmed = primary.trim();
  if (trimmed === '') {
    return allowed;
  }

  allowed.add(trimmed);

  try {
    const url = new URL(trimmed);
    if (url.hostname === 'localhost') {
      url.hostname = '127.0.0.1';
      allowed.add(url.origin);
    } else if (url.hostname === '127.0.0.1') {
      url.hostname = 'localhost';
      allowed.add(url.origin);
    }
  } catch {
    // FRONTEND_ORIGIN malformé : on ne garde que la valeur brute.
  }

  return allowed;
}
