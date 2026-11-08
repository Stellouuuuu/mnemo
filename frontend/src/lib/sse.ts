export interface SseEvent {
  event: string;
  data: string;
}

/**
 * Découpe un flux text/event-stream en événements. Les morceaux réseau peuvent couper
 * un événement n'importe où : le reste est gardé jusqu'à la ligne vide qui le termine.
 */
export function createSseParser(onEvent: (event: SseEvent) => void) {
  let buffer = '';

  function dispatch(block: string): void {
    let event = 'message';
    const data: string[] = [];

    for (const line of block.split('\n')) {
      if (line === '' || line.startsWith(':')) {
        continue;
      }
      const colon = line.indexOf(':');
      const field = colon === -1 ? line : line.slice(0, colon);
      const value = colon === -1 ? '' : line.slice(colon + 1).replace(/^ /, '');
      if (field === 'event') {
        event = value;
      } else if (field === 'data') {
        data.push(value);
      }
    }

    if (data.length > 0) {
      onEvent({ event, data: data.join('\n') });
    }
  }

  return {
    push(chunk: string): void {
      buffer += chunk.replace(/\r\n/g, '\n');
      let boundary = buffer.indexOf('\n\n');
      while (boundary !== -1) {
        dispatch(buffer.slice(0, boundary));
        buffer = buffer.slice(boundary + 2);
        boundary = buffer.indexOf('\n\n');
      }
    },
  };
}
