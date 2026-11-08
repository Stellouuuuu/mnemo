import { useCallback, useEffect, useRef, useState } from 'react';
import { AppShell } from '../components/layout/AppShell';
import { ChatWindow } from '../components/chat/ChatWindow';
import { ConversationSidebar } from '../components/conversations/ConversationSidebar';
import { DocumentsPanel } from '../components/documents/DocumentsPanel';
import { MemoryPanel } from '../components/memory/MemoryPanel';
import {
  conversationHeaderTitle,
  mapApiMessagesToChatMessages,
  mapDetailMessagesToChatMessages,
  pickMostRecentConversation,
} from '../lib/conversations';
import {
  appendOptimisticUserMessage,
  applyStreamDelta,
  canMutateConversations,
  dropStreamingMessage,
  findLastUserContent,
  findNewlyCreatedConversation,
  mergeSyncedMessagesAfterFailure,
  prepareMessagesForRegenerate,
  retainMessagesOnSendFailure,
} from '../lib/chat-send';
import {
  ApiError,
  deleteConversation,
  getConversation,
  listConversations,
  streamChatMessage,
} from '../services/api';
import type { AuthUser } from '../types/auth';
import type { ChatMessage, ConversationSummary, SourceRef } from '../types/chat';

function formatError(err: unknown): string {
  if (err instanceof ApiError) {
    return err.detail ? `${err.message} (${err.detail})` : err.message;
  }
  return 'Une erreur inattendue est survenue.';
}

interface ChatPageProps {
  user: AuthUser | null;
  onLogout: () => void;
}

