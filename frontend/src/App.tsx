import { useCallback, useEffect, useState } from 'react';
import { ChatPage } from './pages/ChatPage';
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';
import { resolveAuthBootFailure, retryAuthBootAction } from './lib/auth-boot';
import { getCurrentUser, logoutUser } from './services/api';
import type { AuthUser } from './types/auth';

type View = 'boot' | 'login' | 'register' | 'app' | 'unavailable';

function App() {
  const [view, setView] = useState<View>('boot');
  const [user, setUser] = useState<AuthUser | null>(null);
  const [bootError, setBootError] = useState<string | null>(null);
  const [bootKey, setBootKey] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function boot() {
      try {
        const me = await getCurrentUser();
        if (!cancelled) {
          setUser(me);
          setView('app');
        }
      } catch (err) {
        if (cancelled) {
          return;
        }

        const resolved = resolveAuthBootFailure(err);
        if (resolved.view === 'login') {
          setUser(null);
          setView('login');
          return;
        }

        setUser(null);
        setBootError(resolved.message);
        setView('unavailable');
      }
    }

    void boot();
    return () => {
      cancelled = true;
    };
  }, [bootKey]);

  const handleRetryBoot = useCallback(() => {
    const retry = retryAuthBootAction();
    setBootError(retry.bootError);
    setView(retry.view);
    setBootKey((key) => key + 1);
  }, []);

  const handleLogout = useCallback(() => {
    void (async () => {
      try {
        await logoutUser();
      } catch {
        // La session locale est quand même fermée.
      }
      setUser(null);
      setView('login');
    })();
  }, []);

  if (view === 'boot') {
    return (
      <p className="auth-boot" role="status" aria-live="polite">
        Chargement…
      </p>
    );
  }

  if (view === 'unavailable') {
    return (
      <div className="auth-page">
        <div className="auth-form">
          <p className="auth-form__error" role="alert">
            {bootError ?? 'Backend indisponible.'}
          </p>
          <button
            type="button"
            className="auth-form__submit"
            onClick={handleRetryBoot}
          >
            Réessayer
          </button>
        </div>
      </div>
    );
  }

  if (view === 'login') {
    return (
      <LoginPage
        onSuccess={(nextUser) => {
          setUser(nextUser);
          setView('app');
        }}
        onGoRegister={() => setView('register')}
      />
    );
  }

  if (view === 'register') {
    return (
      <RegisterPage
        onSuccess={(nextUser) => {
          setUser(nextUser);
          setView('app');
        }}
        onGoLogin={() => setView('login')}
      />
    );
  }

  return <ChatPage user={user} onLogout={handleLogout} />;
}

export default App;
