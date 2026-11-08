import {
  useLayoutEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from 'react';
import { isChatSubmitKeyboardEvent } from '../../lib/chat-keyboard';
import { CHAT_MAX_MESSAGE_CHARS } from '../../lib/limits';

const TEXTAREA_MAX_HEIGHT_PX = 152;

interface ChatInputProps {
  disabled?: boolean;
  restoreDraft?: string | null;
  restoreKey?: number;
  onSend: (message: string) => void;
}

export function ChatInput({
  disabled = false,
  restoreDraft = null,
  restoreKey = 0,
  onSend,
}: ChatInputProps) {
  const [value, setValue] = useState('');
  const [appliedRestoreKey, setAppliedRestoreKey] = useState(restoreKey);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  if (restoreKey !== appliedRestoreKey) {
    setAppliedRestoreKey(restoreKey);
    if (restoreDraft) {
      setValue(restoreDraft);
    }
  }

  useLayoutEffect(() => {
    const el = textareaRef.current;
    if (!el) {
      return;
    }

    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, TEXTAREA_MAX_HEIGHT_PX)}px`;
  }, [value]);

  function submitIfPossible() {
    const trimmed = value.trim();
    if (!trimmed || disabled) {
      return;
    }

    onSend(trimmed);
    setValue('');
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    submitIfPossible();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (!isChatSubmitKeyboardEvent(event)) {
      return;
    }

    event.preventDefault();
    submitIfPossible();
  }

  return (
    <form className="chat-input" onSubmit={handleSubmit}>
      <textarea
        id="chat-message-input"
        ref={textareaRef}
        className="chat-input__field"
        rows={1}
        value={value}
        disabled={disabled}
        placeholder="Parler à Mnemo…"
        aria-label="Message"
        maxLength={CHAT_MAX_MESSAGE_CHARS}
        enterKeyHint="send"
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={handleKeyDown}
      />
      <button
        className="chat-input__submit"
        type="submit"
        disabled={disabled || value.trim() === ''}
        aria-label="Envoyer"
      >
        <svg
          className="chat-input__submit-icon"
          viewBox="0 0 20 20"
          fill="none"
          aria-hidden="true"
        >
          <path
            d="M10 16.5V4.5M10 4.5 4.75 9.5M10 4.5 15.25 9.5"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
      {value.length >= 7200 ? (
        <span className="chat-input__count" aria-live="polite">
          {value.length} / {CHAT_MAX_MESSAGE_CHARS}
        </span>
      ) : null}
    </form>
  );
}
