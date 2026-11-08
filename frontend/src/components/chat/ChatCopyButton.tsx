import { useEffect, useState } from 'react';
import { copyTextToClipboard } from '../../lib/clipboard';
import { CheckIcon, CopyIcon } from './ChatIcons';

interface ChatCopyButtonProps {
  text: string;
  className?: string;
}

export function ChatCopyButton({ text, className = '' }: ChatCopyButtonProps) {
  const [copiedText, setCopiedText] = useState<string | null>(null);
  const copied = copiedText === text;

  useEffect(() => {
    if (copiedText === null) {
      return;
    }

    const timer = window.setTimeout(() => {
      setCopiedText(null);
    }, 1600);

    return () => {
      window.clearTimeout(timer);
    };
  }, [copiedText]);

  async function handleCopy() {
    const ok = await copyTextToClipboard(text);
    if (ok) {
      setCopiedText(text);
    }
  }

  return (
    <button
      type="button"
      className={`chat-action${className ? ` ${className}` : ''}`}
      onClick={() => {
        void handleCopy();
      }}
      aria-label={copied ? 'Copié' : 'Copier'}
      aria-live="polite"
    >
      {copied ? <CheckIcon /> : <CopyIcon />}
    </button>
  );
}
