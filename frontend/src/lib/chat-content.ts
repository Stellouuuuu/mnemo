export type ChatContentBlock =
  | { type: 'paragraph'; text: string }
  | { type: 'list'; ordered: boolean; items: string[] }
  | { type: 'code'; language: string; code: string };

const UL_PATTERN = /^[-*]\s+(.*)$/;
const OL_PATTERN = /^\d+\.\s+(.*)$/;

function matchUnordered(line: string): string | null {
  const match = UL_PATTERN.exec(line);
  return match?.[1] !== undefined ? match[1] : null;
}

function matchOrdered(line: string): string | null {
  const match = OL_PATTERN.exec(line);
  return match?.[1] !== undefined ? match[1] : null;
}

function sanitizeLanguage(raw: string): string {
  return raw.trim().replace(/[^a-zA-Z0-9_+#.-]/g, '').slice(0, 24);
}

function parseTextSegment(text: string): ChatContentBlock[] {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const blocks: ChatContentBlock[] = [];
  let index = 0;

  while (index < lines.length) {
    if (lines[index]?.trim() === '') {
      index += 1;
      continue;
    }

    const unordered = matchUnordered(lines[index] ?? '');
    const ordered = matchOrdered(lines[index] ?? '');

    if (unordered !== null || ordered !== null) {
      const isOrdered = ordered !== null;
      const items: string[] = [];

      while (index < lines.length) {
        const item = isOrdered
          ? matchOrdered(lines[index] ?? '')
          : matchUnordered(lines[index] ?? '');
        if (item === null) {
          break;
        }
        items.push(item);
        index += 1;
      }

      blocks.push({ type: 'list', ordered: isOrdered, items });
      continue;
    }

    const paragraphLines: string[] = [];
    while (index < lines.length) {
      const line = lines[index] ?? '';
      if (line.trim() === '') {
        break;
      }
      if (matchUnordered(line) !== null || matchOrdered(line) !== null) {
        break;
      }
      paragraphLines.push(line);
      index += 1;
    }

    if (paragraphLines.length > 0) {
      blocks.push({ type: 'paragraph', text: paragraphLines.join('\n') });
    }
  }

  return blocks;
}

/** Découpe une réponse en paragraphes, listes simples et blocs de code. Pas de HTML. */
export function parseChatContent(content: string): ChatContentBlock[] {
  const source = content.replace(/\r\n/g, '\n');
  if (source.trim() === '') {
    return [];
  }

  const blocks: ChatContentBlock[] = [];
  let cursor = 0;
  const fencePattern = /```([^\n]*)\n?([\s\S]*?)```/g;

  for (const match of source.matchAll(fencePattern)) {
    const start = match.index ?? 0;
    if (start > cursor) {
      blocks.push(...parseTextSegment(source.slice(cursor, start)));
    }

    blocks.push({
      type: 'code',
      language: sanitizeLanguage(match[1] ?? ''),
      code: (match[2] ?? '').replace(/\n$/, ''),
    });
    cursor = start + match[0].length;
  }

  const rest = source.slice(cursor);
  const openFence = rest.indexOf('```');
  if (openFence !== -1) {
    if (openFence > 0) {
      blocks.push(...parseTextSegment(rest.slice(0, openFence)));
    }

    const after = rest.slice(openFence + 3);
    const newline = after.indexOf('\n');
    const language =
      newline === -1 ? sanitizeLanguage(after) : sanitizeLanguage(after.slice(0, newline));
    const code =
      newline === -1 ? '' : after.slice(newline + 1).replace(/\n$/, '');

    blocks.push({ type: 'code', language, code });
    return blocks;
  }

  if (rest.length > 0) {
    blocks.push(...parseTextSegment(rest));
  }

  return blocks;
}
