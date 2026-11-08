import path from 'node:path';
import { env } from '../config/env.js';

/** Une seule reconnaissance de texte à la fois : elle occupe tout un cœur du processeur. */
let queue: Promise<unknown> = Promise.resolve();

export interface PdfLike {
  numPages: number;
}

function languageDirectory(): string {
  const base = path.dirname(require.resolve('@tesseract.js-data/fra/package.json'));
  return path.join(base, '4.0.0_best_int');
}

/**
 * Lit le texte des pages d'un PDF scanné (des images, sans texte sélectionnable) avec Tesseract,
 * entièrement en local : la langue française est fournie par le paquet npm, rien n'est téléchargé.
 * Les pages sont rendues en image puis reconnues une par une. Une page illisible renvoie un texte vide.
 */
export function recognizePages(pdf: unknown, pageNumbers: number[]): Promise<Map<number, string>> {
  const run = async (): Promise<Map<number, string>> => {
    const results = new Map<number, string>();
    if (pageNumbers.length === 0) {
      return results;
    }

    const [{ renderPageAsImage }, { createWorker }] = await Promise.all([
      import('unpdf'),
      import('tesseract.js'),
    ]);
    const worker = await createWorker('fra', 1, { langPath: languageDirectory(), gzip: true });
    try {
      for (const page of pageNumbers) {
        try {
          const png = await renderPageAsImage(pdf as never, page, {
            canvasImport: () => import('@napi-rs/canvas'),
            scale: 2,
          });
          const { data } = await worker.recognize(Buffer.from(png as ArrayBuffer));
          results.set(page, data.text);
        } catch {
          results.set(page, '');
        }
      }
    } finally {
      await worker.terminate();
    }
    return results;
  };

  const next = queue.then(run, run);
  queue = next.catch(() => undefined);
  return next;
}

export function ocrEnabled(): boolean {
  return env.OCR_ENABLED;
}
