import { describe, expect, it } from 'vitest';
import { formatBytes, mimeTypeForFile, uploadProblem } from './documents';

describe('mimeTypeForFile', () => {
  it('utilise le type du navigateur, sinon l\'extension', () => {
    expect(mimeTypeForFile({ name: 'a.pdf', type: 'application/pdf' })).toBe('application/pdf');
    expect(mimeTypeForFile({ name: 'notes.md', type: '' })).toBe('text/markdown');
    expect(mimeTypeForFile({ name: 'NOTES.TXT', type: '' })).toBe('text/plain');
  });

  it('refuse ce qui n\'est pas pris en charge', () => {
    expect(mimeTypeForFile({ name: 'photo.png', type: 'image/png' })).toBeNull();
    expect(mimeTypeForFile({ name: 'archive', type: '' })).toBeNull();
  });
});

describe('uploadProblem', () => {
  it('accepte un fichier valide et décrit chaque refus', () => {
    expect(uploadProblem({ name: 'a.pdf', type: 'application/pdf', size: 1000 })).toBeNull();
    expect(uploadProblem({ name: 'a.exe', type: '', size: 10 })).toMatch(/Format/);
    expect(uploadProblem({ name: 'a.txt', type: 'text/plain', size: 0 })).toMatch(/vide/);
    expect(uploadProblem({ name: 'a.txt', type: 'text/plain', size: 9 * 1024 * 1024 })).toMatch(/8 Mo/);
  });
});

describe('formatBytes', () => {
  it('choisit l\'unité lisible', () => {
    expect(formatBytes(500)).toBe('500 o');
    expect(formatBytes(2048)).toBe('2 Ko');
    expect(formatBytes(1_572_864)).toBe('1,5 Mo');
  });
});
