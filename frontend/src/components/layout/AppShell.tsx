import { useEffect, type ReactNode } from 'react';

interface AppShellProps {
  title: string;
  subtitle?: string;
  sidebar?: ReactNode;
  sidebarOpen?: boolean;
  onSidebarClose?: () => void;
  headerActions?: ReactNode;
  headerEnd?: ReactNode;
  children: ReactNode;
}

export function AppShell({
  title,
  subtitle,
  sidebar,
  sidebarOpen = false,
  onSidebarClose,
  headerActions,
  headerEnd,
  children,
}: AppShellProps) {
  useEffect(() => {
    if (!sidebarOpen || !onSidebarClose) {
      return;
    }

    const close = onSidebarClose;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        close();
      }
    }

    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [sidebarOpen, onSidebarClose]);

  return (
    <div className="app-shell">
      <div
        className={`app-shell__nav${sidebarOpen ? ' app-shell__nav--open' : ''}`}
      >
        {onSidebarClose ? (
          <button
            type="button"
            className="app-shell__backdrop"
            aria-label="Fermer le menu"
            aria-hidden={!sidebarOpen}
            tabIndex={-1}
            onClick={onSidebarClose}
          />
        ) : null}
        {sidebar}
      </div>

      <div className="app-shell__content">
        <header className="app-shell__header">
          <div className="app-shell__header-row">
            {headerActions}
            <div className="app-shell__titles">
              {subtitle ? (
                <p className="app-shell__eyebrow">{subtitle}</p>
              ) : null}
              <h1 className="app-shell__title">{title}</h1>
            </div>
            {headerEnd ? (
              <div className="app-shell__header-end">{headerEnd}</div>
            ) : null}
          </div>
        </header>
        <main className="app-shell__main">{children}</main>
      </div>
    </div>
  );
}
