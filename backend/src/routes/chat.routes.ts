import { Router } from 'express';
import { chatWithOllama } from '../services/ollama.service.js';

const chatRouter = Router();

chatRouter.post('/', async (req, res) => {
  const { message } = req.body as { message?: unknown };

  if (message === undefined || message === null) {
    res.status(400).json({ error: 'Le champ "message" est obligatoire.' });
    return;
  }

  if (typeof message !== 'string') {
    res.status(400).json({ error: 'Le champ "message" doit être une chaîne de caractères.' });
    return;
  }

  if (message.trim() === '') {
    res.status(400).json({ error: 'Le champ "message" ne doit pas être vide.' });
    return;
  }

  try {
    const response = await chatWithOllama(message);
    res.json({
      message,
      response,
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'Erreur inconnue';
    res.status(502).json({
      error: 'Échec de la communication avec le modèle local.',
      detail,
    });
  }
});

export default chatRouter;
