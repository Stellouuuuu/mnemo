import { useLayoutEffect, useRef, useState } from 'react';
import type { ChatMessage as ChatMessageType } from '../../types/chat';
import {
  isNearBottom,
  scrollBehaviorForMotion,
  shouldAutoScroll,
} from '../../lib/chat-scroll';
import { ChatInput } from './ChatInput';
import { ChatMessage } from './ChatMessage';
import type { StepInfo } from '../../types/chat';
import { ChatSteps } from './ChatSteps';
import { ChatThinking } from './ChatThinking';

interface ChatWindowProps {
  messages: ChatMessageType[];
  isLoading?: boolean;
  /** Étapes de l'agent reçues pendant que la réponse se construit. */
  liveSteps?: StepInfo[];
  error?: string | null;
  emptyMessage?: string;
  statusMessage?: string | null;
  threadKey?: string;
  restoreDraft?: string | null;
  restoreKey?: number;
  onSend: (message: string) => void;
  onRegenerate?: () => void;
}

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return true;
  }

  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function ChatWindow({
  messages,
  isLoading = false,
  liveSteps = [],
  error = null,
  emptyMessage = 'Aucun message pour le moment.',
  statusMessage = null,
  threadKey,
  restoreDraft = null,
  restoreKey = 0,
  onSend,
  onRegenerate,
}: ChatWindowProps) {
  const answerStarted = messages[messages.length - 1]?.role === 'assistant';
  const showThinking = isLoading && statusMessage === null && !answerStarted;
  const listRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const stuckToBottomRef = useRef(true);
  const [showJumpToBottom, setShowJumpToBottom] = useState(false);
  const [jumpThreadKey, setJumpThreadKey] = useState(threadKey);

  if (threadKey !== jumpThreadKey) {
    setJumpThreadKey(threadKey);
    setShowJumpToBottom(false);
  }

  useLayoutEffect(() => {
    stuckToBottomRef.current = true;
  }, [threadKey]);

  useLayoutEffect(() => {
    const last = messages[messages.length - 1];
    const lastMessageIsUser = last?.role === 'user';
    if (
      !shouldAutoScroll({
        stuckToBottom: stuckToBottomRef.current,
        lastMessageIsUser: lastMessageIsUser === true,
      })
    ) {
      return;
    }

    stuckToBottomRef.current = true;
    setShowJumpToBottom(false);
    bottomRef.current?.scrollIntoView({
      behavior: scrollBehaviorForMotion(prefersReducedMotion()),
      block: 'end',
    });
  }, [messages, showThinking, statusMessage, threadKey]);

  function handleScroll() {
    const el = listRef.current;
    if (!el) {
      return;
    }

    const near = isNearBottom(el);
    stuckToBottomRef.current = near;
    setShowJumpToBottom(!near);
  }

  function jumpToBottom() {
    stuckToBottomRef.current = true;
    setShowJumpToBottom(false);
    bottomRef.current?.scrollIntoView({
      behavior: scrollBehaviorForMotion(prefersReducedMotion()),
      block: 'end',
    });
  }

  return (
    <section className="chat-window">
      <div className="chat-window__thread">
        <div
          className={`chat-window__messages${
            messages.length === 0 ? ' chat-window__messages--empty' : ''
          }`}
          ref={listRef}
          onScroll={handleScroll}
        >
          {messages.length === 0 && !showThinking && !statusMessage ? (
            <div className="chat-empty">
              <div className="mnemo-orb" aria-hidden="true" />
              <p className="chat-empty__title">Prête à vous écouter.</p>
              <p className="chat-window__empty">{emptyMessage}</p>
            </div>
          ) : (
            messages.map((message, index) => (
              <ChatMessage
                key={message.id}
                message={message}
                showIdentity={
                  message.role !== 'assistant' ||
                  messages[index - 1]?.role !== 'assistant'
                }
                actionsDisabled={isLoading}
                canRegenerate={
                  message.role === 'assistant' &&
                  index === messages.length - 1 &&
                  !isLoading
                }
                onRegenerate={onRegenerate}
              />
            ))
          )}

          {statusMessage ? (
            <p className="chat-window__status" role="status">
              {statusMessage}
            </p>
          ) : null}

          {isLoading && liveSteps.length > 0 ? <ChatSteps steps={liveSteps} live /> : null}
          {showThinking ? <ChatThinking /> : null}

          <div ref={bottomRef} />
        </div>

        {showJumpToBottom ? (
          <button
            type="button"
            className="chat-jump"
            aria-label="Revenir aux derniers messages"
            onClick={jumpToBottom}
          >
            ↓
          </button>
        ) : null}
      </div>

      <div className="chat-window__composer">
        {error ? (
          <div className="chat-window__error-row" role="alert">
            <p className="chat-window__error">{error}</p>
            {restoreDraft ? (
              <button
                type="button"
                className="chat-window__retry"
                aria-label="Renvoyer le message"
                onClick={() => onSend(restoreDraft)}
              >
                Renvoyer
              </button>
            ) : null}
          </div>
        ) : null}

        <ChatInput
          disabled={isLoading}
          restoreDraft={restoreDraft}
          restoreKey={restoreKey}
          onSend={onSend}
        />
      </div>
    </section>
  );
}
