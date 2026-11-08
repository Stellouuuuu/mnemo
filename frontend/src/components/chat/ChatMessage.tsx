import type { ChatMessage as ChatMessageType } from '../../types/chat';
import { parseChatContent, type ChatContentBlock } from '../../lib/chat-content';
import { formatMessageClock } from '../../lib/conversations';
import { MnemoMark } from '../brand/MnemoMark';
import { ChatCodeBlock } from './ChatCodeBlock';
import { ChatMessageActions } from './ChatMessageActions';
import { ChatSources } from './ChatSources';

interface ChatMessageProps {
  message: ChatMessageType;
  showIdentity?: boolean;
  actionsDisabled?: boolean;
  canRegenerate?: boolean;
  onRegenerate?: () => void;
}

function ParagraphText({ text }: { text: string }) {
  const lines = text.split('\n');
  return (
    <p className="chat-prose__p">
      {lines.map((line, index) => (
        <span key={index}>
          {index > 0 ? <br /> : null}
          {line}
        </span>
      ))}
    </p>
  );
}

function ContentBlocks({ blocks }: { blocks: ChatContentBlock[] }) {
  return (
    <div className="chat-prose">
      {blocks.map((block, index) => {
        if (block.type === 'paragraph') {
          return <ParagraphText key={index} text={block.text} />;
        }

        if (block.type === 'list') {
          const ListTag = block.ordered ? 'ol' : 'ul';
          return (
            <ListTag
              key={index}
              className={block.ordered ? 'chat-prose__ol' : 'chat-prose__ul'}
            >
              {block.items.map((item, itemIndex) => (
                <li key={itemIndex}>{item}</li>
              ))}
            </ListTag>
          );
        }

        return (
          <ChatCodeBlock
            key={index}
            code={block.code}
            language={block.language}
          />
        );
      })}
    </div>
  );
}

export function ChatMessage({
  message,
  showIdentity = true,
  actionsDisabled = false,
  canRegenerate = false,
  onRegenerate,
}: ChatMessageProps) {
  const isUser = message.role === 'user';
  const clock = formatMessageClock(message.createdAt);
  const blocks = isUser ? null : parseChatContent(message.content);

  return (
    <article
      className={`chat-message chat-message--${message.role}`}
      data-role={message.role}
    >
      {isUser ? (
        <>
          <p className="chat-message__content">{message.content}</p>
          {clock ? (
            <time className="chat-message__time" dateTime={message.createdAt}>
              {clock}
            </time>
          ) : null}
        </>
      ) : (
        <>
          {showIdentity ? (
            <div className="chat-message__identity">
              <MnemoMark size="sm" />
              <span className="chat-message__role">Mnemo</span>
              {clock ? (
                <time className="chat-message__time" dateTime={message.createdAt}>
                  {clock}
                </time>
              ) : null}
            </div>
          ) : clock ? (
            <time className="chat-message__time" dateTime={message.createdAt}>
              {clock}
            </time>
          ) : null}

          {blocks && blocks.length > 0 ? (
            <ContentBlocks blocks={blocks} />
          ) : (
            <p className="chat-message__content">{message.content}</p>
          )}

          {message.tools && message.tools.length > 0 ? (
            <p className="chat-tools">Outils utilisés : {message.tools.join(', ')}</p>
          ) : null}

          {message.sources && message.sources.length > 0 ? (
            <ChatSources sources={message.sources} />
          ) : null}

          <ChatMessageActions
            text={message.content}
            disabled={actionsDisabled}
            canRegenerate={canRegenerate}
            onRegenerate={onRegenerate}
          />
        </>
      )}
    </article>
  );
}
