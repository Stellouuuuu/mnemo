import type { PendingAction } from '../../types/chat';

interface PendingActionsProps {
  actions: PendingAction[];
  busy: boolean;
  onConfirm: (action: PendingAction) => void;
  onDeny: (action: PendingAction) => void;
}

/** Une action sensible que Mnemo a proposée : rien ne se passe sans le clic de l'utilisateur. */
export function PendingActions({ actions, busy, onConfirm, onDeny }: PendingActionsProps) {
  if (actions.length === 0) {
    return null;
  }

  return (
    <div className="pending-actions" role="region" aria-label="Actions en attente de votre accord">
      {actions.map((action) => (
        <div key={action.id} className="pending-actions__item">
          <p className="pending-actions__text">
            <strong>Mnemo demande votre accord</strong>
            <span>{action.summary}</span>
          </p>
          <span className="pending-actions__buttons">
            <button type="button" disabled={busy} onClick={() => onConfirm(action)}>
              Autoriser
            </button>
            <button type="button" disabled={busy} onClick={() => onDeny(action)}>
              Refuser
            </button>
          </span>
        </div>
      ))}
    </div>
  );
}
