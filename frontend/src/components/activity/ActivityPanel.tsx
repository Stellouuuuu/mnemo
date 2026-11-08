import { useCallback, useEffect, useRef, useState } from 'react';
import { statusLabel, summarize, tookEffect, type AuditItem } from '../../lib/audit';
import { toolLabel } from '../../lib/tools';
import { ApiError, listActionHistory } from '../../services/api';

interface ActivityPanelProps {
  onClose: () => void;
  onAuthFailure: (error: unknown) => boolean;
}

export function ActivityPanel({ onClose, onAuthFailure }: ActivityPanelProps) {
  const [items, setItems] = useState<AuditItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  const fail = useCallback(
    (err: unknown) => {
      if (!onAuthFailure(err)) {
        setError(err instanceof ApiError ? err.message : 'Une erreur inattendue est survenue.');
      }
    },
    [onAuthFailure],
  );

  useEffect(() => {
    let cancelled = false;
    listActionHistory()
      .then((entries) => {
        if (!cancelled) {
          setItems(entries);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setItems([]);
          fail(err);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [fail]);

  useEffect(() => {
    closeRef.current?.focus();
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onClose();
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [onClose]);

  const totals = items ? summarize(items) : null;

  return (
    <div className="memory-overlay" onClick={onClose}>
      <section
        className="memory-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="activity-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="memory-panel__header">
          <div>
            <h2 id="activity-title" className="memory-panel__title">
              Journal des actions
            </h2>
            <p className="memory-panel__hint">
              Tout ce que Mnemo a demandé de faire avec ses outils, et ce que le serveur en a fait.
              {totals
                ? ` ${totals.executed} exécuté(s), ${totals.blocked} bloqué(s), ${totals.waiting} en attente.`
                : ''}
            </p>
          </div>
          <button ref={closeRef} type="button" className="memory-panel__close" aria-label="Fermer" onClick={onClose}>
            ×
          </button>
        </header>

        {error ? (
          <p className="memory-panel__error" role="alert">
            {error}
          </p>
        ) : null}

        {items === null ? (
          <p className="memory-panel__status" role="status">
            Chargement…
          </p>
        ) : items.length === 0 ? (
          <p className="memory-panel__status">Aucune action pour le moment.</p>
        ) : (
          <ul className="memory-list">
            {items.map((item) => (
              <li key={item.id} className="memory-item activity-item">
                <span className="memory-item__value">
                  {toolLabel(item.tool)}
                  <small className="documents-item__meta">
                    {new Date(item.createdAt).toLocaleString('fr-FR')}
                    {item.detail ? ` · ${item.detail}` : ''}
                  </small>
                </span>
                <span className={tookEffect(item.status) ? 'activity-status activity-status--done' : 'activity-status'}>
                  {statusLabel(item.status)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
