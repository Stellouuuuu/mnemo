import { useState, type FormEvent } from 'react';
import { StellaMark } from '../components/brand/StellaMark';
import {
  DISPLAY_NAME_MAX_LENGTH,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
} from '../lib/limits';
import { ApiError, registerUser } from '../services/api';
import type { AuthUser } from '../types/auth';

interface RegisterPageProps {
  onSuccess: (user: AuthUser) => void;
  onGoLogin: () => void;
}

function formatError(err: unknown): string {
  if (err instanceof ApiError) {
    return err.message;
  }
  return 'Une erreur inattendue est survenue.';
}

export function RegisterPage({ onSuccess, onGoLogin }: RegisterPageProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      const user = await registerUser(email, password, displayName || undefined);
      onSuccess(user);
    } catch (err) {
      setError(formatError(err));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="auth-page">
      <form className="auth-form" onSubmit={(event) => void handleSubmit(event)}>
        <div className="auth-form__brand">
          <StellaMark size="md" />
          <h1 className="auth-form__title">STELLA AI</h1>
        </div>
        <p className="auth-form__lead">Créer un compte local.</p>

        <label className="auth-form__label" htmlFor="register-email">
          E-mail
        </label>
        <input
          id="register-email"
          className="auth-form__input"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
        />

        <label className="auth-form__label" htmlFor="register-name">
          Nom affiché (optionnel)
        </label>
        <input
          id="register-name"
          className="auth-form__input"
          type="text"
          autoComplete="nickname"
          value={displayName}
          maxLength={DISPLAY_NAME_MAX_LENGTH}
          onChange={(event) => setDisplayName(event.target.value)}
        />

        <label className="auth-form__label" htmlFor="register-password">
          Mot de passe
        </label>
        <input
          id="register-password"
          className="auth-form__input"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
          minLength={PASSWORD_MIN_LENGTH}
          maxLength={PASSWORD_MAX_LENGTH}
        />

        {error ? (
          <p className="auth-form__error" role="alert">
            {error}
          </p>
        ) : null}

        <button className="auth-form__submit" type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Création…' : 'Créer le compte'}
        </button>

        <p className="auth-form__switch">
          Déjà un compte ?{' '}
          <button type="button" className="auth-form__link" onClick={onGoLogin}>
            Se connecter
          </button>
        </p>
        <p className="auth-form__privacy">Vos données restent ici.</p>
      </form>
    </div>
  );
}
