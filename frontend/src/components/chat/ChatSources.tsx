import type { SourceRef } from '../../types/chat';

interface ChatSourcesProps {
  sources: SourceRef[];
}

/** Les passages de documents sur lesquels la réponse s'appuie, numérotés comme les [1], [2] du texte. */
export function ChatSources({ sources }: ChatSourcesProps) {
  return (
    <details className="chat-sources">
      <summary className="chat-sources__summary">
        Sources ({sources.length})
      </summary>
      <ol className="chat-sources__list">
        {sources.map((source, index) => (
          <li key={`${source.documentId}-${index}`} className="chat-sources__item">
            <span className="chat-sources__title">
              [{index + 1}] {source.title}
              {source.page ? `, page ${source.page}` : ''}
            </span>
            <span className="chat-sources__snippet">{source.snippet}</span>
          </li>
        ))}
      </ol>
    </details>
  );
}
