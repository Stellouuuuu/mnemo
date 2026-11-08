import { Router } from 'express';
import type { Response } from 'express';
import type { ConversationService } from '../conversations/conversation.service.js';
import { httpErrorFromUnknown, toPublicErrorBody } from '../errors.js';
import type { AuditStore } from '../tools/audit-store.js';
import type { ToolRuntime } from '../tools/runtime.js';
import type { PendingAction } from '../tools/types.js';

function toDto(action: PendingAction) {
  return {
    id: action.id,
    tool: action.tool,
    summary: action.summary,
    conversationId: action.conversationId,
    expiresAt: action.expiresAt.toISOString(),
  };
}

function sendFailure(res: Response, error: unknown, fallback: string): void {
  const mapped = httpErrorFromUnknown(error);
  res.status(mapped.status).json(toPublicErrorBody({ ...mapped, error: fallback }));
}

/**
 * Actions sensibles demandées par le modèle. Elles attendent ici : seul l'utilisateur
 * connecté, depuis sa session, peut les autoriser ou les refuser.
 */
export function createActionsRouter(
  runtime: ToolRuntime,
  history: ConversationService,
  audit: AuditStore,
): Router {
  const router = Router();

  router.get('/', (req, res) => {
    const userId = req.userId;
    if (!userId) {
      res.status(401).json({ error: 'Authentification requise.' });
      return;
    }
    res.json({ actions: runtime.listPending(userId).map(toDto) });
  });

  router.get('/history', async (req, res) => {
    const userId = req.userId;
    if (!userId) {
      res.status(401).json({ error: 'Authentification requise.' });
      return;
    }
    try {
      const entries = await audit.listByUser(userId, 50);
      res.json({
        entries: entries.map((e) => ({
          id: e.id,
          tool: e.tool,
          status: e.status,
          detail: e.detail,
          createdAt: e.createdAt.toISOString(),
        })),
      });
    } catch (error) {
      sendFailure(res, error, "Échec de la lecture du journal.");
    }
  });

  router.post('/:id/confirm', async (req, res) => {
    const userId = req.userId;
    if (!userId) {
      res.status(401).json({ error: 'Authentification requise.' });
      return;
    }
    try {
      const result = await runtime.confirm(userId, req.params.id ?? '');
      if (!result.ok) {
        if (result.reason === 'failed') {
          res.status(500).json({ error: "L'action a échoué." });
        } else {
          res.status(result.reason === 'expired' ? 410 : 404).json({
            error:
              result.reason === 'expired'
                ? "Cette demande a expiré : redemandez l'action."
                : 'Action introuvable.',
          });
        }
        return;
      }
      const message = `C'est fait : ${result.output}`;
      await history.appendMessage({
        conversationId: result.conversationId,
        role: 'assistant',
        content: message,
      });
      res.json({ conversationId: result.conversationId, message });
    } catch (error) {
      sendFailure(res, error, "Échec de l'exécution de l'action.");
    }
  });

  router.post('/:id/deny', async (req, res) => {
    const userId = req.userId;
    if (!userId) {
      res.status(401).json({ error: 'Authentification requise.' });
      return;
    }
    try {
      const denied = await runtime.deny(userId, req.params.id ?? '');
      if (!denied) {
        res.status(404).json({ error: 'Action introuvable.' });
        return;
      }
      res.status(204).send();
    } catch (error) {
      sendFailure(res, error, "Échec du refus de l'action.");
    }
  });

  return router;
}
