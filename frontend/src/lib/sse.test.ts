import { describe, expect, it } from 'vitest';
import { createSseParser, type SseEvent } from './sse';

function parse(chunks: string[]): SseEvent[] {
  const events: SseEvent[] = [];
  const parser = createSseParser((event) => events.push(event));
  chunks.forEach((chunk) => parser.push(chunk));
  return events;
}

describe('createSseParser', () => {
  it('lit des événements complets', () => {
    expect(parse(['event: delta\ndata: {"text":"Bon"}\n\n'])).toEqual([
      { event: 'delta', data: '{"text":"Bon"}' },
    ]);
  });

  it('reconstitue un événement coupé entre deux morceaux', () => {
    expect(parse(['event: del', 'ta\ndata: {"te', 'xt":"a"}\n', '\nevent: done\ndata: {}\n\n'])).toEqual([
      { event: 'delta', data: '{"text":"a"}' },
      { event: 'done', data: '{}' },
    ]);
  });

  it('accepte les fins de ligne CRLF', () => {
    expect(parse(['event: meta\r\ndata: {"a":1}\r\n\r\n'])).toEqual([
      { event: 'meta', data: '{"a":1}' },
    ]);
  });

  it('ignore les commentaires et garde un événement incomplet en attente', () => {
    expect(parse([': ping\n\n', 'event: delta\ndata: x'])).toEqual([]);
  });

  it('joint plusieurs lignes data', () => {
    expect(parse(['data: a\ndata: b\n\n'])).toEqual([{ event: 'message', data: 'a\nb' }]);
  });
});
