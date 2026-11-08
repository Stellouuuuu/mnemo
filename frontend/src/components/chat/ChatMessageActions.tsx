import { useEffect, useId, useRef, useState } from 'react';
import { copyTextToClipboard, shareOrCopyText } from '../../lib/clipboard';
import {
  CheckIcon,
  CopyIcon,
  MoreIcon,
  RegenerateIcon,
  ShareIcon,
  ThumbsIcon,
} from './ChatIcons';

interface ChatMessageActionsProps {
  text: string;
  disabled?: boolean;
  canRegenerate?: boolean;
  onRegenerate?: () => void;
}

export function ChatMessageActions({
  text,
  disabled = false,
  canRegenerate = false,
  onRegenerate,
}: ChatMessageActionsProps) {
  const reactId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);
  const [shared, setShared] = useState(false);
  const [feedback, setFeedback] = useState<'up' | 'down' | null>(null);
  const [openMenu, setOpenMenu] = useState<'feedback' | 'more' | null>(null);

  useEffect(() => {
    if (!copied) {
      return;
    }
    const timer = window.setTimeout(() => setCopied(false), 1600);
    return () => window.clearTimeout(timer);
  }, [copied]);

  useEffect(() => {
    if (!shared) {
      return;
    }
    const timer = window.setTimeout(() => setShared(false), 1600);
    return () => window.clearTimeout(timer);
  }, [shared]);

  useEffect(() => {
    if (openMenu === null) {
      return;
    }

    function closeOnPointerDown(event: PointerEvent) {
      if (rootRef.current?.contains(event.target as Node)) {
        return;
      }
      setOpenMenu(null);
    }

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setOpenMenu(null);
      }
    }

    document.addEventListener('pointerdown', closeOnPointerDown);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnPointerDown);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [openMenu]);

  async function handleCopy() {
    const ok = await copyTextToClipboard(text);
    if (ok) {
      setCopied(true);
    }
    setOpenMenu(null);
  }

  async function handleShare() {
    const result = await shareOrCopyText(text);
    if (result) {
      setShared(true);
    }
    setOpenMenu(null);
  }

  function selectFeedback(value: 'up' | 'down') {
    setFeedback((current) => (current === value ? null : value));
    setOpenMenu(null);
  }

  const feedbackLabelId = `${reactId}-feedback`;
  const moreLabelId = `${reactId}-more`;

  return (
    <div className="chat-message__actions" ref={rootRef}>
      <button
        type="button"
        className="chat-action"
        aria-label={copied ? 'Copié' : 'Copier'}
        aria-live="polite"
        onClick={() => {
          void handleCopy();
        }}
      >
        {copied ? <CheckIcon /> : <CopyIcon />}
      </button>

      <button
        type="button"
        className={`chat-action${feedback ? ' chat-action--on' : ''}`}
        aria-label="Donner un avis"
        aria-haspopup="menu"
        aria-expanded={openMenu === 'feedback'}
        aria-controls={feedbackLabelId}
        onClick={() =>
          setOpenMenu((current) => (current === 'feedback' ? null : 'feedback'))
        }
      >
        <ThumbsIcon />
      </button>
      {openMenu === 'feedback' ? (
        <div id={feedbackLabelId} className="chat-action-popover" role="menu">
          <button
            type="button"
            className={`chat-action-popover__item${
              feedback === 'up' ? ' chat-action-popover__item--on' : ''
            }`}
            role="menuitem"
            onClick={() => selectFeedback('up')}
          >
            Utile
          </button>
          <button
            type="button"
            className={`chat-action-popover__item${
              feedback === 'down' ? ' chat-action-popover__item--on' : ''
            }`}
            role="menuitem"
            onClick={() => selectFeedback('down')}
          >
            Pas utile
          </button>
        </div>
      ) : null}

      <button
        type="button"
        className="chat-action"
        aria-label={shared ? 'Partagé' : 'Partager'}
        onClick={() => {
          void handleShare();
        }}
      >
        {shared ? <CheckIcon /> : <ShareIcon />}
      </button>

      <button
        type="button"
        className="chat-action"
        aria-label="Régénérer la réponse"
        disabled={disabled || !canRegenerate || !onRegenerate}
        onClick={onRegenerate}
      >
        <RegenerateIcon />
      </button>

      <button
        type="button"
        className="chat-action"
        aria-label="Plus d’actions"
        aria-haspopup="menu"
        aria-expanded={openMenu === 'more'}
        aria-controls={moreLabelId}
        onClick={() =>
          setOpenMenu((current) => (current === 'more' ? null : 'more'))
        }
      >
        <MoreIcon />
      </button>
      {openMenu === 'more' ? (
        <div id={moreLabelId} className="chat-action-popover" role="menu">
          <button
            type="button"
            className="chat-action-popover__item"
            role="menuitem"
            onClick={() => {
              void handleCopy();
            }}
          >
            Copier
          </button>
          <button
            type="button"
            className="chat-action-popover__item"
            role="menuitem"
            onClick={() => {
              void handleShare();
            }}
          >
            Partager
          </button>
        </div>
      ) : null}
    </div>
  );
}
