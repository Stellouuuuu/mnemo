import { Router } from 'express';
import type { Response } from 'express';
import type { ConversationService } from '../conversations/conversation.service.js';
import { httpErrorFromUnknown, toPublicErrorBody } from '../errors.js';

function parseConversationIdParam(raw: string):
  | { ok: true; conversationId: string }
  | { ok: false; error: string } {
  if (raw.trim() === '') {
    return { ok: false, error: 'Le paramètre "id" est obligatoire.' };
  }

  return { ok: true, conversationId: raw.trim() };
}

function sendConversationError(
  res: Response,
  error: unknown,
  fallbackError: string,
): void {
  const mapped = httpErrorFromUnknown(error);
  res.status(mapped.status).json(
    toPublicErrorBody({
      ...mapped,
      error: mapped.status === 503 ? mapped.error : fallbackError,
    }),
  );
}

export function createConversationsRouter(
  conversationHistoryService: ConversationService,
): Router {
  const conversationsRouter = Router();

  conversationsRouter.get('/', async (req, res) => {
    const userId = req.userId;
    if (!userId) {
      res.status(401).json({ error: 'Authentification requise.' });
      return;
    }

    try {
      const conversations = await conversationHistoryService.listConversations(userId);

      res.json({
        conversations: conversations.map((conversation) => ({
          id: conversation.id,
          userId: conversation.userId,
          title: conversation.title,
          createdAt: conversation.createdAt.toISOString(),
          updatedAt: conversation.updatedAt.toISOString(),
        })),
      });
    } catch (error) {
      sendConversationError(
        res,
        error,
        'Échec de la récupération des conversations.',
      );
    }
  });

  conversationsRouter.get('/:id', async (req, res) => {
    const userId = req.userId;
    if (!userId) {
      res.status(401).json({ error: 'Authentification requise.' });
      return;
    }

    const parsedId = parseConversationIdParam(req.params.id ?? '');
    if (!parsedId.ok) {
      res.status(400).json({ error: parsedId.error });
      return;
    }

    try {
      const conversation = await conversationHistoryService.getConversationWithMessages(
        userId,
        parsedId.conversationId,
      );

      if (!conversation) {
        res.status(404).json({
          error: 'Conversation introuvable pour cet utilisateur.',
        });
        return;
      }

      res.json({
        id: conversation.id,
        userId: conversation.userId,
        title: conversation.title,
        createdAt: conversation.createdAt.toISOString(),
        updatedAt: conversation.updatedAt.toISOString(),
        messages: conversation.messages.map((message) => ({
          id: message.id,
          role: message.role,
          content: message.content,
          createdAt: message.createdAt.toISOString(),
        })),
      });
    } catch (error) {
      sendConversationError(
        res,
        error,
        'Échec de la récupération de la conversation.',
      );
    }
  });

  conversationsRouter.delete('/:id', async (req, res) => {
    const userId = req.userId;
    if (!userId) {
      res.status(401).json({ error: 'Authentification requise.' });
      return;
    }

    const parsedId = parseConversationIdParam(req.params.id ?? '');
    if (!parsedId.ok) {
      res.status(400).json({ error: parsedId.error });
      return;
    }

    try {
      const deleted = await conversationHistoryService.deleteConversation(
        userId,
        parsedId.conversationId,
      );

      if (!deleted) {
        res.status(404).json({
          error: 'Conversation introuvable pour cet utilisateur.',
        });
        return;
      }

      res.status(204).send();
    } catch (error) {
      sendConversationError(
        res,
        error,
        'Échec de la suppression de la conversation.',
      );
    }
  });

  return conversationsRouter;
}