export function ChatPage({ user, onLogout }: ChatPageProps) {
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isSending, setIsSending] = useState(false);
  const [isListLoading, setIsListLoading] = useState(true);
  const [isDetailLoading, setIsDetailLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isMemoryOpen, setIsMemoryOpen] = useState(false);
  const [isDocumentsOpen, setIsDocumentsOpen] = useState(false);
  const [restoreDraft, setRestoreDraft] = useState<string | null>(null);
  const [restoreKey, setRestoreKey] = useState(0);
  const isSendingRef = useRef(false);

  const handleAuthFailure = useCallback(
    (err: unknown) => {
      if (err instanceof ApiError && err.status === 401) {
        onLogout();
        return true;
      }
      return false;
    },
    [onLogout],
  );

  const restoreUserDraft = useCallback((content: string) => {
    setRestoreDraft(content);
    setRestoreKey((key) => key + 1);
  }, []);

  const closeSidebar = useCallback(() => {
    setIsSidebarOpen(false);
  }, []);

  const refreshConversations = useCallback(async (): Promise<ConversationSummary[]> => {
    const listed = await listConversations();
    setConversations(listed);
    setListError(null);
    return listed;
  }, []);

  const loadConversationDetail = useCallback(
    async (id: string) => {
      setIsDetailLoading(true);
      setError(null);
      try {
        const detail = await getConversation(id);
        setConversationId(detail.id);
        setMessages(mapDetailMessagesToChatMessages(detail.messages));
      } catch (err) {
        if (handleAuthFailure(err)) {
          return;
        }
        setError(formatError(err));
      } finally {
        setIsDetailLoading(false);
      }
    },
    [handleAuthFailure],
  );

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      setIsListLoading(true);
      setListError(null);

      try {
        const listed = await listConversations();
        if (cancelled) {
          return;
        }

        setConversations(listed);

        const mostRecent = pickMostRecentConversation(listed);
        if (!mostRecent) {
          setConversationId(null);
          setMessages([]);
          return;
        }

        setIsDetailLoading(true);
        const detail = await getConversation(mostRecent.id);
        if (cancelled) {
          return;
        }

        setConversationId(detail.id);
        setMessages(mapDetailMessagesToChatMessages(detail.messages));
      } catch (err) {
        if (cancelled) {
          return;
        }
        if (handleAuthFailure(err)) {
          return;
        }
        setListError(formatError(err));
      } finally {
        if (!cancelled) {
          setIsListLoading(false);
          setIsDetailLoading(false);
        }
      }
    }

    void bootstrap();

    return () => {
      cancelled = true;
    };
  }, [handleAuthFailure]);

  async function handleSelectConversation(id: string) {
    if (!canMutateConversations(isSending)) {
      return;
    }

    setIsSidebarOpen(false);
    if (id === conversationId && messages.length > 0) {
      return;
    }
    await loadConversationDetail(id);
  }

  function handleNewConversation() {
    if (!canMutateConversations(isSending)) {
      return;
    }

    setConversationId(null);
    setMessages([]);
    setError(null);
    setIsSidebarOpen(false);
  }

  async function handleDeleteConversation(id: string) {
    if (!canMutateConversations(isSending)) {
      return;
    }

    const confirmed = window.confirm(
      'Supprimer cette conversation ? Cette action est définitive.',
    );
    if (!confirmed) {
      return;
    }

    try {
      await deleteConversation(id);
      setConversations((current) =>
        current.filter((conversation) => conversation.id !== id),
      );

      if (conversationId === id) {
        setConversationId(null);
        setMessages([]);
        setError(null);
      }
    } catch (err) {
      if (handleAuthFailure(err)) {
        return;
      }
      setError(formatError(err));
    }
  }

  async function handleSend(content: string, options?: { regenerate?: boolean }) {
    if (isSendingRef.current || !canMutateConversations(isSending)) {
      return;
    }

    isSendingRef.current = true;
    const regenerate = options?.regenerate === true;
    const regenerateSnapshot = regenerate ? messages : null;
    const conversationAtSend = conversationId;
    const previousIds = conversations.map((conversation) => conversation.id);

    if (regenerate) {
      setMessages(prepareMessagesForRegenerate(messages));
    } else {
      setMessages((current) => appendOptimisticUserMessage(current, content));
    }
    setIsSending(true);
    setError(null);

    // Même identifiant que la bulle finale : elle ne se remonte pas à la fin du flux.
    let streamId = `stream-${Date.now()}`;
    let streamSources: SourceRef[] = [];

    try {
      const result = await streamChatMessage(content, conversationAtSend, {
        onMeta: (id) => {
          streamId = `${id}-${messages.length + 1}-assistant`;
        },
        onSources: (sources) => {
          streamSources = sources;
        },
        onDelta: (text) => {
          setMessages((current) =>
            applyStreamDelta(current, streamId, text, new Date().toISOString(), streamSources),
          );
        },
      });

      setConversationId(result.conversationId);
      setMessages((current) =>
        mapApiMessagesToChatMessages(
          result.messages,
          result.conversationId,
          current,
          result.sources ?? [],
        ),
      );
      await refreshConversations();
    } catch (err) {
      if (handleAuthFailure(err)) {
        return;
      }

      setError(formatError(err));
      setMessages((current) => dropStreamingMessage(current, streamId));

      if (regenerate && regenerateSnapshot) {
        setMessages(regenerateSnapshot);
        return;
      }

      restoreUserDraft(content);
      setMessages((current) => retainMessagesOnSendFailure(current));

      try {
        const listed = await refreshConversations();
        const idToSync =
          conversationAtSend ??
          findNewlyCreatedConversation(previousIds, listed)?.id ??
          null;

        if (idToSync) {
          const detail = await getConversation(idToSync);
          setConversationId(detail.id);
          const serverMessages = mapDetailMessagesToChatMessages(detail.messages);
          setMessages((current) =>
            mergeSyncedMessagesAfterFailure(current, serverMessages, content),
          );
        }
      } catch {
        // L’historique local (avec le message utilisateur) est conservé.
      }
    } finally {
      isSendingRef.current = false;
      setIsSending(false);
    }
  }

  return (
    <AppShell
      title={conversationHeaderTitle(conversationId, conversations)}
      subtitle="Assistante locale"
      sidebarOpen={isSidebarOpen}
      onSidebarClose={closeSidebar}
      headerActions={
        <button
          type="button"
          className="app-shell__menu-toggle"
          aria-label={
            isSidebarOpen ? 'Fermer les conversations' : 'Ouvrir les conversations'
          }
          aria-expanded={isSidebarOpen}
          aria-controls="conversation-sidebar"
          onClick={() => setIsSidebarOpen((open) => !open)}
        >
          ☰
        </button>
      }
      headerEnd={
        <>
          {user?.email ? (
            <span className="app-shell__user" title={user.email}>
              {user.email}
            </span>
          ) : null}
          <button
            type="button"
            className="app-shell__logout"
            onClick={() => setIsDocumentsOpen(true)}
          >
            Documents
          </button>
          <button
            type="button"
            className="app-shell__logout"
            onClick={() => setIsMemoryOpen(true)}
          >
            Mémoire
          </button>
          <button type="button" className="app-shell__logout" onClick={onLogout}>
            Déconnexion
          </button>
        </>
      }
      sidebar={
        <ConversationSidebar
          conversations={conversations}
          activeConversationId={conversationId}
          isLoading={isListLoading}
          error={listError}
          isOpen={isSidebarOpen}
          disabled={isSending}
          onClose={closeSidebar}
          onSelect={(id) => {
            void handleSelectConversation(id);
          }}
          onNewConversation={handleNewConversation}
          onDelete={(id) => {
            void handleDeleteConversation(id);
          }}
        />
      }
    >
      <ChatWindow
        messages={messages}
        isLoading={isSending || isDetailLoading}
        error={error}
        threadKey={conversationId ?? 'new'}
        restoreDraft={restoreDraft}
        restoreKey={restoreKey}
        statusMessage={
          isDetailLoading ? 'Chargement de la conversation…' : null
        }
        emptyMessage={
          conversationId === null
            ? 'Écrivez pour commencer. Vos données restent ici.'
            : 'Aucun message pour le moment.'
        }
        onSend={(message) => {
          void handleSend(message);
        }}
        onRegenerate={() => {
          const lastUser = findLastUserContent(messages);
          if (!lastUser) {
            return;
          }
          void handleSend(lastUser, { regenerate: true });
        }}
      />
      {isDocumentsOpen ? (
        <DocumentsPanel
          onClose={() => setIsDocumentsOpen(false)}
          onAuthFailure={handleAuthFailure}
        />
      ) : null}
      {isMemoryOpen ? (
        <MemoryPanel
          onClose={() => setIsMemoryOpen(false)}
          onAuthFailure={handleAuthFailure}
        />
      ) : null}
    </AppShell>
  );
}
