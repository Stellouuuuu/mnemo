import { Router, type Response } from 'express';
import { parseChatUserContent } from '../chat/parse-messages.js';
import { ConversationNotFoundError } from '../conversations/index.js';
import {
  ConversationBusyError,
  httpErrorFromUnknown,
  toPublicErrorBody,
} from '../errors.js';
import { FetchAbortedError } from '../http/fetch-with-timeout.js';
import type { ConversationService } from '../services/conversation.service.js';
import type { PendingAction } from '../tools/types.js';

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

/**
 * Coupe la génération quand le client se déconnecte. On écoute la réponse : sur Node 22,
 * l'événement `close` de la requête part dès que son corps est lu, pas à la déconnexion.
 */
function abortOnDisconnect(res: Response, controller: AbortController): () => void {
  const onClose = () => {
    if (!res.writableFinished) {
      controller.abort();
    }
  };
  res.on('close', onClose);
  return () => {
    res.removeListener('close', onClose);
  };
}

function toActionDto(action: PendingAction) {
  return {
    id: action.id,
    tool: action.tool,
    summary: action.summary,
    conversationId: action.conversationId,
    expiresAt: action.expiresAt.toISOString(),
  };
}

function writeSse(res: Response, event: string, data: unknown): void {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
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
    const stopWatching = abortOnDisconnect(res, abortController);

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
        sources: result.sources,
        toolCalls: result.toolCalls,
        pendingActions: result.pendingActions.map(toActionDto),
        steps: result.steps,
        budgetExhausted: result.budgetExhausted,
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
      stopWatching();
    }
  });

  chatRouter.post('/stream', async (req, res) => {
    const userId = req.userId;
    if (!userId) {
      res.status(401).json({ error: 'Authentification requise.' });
      return;
    }

    const body = req.body as { content?: unknown; conversationId?: unknown };
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
    const stopWatching = abortOnDisconnect(res, abortController);

    let started = false;
    const start = () => {
      if (started) {
        return;
      }
      started = true;
      res.status(200);
      res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
      res.setHeader('Cache-Control', 'no-cache, no-transform');
      res.setHeader('X-Accel-Buffering', 'no');
      res.flushHeaders();
    };

    try {
      for await (const event of conversationService.chatStream({
        userId,
        content: parsedContent.content,
        conversationId: parsedConversationId.conversationId,
        signal: abortController.signal,
      })) {
        start();
        if (event.type === 'meta') {
          writeSse(res, 'meta', { conversationId: event.conversationId });
        } else if (event.type === 'sources') {
          writeSse(res, 'sources', { sources: event.sources });
        } else if (event.type === 'tool') {
          const { type: _type, ...step } = event;
          writeSse(res, 'tool', step);
        } else if (event.type === 'confirmation') {
          writeSse(res, 'confirmation', toActionDto(event.action));
        } else if (event.type === 'replace') {
          writeSse(res, 'replace', { text: event.text });
        } else if (event.type === 'delta') {
          writeSse(res, 'delta', { text: event.text });
        } else {
          writeSse(res, 'done', {
            ...event.result,
            pendingActions: event.result.pendingActions.map(toActionDto),
          });
        }
      }
      if (started) {
        res.end();
      }
    } catch (error) {
      if (error instanceof FetchAbortedError || abortController.signal.aborted) {
        if (started) {
          res.end();
        }
        return;
      }

      let status = 500;
      let payload: { error: string; detail?: string };
      if (error instanceof ConversationNotFoundError) {
        status = 404;
        payload = { error: error.message };
      } else if (error instanceof ConversationBusyError) {
        status = 409;
        payload = { error: error.message };
      } else {
        const mapped = httpErrorFromUnknown(error);
        status = mapped.status;
        payload = toPublicErrorBody(mapped);
      }

      if (started) {
        writeSse(res, 'error', payload);
        res.end();
      } else {
        res.status(status).json(payload);
      }
    } finally {
      stopWatching();
    }
  });

  return chatRouter;
}
