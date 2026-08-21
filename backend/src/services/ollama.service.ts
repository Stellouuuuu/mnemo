import { env } from '../config/env.js';

interface OllamaChatMessage {
  role: string;
  content: string;
}

interface OllamaChatResponse {
  message?: OllamaChatMessage;
  error?: string;
}

export async function chatWithOllama(userMessage: string): Promise<string> {
  const url = `${env.OLLAMA_BASE_URL}/api/chat`;

  let response: Response;

  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: env.OLLAMA_MODEL,
        messages: [
          {
            role: 'user',
            content: userMessage,
          },
        ],
        stream: false,
      }),
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'unknown error';
    throw new Error(`Impossible de contacter Ollama (${env.OLLAMA_BASE_URL}): ${detail}`);
  }

  let data: OllamaChatResponse;

  try {
    data = (await response.json()) as OllamaChatResponse;
  } catch {
    throw new Error(`Réponse Ollama invalide (HTTP ${response.status})`);
  }

  if (!response.ok) {
    const detail = data.error ?? response.statusText;
    throw new Error(`Erreur Ollama HTTP ${response.status}: ${detail}`);
  }

  const content = data.message?.content;

  if (typeof content !== 'string' || content.trim() === '') {
    throw new Error('Ollama a renvoyé une réponse vide ou invalide');
  }

  return content;
}
