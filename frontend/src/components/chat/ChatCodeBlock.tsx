import { ChatCopyButton } from './ChatCopyButton';

interface ChatCodeBlockProps {
  code: string;
  language?: string;
}

export function ChatCodeBlock({ code, language = '' }: ChatCodeBlockProps) {
  return (
    <div className="chat-code">
      <div className="chat-code__bar">
        {language ? (
          <span className="chat-code__lang">{language}</span>
        ) : (
          <span className="chat-code__lang">code</span>
        )}
        <ChatCopyButton text={code} className="chat-copy--code" />
      </div>
      <pre className="chat-code__pre">
        <code>{code}</code>
      </pre>
    </div>
  );
}
