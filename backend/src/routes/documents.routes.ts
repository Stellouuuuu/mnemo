import express, { Router } from 'express';
import type { Response } from 'express';
import { httpErrorFromUnknown, toPublicErrorBody } from '../errors.js';
import {
  MAX_UPLOAD_BYTES,
  SUPPORTED_MIME_TYPES,
  UnsupportedDocumentError,
  type KnowledgeService,
} from '../knowledge/index.js';
import type { KnowledgeDocument } from '../knowledge/types.js';

function toDto(document: KnowledgeDocument) {
  return {
    id: document.id,
    title: document.title,
    mimeType: document.mimeType,
    sizeBytes: document.sizeBytes,
    chunkCount: document.chunkCount,
    flaggedCount: document.flaggedCount,
    createdAt: document.createdAt.toISOString(),
  };
}

function sendFailure(res: Response, error: unknown, fallback: string): void {
  if (error instanceof UnsupportedDocumentError) {
    res.status(error.statusCode).json({ error: error.message });
    return;
  }
  const mapped = httpErrorFromUnknown(error);
  res.status(mapped.status).json(
    toPublicErrorBody({ ...mapped, error: mapped.status === 503 ? mapped.error : fallback }),
  );
}

function readFilename(header: string | undefined): string | undefined {
  if (!header) {
    return undefined;
  }
  try {
    return decodeURIComponent(header);
  } catch {
    return header;
  }
}

/**
 * Documents de l'utilisateur connecté. Le fichier est envoyé tel quel dans le corps de la
 * requête (Content-Type du fichier, nom dans l'en-tête X-Filename).
 */
export function createDocumentsRouter(knowledge: KnowledgeService): Router {
  const router = Router();

  router.get('/', async (req, res) => {
    const userId = req.userId;
    if (!userId) {
      res.status(401).json({ error: 'Authentification requise.' });
      return;
    }
    try {
      const documents = await knowledge.listDocuments(userId);
      res.json({ documents: documents.map(toDto) });
    } catch (error) {
      sendFailure(res, error, 'Échec de la récupération des documents.');
    }
  });

  router.post(
    '/',
    express.raw({ type: [...SUPPORTED_MIME_TYPES], limit: MAX_UPLOAD_BYTES }),
    async (req, res) => {
      const userId = req.userId;
      if (!userId) {
        res.status(401).json({ error: 'Authentification requise.' });
        return;
      }

      try {
        const document = await knowledge.addDocument({
          userId,
          filename: readFilename(req.header('x-filename')),
          contentType: req.header('content-type'),
          data: Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0),
        });
        res.status(201).json({ document: toDto(document) });
      } catch (error) {
        sendFailure(res, error, "Échec de l'ajout du document.");
      }
    },
  );

  router.delete('/:id', async (req, res) => {
    const userId = req.userId;
    if (!userId) {
      res.status(401).json({ error: 'Authentification requise.' });
      return;
    }
    try {
      const deleted = await knowledge.deleteDocument(userId, req.params.id ?? '');
      if (!deleted) {
        res.status(404).json({ error: 'Document introuvable pour cet utilisateur.' });
        return;
      }
      res.status(204).send();
    } catch (error) {
      sendFailure(res, error, 'Échec de la suppression du document.');
    }
  });

  return router;
}
