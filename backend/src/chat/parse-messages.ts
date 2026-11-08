import { env } from '../config/env.js';
import {
  ALLOWED_CHAT_ROLES,
  type ChatMessage,
  type ChatRole,
} from '../types/chat.js';

function isChatRole(value: unknown): value is ChatRole {
  return (
    typeof value === 'string' &&
    (ALLOWED_CHAT_ROLES as readonly string[]).includes(value)
  );
}

export function parseChatUserContent(
  raw: unknown,
  maxContentChars = env.CHAT_MAX_MESSAGE_CHARS,
): { ok: true; content: string } | { ok: false; error: string } {
  if (raw === undefined || raw === null) {
    return { ok: false, error: 'Le champ "content" est obligatoire.' };
  }

  if (typeof raw !== 'string') {
    return {
      ok: false,
      error: 'Le champ "content" doit être une chaîne de caractères.',
    };
  }

  if (raw.trim() === '') {
    return { ok: false, error: 'Le champ "content" ne doit pas être vide.' };
  }

  if (raw.length > maxContentChars) {
    return {
      ok: false,
      error: `Le champ "content" dépasse la limite de ${maxContentChars} caractères.`,
    };
  }

  return { ok: true, content: raw };
}

export function parseChatMessages(
  raw: unknown,
  maxContentChars = env.CHAT_MAX_MESSAGE_CHARS,
  maxMessages = env.CHAT_MAX_BODY_MESSAGES,
): { ok: true; messages: ChatMessage[] } | { ok: false; error: string } {
  if (raw === undefined || raw === null) {
    return { ok: false, error: 'Le champ "messages" est obligatoire.' };
  }

  if (!Array.isArray(raw)) {
    return { ok: false, error: 'Le champ "messages" doit être un tableau.' };
  }

  if (raw.length === 0) {
    return { ok: false, error: 'Le tableau "messages" ne doit pas être vide.' };
  }

  if (raw.length > maxMessages) {
    return {
      ok: false,
      error: `Le tableau "messages" dépasse la limite de ${maxMessages} éléments.`,
    };
  }

  const messages: ChatMessage[] = [];

  for (let index = 0; index < raw.length; index += 1) {
    const item = raw[index];

    if (item === null || typeof item !== 'object' || Array.isArray(item)) {
      return {
        ok: false,
        error: `messages[${index}] doit être un objet { role, content }.`,
      };
    }

    const record = item as Record<string, unknown>;
    const { role, content } = record;

    if (!isChatRole(role)) {
      return {
        ok: false,
        error: `messages[${index}].role doit être "user" ou "assistant".`,
      };
    }

    if (typeof content !== 'string') {
      return {
        ok: false,
        error: `messages[${index}].content doit être une chaîne de caractères.`,
      };
    }

    if (content.trim() === '') {
      return {
        ok: false,
        error: `messages[${index}].content ne doit pas être vide.`,
      };
    }

    if (content.length > maxContentChars) {
      return {
        ok: false,
        error: `messages[${index}].content dépasse la limite de ${maxContentChars} caractères.`,
      };
    }

    messages.push({ role, content });
  }

  return { ok: true, messages };
}
