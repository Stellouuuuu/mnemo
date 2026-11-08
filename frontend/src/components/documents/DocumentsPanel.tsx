import { useCallback, useEffect, useRef, useState } from 'react';
import { formatBytes, uploadProblem } from '../../lib/documents';
import {
  ApiError,
  deleteDocument,
  listDocuments,
  uploadDocument,
} from '../../services/api';
import type { DocumentItem } from '../../types/documents';

interface DocumentsPanelProps {
  onClose: () => void;
  onAuthFailure: (error: unknown) => boolean;
}

function messageFrom(error: unknown): string {
  return error instanceof ApiError ? error.message : 'Une erreur inattendue est survenue.';
}

export function DocumentsPanel({ onClose, onAuthFailure }: DocumentsPanelProps) {
  const [items, setItems] = useState<DocumentItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

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
    listDocuments()
      .then((documents) => {
        if (!cancelled) {
          setItems(documents);
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

  async function handleFile(file: File | undefined) {
    if (!file) {
      return;
    }
    const problem = uploadProblem(file);
    if (problem) {
      setError(problem);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const created = await uploadDocument(file);
      setItems((current) => [created, ...(current ?? [])]);
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
      if (inputRef.current) {
        inputRef.current.value = '';
      }
    }
  }

  async function remove(item: DocumentItem) {
    if (!window.confirm(`Supprimer « ${item.title} » ? Mnemo ne pourra plus s'y appuyer.`)) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await deleteDocument(item.id);
      setItems((current) => (current ?? []).filter((d) => d.id !== item.id));
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
        aria-labelledby="documents-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="memory-panel__header">
          <div>
            <h2 id="documents-title" className="memory-panel__title">
              Vos documents
            </h2>
            <p className="memory-panel__hint">
              Mnemo s'appuie sur ces documents pour répondre et cite ses sources. Ils restent sur
              votre machine et ne sont visibles que de vous.
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

        <label className="documents-upload">
          <input
            ref={inputRef}
            type="file"
            accept=".pdf,.txt,.md,application/pdf,text/plain,text/markdown"
            disabled={busy}
            onChange={(event) => {
              void handleFile(event.target.files?.[0]);
            }}
          />
          <span>
            {busy ? 'Traitement en cours…' : 'Ajouter un document (PDF, .txt ou .md, 8 Mo max)'}
          </span>
        </label>

        {items === null ? (
          <p className="memory-panel__status" role="status">
            Chargement…
          </p>
        ) : items.length === 0 ? (
          <p className="memory-panel__status">
            Aucun document. Ajoutez un cours ou des notes, puis posez une question dessus.
          </p>
        ) : (
          <ul className="memory-list">
            {items.map((item) => (
              <li key={item.id} className="memory-item documents-item">
                <span className="memory-item__value">
                  {item.title}
                  <small className="documents-item__meta">
                    {formatBytes(item.sizeBytes)} · {item.chunkCount} passages
                  </small>
                  {item.flaggedCount ? (
                    <small className="documents-item__warning">
                      {item.flaggedCount} phrase(s) adressée(s) à une IA : Mnemo ne les voit jamais.
                    </small>
                  ) : null}
                </span>
                <span className="memory-item__actions">
                  <button type="button" disabled={busy} onClick={() => void remove(item)}>
                    Supprimer
                  </button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
