import { describe, expect, it } from 'vitest';
import { resolveAuthBootFailure, retryAuthBootAction } from './auth-boot';
import { ApiError } from '../services/api';

describe('bootstrap auth', () => {
  it('401 → login, pas unavailable', () => {
    expect(
      resolveAuthBootFailure(new ApiError('Authentification requise.', 401)),
    ).toEqual({ view: 'login' });
  });

  it('erreur réseau → unavailable (ne pas traiter comme session absente)', () => {
    expect(
      resolveAuthBootFailure(
        new ApiError('Impossible de contacter le backend STELLA.', 0),
      ),
    ).toEqual({
      view: 'unavailable',
      message: 'Impossible de contacter le backend STELLA.',
    });
  });

  it('autre erreur serveur → unavailable', () => {
    expect(resolveAuthBootFailure(new ApiError('crash', 500))).toEqual({
      view: 'unavailable',
      message: 'Le backend STELLA est indisponible.',
    });
  });

  it('Réessayer relance le boot /me sans refresh navigateur', () => {
    expect(retryAuthBootAction()).toEqual({ view: 'boot', bootError: null });
  });
});
