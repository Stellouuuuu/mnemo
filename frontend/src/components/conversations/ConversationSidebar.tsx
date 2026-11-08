import type { ConversationSummary } from '../../types/chat';
import { formatConversationUpdatedAt } from '../../lib/conversations';
import { StellaMark } from '../brand/StellaMark';

interface ConversationSidebarProps {
  conversations: ConversationSummary[];
  activeConversationId: string | null;
  isLoading?: boolean;
  error?: string | null;
  isOpen?: boolean;
  disabled?: boolean;
  onClose?: () => void;
  onSelect: (conversationId: string) => void;
  onNewConversation: () => void;
  onDelete: (conversationId: string) => void;
}

export function ConversationSidebar({
  conversations,
  activeConversationId,
  isLoading = false,
  error = null,
  isOpen = true,
  disabled = false,
  onClose,
  onSelect,
  onNewConversation,
  onDelete,
}: ConversationSidebarProps) {
  return (
    <aside
      id="conversation-sidebar"
      className={`conversation-sidebar${isOpen ? ' conversation-sidebar--open' : ''}`}
      aria-label="Conversations"
      aria-busy={disabled || undefined}
    >
      <div className="conversation-sidebar__toolbar">
        <div className="conversation-sidebar__brand">
          <StellaMark size="sm" />
          <div className="conversation-sidebar__brand-text">
            <p className="conversation-sidebar__wordmark">STELLA</p>
            <p className="conversation-sidebar__tag">Assistante locale</p>
          </div>
          {onClose ? (
            <button
              type="button"
              className="conversation-sidebar__close"
              onClick={onClose}
              aria-label="Fermer le menu"
            >
              ×
            </button>
          ) : null}
        </div>

        <button
          type="button"
          className="conversation-sidebar__new"
          onClick={onNewConversation}
          disabled={disabled}
        >
          <span className="conversation-sidebar__new-plus" aria-hidden="true">
            +
          </span>
          Nouvelle conversation
        </button>

        <p className="conversation-sidebar__section">Conversations</p>

        {isLoading ? (
          <p className="conversation-sidebar__status">Chargement…</p>
        ) : null}

        {error ? (
          <p className="conversation-sidebar__error" role="alert">
            {error}
          </p>
        ) : null}

        {!isLoading && conversations.length === 0 ? (
          <p className="conversation-sidebar__empty">
            Aucune conversation pour le moment.
          </p>
        ) : null}
      </div>

      <ul className="conversation-sidebar__list">
        {conversations.map((conversation) => {
          const isActive = conversation.id === activeConversationId;
          const title =
            conversation.title.trim() !== ''
              ? conversation.title
              : 'Conversation sans titre';

          return (
            <li key={conversation.id} className="conversation-sidebar__item">
              <button
                type="button"
                className={`conversation-sidebar__button${
                  isActive ? ' conversation-sidebar__button--active' : ''
                }`}
                onClick={() => onSelect(conversation.id)}
                aria-current={isActive ? 'true' : undefined}
                disabled={disabled}
              >
                <span className="conversation-sidebar__title">{title}</span>
                <span className="conversation-sidebar__meta">
                  {formatConversationUpdatedAt(conversation.updatedAt)}
                </span>
              </button>
              <button
                type="button"
                className="conversation-sidebar__delete"
                aria-label={`Supprimer ${title}`}
                disabled={disabled}
                onClick={(event) => {
                  event.stopPropagation();
                  onDelete(conversation.id);
                }}
              >
                ×
              </button>
            </li>
          );
        })}
      </ul>

      <p className="conversation-sidebar__local">
        Local · vos données restent ici
      </p>
    </aside>
  );
}
