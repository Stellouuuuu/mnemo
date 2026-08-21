import type { ChatMessage as ChatMessageType } from '../../types/chat';

interface ChatMessageProps {
  message: ChatMessageType;
}

export function ChatMessage({ message }: ChatMessageProps) {
  return (
    <article
      className={`chat-message chat-message--${message.role}`}
      data-role={message.role}
    >
      <p className="chat-message__role">
        {message.role === 'user' ? 'Vous' : 'STELLA'}
      </p>
      <p className="chat-message__content">{message.content}</p>
    </article>
  );
}
