export interface TextSegment {
  page: number | null;
  text: string;
}

export interface TextChunk {
  page: number | null;
  content: string;
}

export interface ChunkOptions {
  /** Taille cible d'un passage, en caractères. */
  size?: number;
  /** Caractères repris à la fin du passage précédent, pour ne pas couper une idée en deux. */
  overlap?: number;
}

const DEFAULT_SIZE = 900;
const DEFAULT_OVERLAP = 120;

function normalizeWhitespace(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Coupe un paragraphe trop long sur les fins de phrase, puis sur les espaces en dernier recours. */
function splitLongParagraph(paragraph: string, size: number): string[] {
  if (paragraph.length <= size) {
    return [paragraph];
  }

  const sentences = paragraph.match(/[^.!?\n]+(?:[.!?]+|\n|$)\s*/g) ?? [paragraph];
  const pieces: string[] = [];
  let current = '';

  const push = (piece: string) => {
    if (piece.trim() !== '') {
      pieces.push(piece.trim());
    }
  };

  for (const sentence of sentences) {
    if (sentence.length > size) {
      push(current);
      current = '';
      for (let start = 0; start < sentence.length; start += size) {
        push(sentence.slice(start, start + size));
      }
      continue;
    }
    if (current.length + sentence.length > size) {
      push(current);
      current = sentence;
    } else {
      current += sentence;
    }
  }
  push(current);
  return pieces;
}

/**
 * Découpe des segments (une page de PDF, un fichier texte) en passages de taille voisine,
 * en respectant les paragraphes. Chaque passage garde le numéro de page de son segment.
 */
export function chunkSegments(
  segments: TextSegment[],
  options: ChunkOptions = {},
): TextChunk[] {
  const size = Math.max(100, options.size ?? DEFAULT_SIZE);
  const overlap = Math.min(Math.max(0, options.overlap ?? DEFAULT_OVERLAP), Math.floor(size / 2));
  const chunks: TextChunk[] = [];

  for (const segment of segments) {
    const text = normalizeWhitespace(segment.text);
    if (text === '') {
      continue;
    }

    const paragraphs = text
      .split(/\n{2,}/)
      .flatMap((paragraph) => splitLongParagraph(paragraph.trim(), size))
      .filter((paragraph) => paragraph !== '');

    let current = '';
    const flush = () => {
      if (current.trim() !== '') {
        chunks.push({ page: segment.page, content: current.trim() });
      }
    };

    for (const paragraph of paragraphs) {
      if (current !== '' && current.length + paragraph.length + 2 > size) {
        const tail = overlap > 0 ? current.slice(-overlap).replace(/^\S*\s/, '') : '';
        flush();
        current = tail === '' ? paragraph : `${tail} ${paragraph}`;
      } else {
        current = current === '' ? paragraph : `${current}\n\n${paragraph}`;
      }
    }
    flush();
  }

  return chunks;
}
