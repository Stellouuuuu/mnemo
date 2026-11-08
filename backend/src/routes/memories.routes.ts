import { Router } from 'express';
import type { Response } from 'express';
import { httpErrorFromUnknown, toPublicErrorBody } from '../errors.js';
import { normalizeMemoryCandidate } from '../memory/memory-schema.js';
import type { MemoryService } from '../memory/memory.service.js';
import type { Memory } from '../memory/types.js';

const MAX_VALUE_CHARS = 300;

function toDto(memory: Memory) {
  return {
    id: memory.id,
    key: memory.key,
    value: memory.value,
    createdAt: memory.createdAt.toISOString(),
    updatedAt: memory.updatedAt.toISOString(),
  };
}

function sendFailure(res: Response, error: unknown, fallback: string): void {
  const mapped = httpErrorFromUnknown(error);
  res.status(mapped.status).json(
    toPublicErrorBody({ ...mapped, error: mapped.status === 503 ? mapped.error : fallback }),
  );
}

/** Ce que Mnemo a retenu sur l'utilisateur connecté : lire, corriger, oublier. */
export function createMemoriesRouter(memoryService: MemoryService): Router {
  const router = Router();

  router.get('/', async (req, res) => {
    const userId = req.userId;
    if (!userId) {
      res.status(401).json({ error: 'Authentification requise.' });
      return;
    }

    try {
      const memories = await memoryService.listMemories(userId);
      res.json({ memories: memories.map(toDto) });
    } catch (error) {
      sendFailure(res, error, 'Échec de la récupération de la mémoire.');
    }
  });

  router.patch('/:id', async (req, res) => {
    const userId = req.userId;
    if (!userId) {
      res.status(401).json({ error: 'Authentification requise.' });
      return;
    }

    const value = (req.body as { value?: unknown } | undefined)?.value;
    if (typeof value !== 'string' || value.trim() === '') {
      res.status(400).json({ error: 'Le champ "value" est obligatoire.' });
      return;
    }
    if (value.length > MAX_VALUE_CHARS) {
      res.status(400).json({
        error: `La valeur dépasse ${MAX_VALUE_CHARS} caractères.`,
      });
      return;
    }

    try {
      const current = await memoryService.getMemory(userId, req.params.id ?? '');
      if (!current) {
        res.status(404).json({ error: 'Souvenir introuvable pour cet utilisateur.' });
        return;
      }

      const checked = normalizeMemoryCandidate(current.key, value);
      if (!checked) {
        res.status(400).json({ error: 'Cette valeur ne peut pas être retenue.' });
        return;
      }

      const updated = await memoryService.upsertMemory({
        userId,
        key: current.key,
        value: checked.value,
      });
      res.json({ memory: toDto(updated) });
    } catch (error) {
      sendFailure(res, error, 'Échec de la mise à jour du souvenir.');
    }
  });

  router.delete('/:id', async (req, res) => {
    const userId = req.userId;
    if (!userId) {
      res.status(401).json({ error: 'Authentification requise.' });
      return;
    }

    try {
      const deleted = await memoryService.deleteMemory(userId, req.params.id ?? '');
      if (!deleted) {
        res.status(404).json({ error: 'Souvenir introuvable pour cet utilisateur.' });
        return;
      }
      res.status(204).send();
    } catch (error) {
      sendFailure(res, error, 'Échec de la suppression du souvenir.');
    }
  });

  router.delete('/', async (req, res) => {
    const userId = req.userId;
    if (!userId) {
      res.status(401).json({ error: 'Authentification requise.' });
      return;
    }

    try {
      const deleted = await memoryService.clearMemories(userId);
      res.json({ deleted });
    } catch (error) {
      sendFailure(res, error, 'Échec de l’effacement de la mémoire.');
    }
  });

  return router;
}
