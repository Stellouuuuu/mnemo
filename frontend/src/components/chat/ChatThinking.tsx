import { MnemoMark } from '../brand/MnemoMark';

export function ChatThinking() {
  return (
    <article
      className="chat-message chat-message--assistant chat-message--thinking"
      data-role="assistant"
      role="status"
      aria-live="polite"
      aria-label="Mnemo réfléchit"
    >
      <div className="chat-message__identity">
        <MnemoMark size="sm" />
        <span className="chat-message__role">Mnemo</span>
      </div>
      <p className="chat-thinking-line">
        réfléchit
        <span className="chat-thinking" aria-hidden="true">
          <span className="chat-thinking__dot" />
          <span className="chat-thinking__dot" />
          <span className="chat-thinking__dot" />
        </span>
      </p>
    </article>
  );
}
