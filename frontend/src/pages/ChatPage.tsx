import { useState } from 'react';
import { AppShell } from '../components/layout/AppShell';
import { ChatWindow } from '../components/chat/ChatWindow';
import { ApiError, sendChatMessage } from '../services/api';
import type { ChatMessage } from '../types/chat';

function createId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function ChatPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSend(content: string) {
    const userMessage: ChatMessage = {
      id: createId(),
      role: 'user',
      content,
    };

    setMessages((current) => [...current, userMessage]);
    setIsLoading(true);
    setError(null);

    try {
      const result = await sendChatMessage(content);

      const assistantMessage: ChatMessage = {
        id: createId(),
        role: 'assistant',
        content: result.response,
      };

      setMessages((current) => [...current, assistantMessage]);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.detail ? `${err.message} (${err.detail})` : err.message);
      } else {
        setError('Une erreur inattendue est survenue.');
      }
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <AppShell title="STELLA AI">
      <ChatWindow
        messages={messages}
        isLoading={isLoading}
        error={error}
        onSend={handleSend}
      />
    </AppShell>
  );
}
