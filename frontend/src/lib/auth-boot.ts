import { isNetworkError, isUnauthorizedError } from '../services/api';

export type AuthBootFailure =
  | { view: 'login' }
  | { view: 'unavailable'; message: string };

export function resolveAuthBootFailure(err: unknown): AuthBootFailure {
  if (isUnauthorizedError(err)) {
    return { view: 'login' };
  }

  return {
    view: 'unavailable',
    message: isNetworkError(err)
      ? err.message
      : 'Le backend Mnemo est indisponible.',
  };
}

/** Relance le bootstrap `/me` sans refresh navigateur. */
export function retryAuthBootAction(): { view: 'boot'; bootError: null } {
  return { view: 'boot', bootError: null };
}
