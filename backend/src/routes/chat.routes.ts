import { Router } from 'express';
import { parseChatUserContent } from '../chat/parse-messages.js';
import { ConversationNotFoundError } from '../conversations/index.js';
import {
  ConversationBusyError,
  httpErrorFromUnknown,
  toPublicErrorBody,
} from '../errors.js';
import { FetchAbortedError } from '../http/fetch-with-timeout.js';
import type { ConversationService } from '../services/conversation.service.js';

function parseOptionalConversationId(raw: unknown):
  | { ok: true; conversationId?: string }
  | { ok: false; error: string } {
  if (raw === undefined || raw === null || raw === '') {
    return { ok: true, conversationId: undefined };
  }

  if (typeof raw !== 'string') {
    return {
      ok: false,
      error: 'Le champ "conversationId" doit être une chaîne de caractères.',
    };
  }

  if (raw.trim() === '') {
    return { ok: true, conversationId: undefined };
  }

  return { ok: true, conversationId: raw.trim() };
}

export function createChatRouter(conversationService: ConversationService): Router {
  const chatRouter = Router();

  chatRouter.post('/', async (req, res) => {
    const userId = req.userId;
    if (!userId) {
      res.status(401).json({ error: 'Authentification requise.' });
      return;
    }

    const body = req.body as {
      content?: unknown;
      conversationId?: unknown;
      messages?: unknown;
    };

    if (body.messages !== undefined) {
      res.status(400).json({
        error:
          'Le champ "messages" n\'est plus accepté. Envoyez uniquement "content".',
      });
      return;
    }

    const parsedConversationId = parseOptionalConversationId(body.conversationId);
    if (!parsedConversationId.ok) {
      res.status(400).json({ error: parsedConversationId.error });
      return;
    }

    const parsedContent = parseChatUserContent(body.content);
    if (!parsedContent.ok) {
      res.status(400).json({ error: parsedContent.error });
      return;
    }

    const abortController = new AbortController();
    const onClose = () => {
      if (!res.writableEnded) {
        abortController.abort();
      }
    };
    req.on('close', onClose);

    try {
      const result = await conversationService.chat({
        userId,
        content: parsedContent.content,
        conversationId: parsedConversationId.conversationId,
        signal: abortController.signal,
      });

      res.json({
        conversationId: result.conversationId,
        messages: result.messages,
        response: result.response,
      });
    } catch (error) {
      if (error instanceof FetchAbortedError || abortController.signal.aborted) {
        return;
      }

      if (error instanceof ConversationNotFoundError) {
        res.status(404).json({ error: error.message });
        return;
      }

      if (error instanceof ConversationBusyError) {
        res.status(409).json({ error: error.message });
        return;
      }

      const mapped = httpErrorFromUnknown(error);
      res.status(mapped.status).json(toPublicErrorBody(mapped));
    } finally {
      req.removeListener('close', onClose);
    }
  });

  return chatRouter;
}
