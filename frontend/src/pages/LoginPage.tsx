import { useState, type FormEvent } from 'react';
import { MnemoMark } from '../components/brand/MnemoMark';
import { ApiError, loginUser } from '../services/api';
import type { AuthUser } from '../types/auth';

interface LoginPageProps {
  onSuccess: (user: AuthUser) => void;
  onGoRegister: () => void;
}

function formatError(err: unknown): string {
  if (err instanceof ApiError) {
    return err.message;
  }
  return 'Une erreur inattendue est survenue.';
}

export function LoginPage({ onSuccess, onGoRegister }: LoginPageProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      const user = await loginUser(email, password);
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
          <MnemoMark size="md" />
          <h1 className="auth-form__title">Mnemo</h1>
        </div>
        <p className="auth-form__lead">Connexion à votre assistante locale.</p>

        <label className="auth-form__label" htmlFor="login-email">
          E-mail
        </label>
        <input
          id="login-email"
          className="auth-form__input"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
        />

        <label className="auth-form__label" htmlFor="login-password">
          Mot de passe
        </label>
        <input
          id="login-password"
          className="auth-form__input"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
        />

        {error ? (
          <p className="auth-form__error" role="alert">
            {error}
          </p>
        ) : null}

        <button className="auth-form__submit" type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Connexion…' : 'Se connecter'}
        </button>

        <p className="auth-form__switch">
          Pas encore de compte ?{' '}
          <button type="button" className="auth-form__link" onClick={onGoRegister}>
            Créer un compte
          </button>
        </p>
        <p className="auth-form__privacy">Vos données restent ici.</p>
      </form>
    </div>
  );
}
