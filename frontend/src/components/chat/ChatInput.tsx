import { useState, type FormEvent } from 'react';

interface ChatInputProps {
  disabled?: boolean;
  onSend: (message: string) => void;
}

export function ChatInput({ disabled = false, onSend }: ChatInputProps) {
  const [value, setValue] = useState('');

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmed = value.trim();
    if (!trimmed || disabled) {
      return;
    }

    onSend(trimmed);
    setValue('');
  }

  return (
    <form className="chat-input" onSubmit={handleSubmit}>
      <input
        className="chat-input__field"
        type="text"
        value={value}
        disabled={disabled}
        placeholder="Écrire un message…"
        aria-label="Message"
        onChange={(event) => setValue(event.target.value)}
      />
      <button
        className="chat-input__submit"
        type="submit"
        disabled={disabled || value.trim() === ''}
      >
        Envoyer
      </button>
    </form>
  );
}
