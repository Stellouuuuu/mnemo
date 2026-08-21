import type { ChatMessage as ChatMessageType } from '../../types/chat';
import { ChatInput } from './ChatInput';
import { ChatMessage } from './ChatMessage';

interface ChatWindowProps {
  messages: ChatMessageType[];
  isLoading?: boolean;
  error?: string | null;
  onSend: (message: string) => void;
}

export function ChatWindow({
  messages,
  isLoading = false,
  error = null,
  onSend,
}: ChatWindowProps) {
  return (
    <section className="chat-window">
      <div className="chat-window__messages" aria-live="polite">
        {messages.length === 0 ? (
          <p className="chat-window__empty">Aucun message pour le moment.</p>
        ) : (
          messages.map((message) => (
            <ChatMessage key={message.id} message={message} />
          ))
        )}
      </div>

      {error ? <p className="chat-window__error">{error}</p> : null}
      {isLoading ? <p className="chat-window__status">STELLA réfléchit…</p> : null}

      <ChatInput disabled={isLoading} onSend={onSend} />
    </section>
  );
}
