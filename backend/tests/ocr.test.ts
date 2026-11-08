import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import { env } from '../src/config/env.js';
import { extractSegments, UnsupportedDocumentError } from '../src/knowledge/extract.js';
import { chunkSegments } from '../src/knowledge/chunking.js';

const SCANNED = fs.readFileSync(path.join(__dirname, 'fixtures', 'scanned-fr.pdf'));

describe('PDF scanné (reconnaissance de texte)', () => {
  it('lit le texte de pages qui ne sont que des images, avec leur numéro de page', async () => {
    const segments = await extractSegments(SCANNED, 'application/pdf');
    assert.deepEqual(segments.map((s) => s.page), [1, 2]);
    assert.match(segments[0]!.text, /protocole HTTP/i);
    assert.match(segments[0]!.text, /introuvable/i);
    assert.match(segments[1]!.text, /HttpOnly/i);
    assert.ok(chunkSegments(segments).length >= 2);
  });

  it('ne lit pas les images quand la reconnaissance est désactivée', async () => {
    const original = env.OCR_ENABLED;
    (env as { OCR_ENABLED: boolean }).OCR_ENABLED = false;
    try {
      const segments = await extractSegments(SCANNED, 'application/pdf');
      assert.ok(segments.every((s) => s.text.trim() === ''));
    } finally {
      (env as { OCR_ENABLED: boolean }).OCR_ENABLED = original;
    }
  });

  it('refuse un PDF scanné de trop de pages au lieu de monopoliser le processeur', async () => {
    const original = env.OCR_MAX_PAGES;
    (env as { OCR_MAX_PAGES: number }).OCR_MAX_PAGES = 1;
    try {
      await assert.rejects(
        () => extractSegments(SCANNED, 'application/pdf'),
        (error: unknown) => error instanceof UnsupportedDocumentError && error.statusCode === 413,
      );
    } finally {
      (env as { OCR_MAX_PAGES: number }).OCR_MAX_PAGES = original;
    }
  });

  it('n’utilise pas la reconnaissance pour un PDF qui a déjà du texte', async () => {
    // Un PDF minimal avec du texte sélectionnable : aucune page vide, donc aucun OCR.
    const pdf = Buffer.from(
      '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n' +
        '3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 300 100]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj\n' +
        '4 0 obj<</Length 60>>stream\nBT /F1 14 Tf 10 50 Td (Bonjour ceci est un vrai texte) Tj ET\nendstream endobj\n' +
        '5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj\ntrailer<</Root 1 0 R/Size 6>>\n%%EOF',
    );
    const started = Date.now();
    const segments = await extractSegments(pdf, 'application/pdf');
    assert.match(segments[0]!.text, /vrai texte/);
    assert.ok(Date.now() - started < 1500, 'pas de reconnaissance de texte lancée');
  });
});
