import { useCallback, useEffect, useRef, useState } from 'react';
import { canSaveMemoryEdit, memoryLabel, sortMemories } from '../../lib/memory';
import {
  ApiError,
  clearMemories,
  deleteMemory,
  listMemories,
  updateMemory,
} from '../../services/api';
import type { MemoryItem } from '../../types/memory';

interface MemoryPanelProps {
  onClose: () => void;
  onAuthFailure: (error: unknown) => boolean;
}

function messageFrom(error: unknown): string {
  return error instanceof ApiError ? error.message : 'Une erreur inattendue est survenue.';
}

export function MemoryPanel({ onClose, onAuthFailure }: MemoryPanelProps) {
  const [items, setItems] = useState<MemoryItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);

  const fail = useCallback(
    (err: unknown) => {
      if (!onAuthFailure(err)) {
        setError(messageFrom(err));
      }
    },
    [onAuthFailure],
  );

  useEffect(() => {
    let cancelled = false;
    listMemories()
      .then((memories) => {
        if (!cancelled) {
          setItems(sortMemories(memories));
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

  async function save(item: MemoryItem) {
    setBusy(true);
    setError(null);
    try {
      const updated = await updateMemory(item.id, draft);
      setItems((current) =>
        sortMemories((current ?? []).map((m) => (m.id === updated.id ? updated : m))),
      );
      setEditingId(null);
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  }

  async function forget(item: MemoryItem) {
    if (!window.confirm(`Oublier « ${memoryLabel(item.key)} : ${item.value} » ?`)) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await deleteMemory(item.id);
      setItems((current) => (current ?? []).filter((m) => m.id !== item.id));
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  }

  async function forgetAll() {
    if (!window.confirm('Tout oublier ? Mnemo perdra ce qu’il sait de vous. Action définitive.')) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await clearMemories();
      setItems([]);
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="memory-overlay" onClick={onClose}>
      <section
        className="memory-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="memory-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="memory-panel__header">
          <div>
            <h2 id="memory-title" className="memory-panel__title">
              Ce que Mnemo sait de vous
            </h2>
            <p className="memory-panel__hint">
              Seules ces informations sont retenues entre les conversations. Corrigez-les ou
              effacez-les à tout moment.
            </p>
          </div>
          <button
            ref={closeRef}
            type="button"
            className="memory-panel__close"
            aria-label="Fermer"
            onClick={onClose}
          >
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
          <p className="memory-panel__status">
            Rien pour le moment. Dites par exemple « Je m’appelle Sarah » dans une conversation.
          </p>
        ) : (
          <ul className="memory-list">
            {items.map((item) => (
              <li key={item.id} className="memory-item">
                <span className="memory-item__label">{memoryLabel(item.key)}</span>
                {editingId === item.id ? (
                  <form
                    className="memory-item__edit"
                    onSubmit={(event) => {
                      event.preventDefault();
                      if (canSaveMemoryEdit(item.value, draft)) {
                        void save(item);
                      }
                    }}
                  >
                    <input
                      value={draft}
                      maxLength={300}
                      autoFocus
                      aria-label={`Nouvelle valeur pour ${memoryLabel(item.key)}`}
                      onChange={(event) => setDraft(event.target.value)}
                    />
                    <button
                      type="submit"
                      disabled={busy || !canSaveMemoryEdit(item.value, draft)}
                    >
                      Enregistrer
                    </button>
                    <button type="button" disabled={busy} onClick={() => setEditingId(null)}>
                      Annuler
                    </button>
                  </form>
                ) : (
                  <>
                    <span className="memory-item__value">{item.value}</span>
                    <span className="memory-item__actions">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => {
                          setEditingId(item.id);
                          setDraft(item.value);
                        }}
                      >
                        Modifier
                      </button>
                      <button type="button" disabled={busy} onClick={() => void forget(item)}>
                        Oublier
                      </button>
                    </span>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}

        {items && items.length > 0 ? (
          <footer className="memory-panel__footer">
            <button
              type="button"
              className="memory-panel__forget-all"
              disabled={busy}
              onClick={() => void forgetAll()}
            >
              Tout oublier
            </button>
          </footer>
        ) : null}
      </section>
    </div>
  );
}
