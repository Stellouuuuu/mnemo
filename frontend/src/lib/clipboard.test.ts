import { afterEach, describe, expect, it, vi } from 'vitest';
import { copyTextToClipboard, shareOrCopyText } from './clipboard';

describe('copyTextToClipboard', () => {
  const originalClipboard = navigator.clipboard;

  afterEach(() => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: originalClipboard,
    });
  });

  it('copie via navigator.clipboard.writeText', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });

    await expect(copyTextToClipboard('hello')).resolves.toBe(true);
    expect(writeText).toHaveBeenCalledWith('hello');
  });

  it('retourne false si l’API Clipboard est absente', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: undefined,
    });

    await expect(copyTextToClipboard('hello')).resolves.toBe(false);
  });

  it('retourne false si writeText échoue', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: vi.fn().mockRejectedValue(new Error('denied')),
      },
    });

    await expect(copyTextToClipboard('hello')).resolves.toBe(false);
  });
});

describe('shareOrCopyText', () => {
  const originalClipboard = navigator.clipboard;
  const originalShare = navigator.share;

  afterEach(() => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: originalClipboard,
    });
    Object.defineProperty(navigator, 'share', {
      configurable: true,
      value: originalShare,
    });
  });

  it('utilise navigator.share quand il est disponible', async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'share', {
      configurable: true,
      value: share,
    });

    await expect(shareOrCopyText('bonjour')).resolves.toBe('shared');
    expect(share).toHaveBeenCalledWith({ text: 'bonjour' });
  });

  it('copie si share est absent', async () => {
    Object.defineProperty(navigator, 'share', {
      configurable: true,
      value: undefined,
    });
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });

    await expect(shareOrCopyText('bonjour')).resolves.toBe('copied');
    expect(writeText).toHaveBeenCalledWith('bonjour');
  });

  it('retourne false si l’utilisateur annule le partage', async () => {
    Object.defineProperty(navigator, 'share', {
      configurable: true,
      value: vi.fn().mockRejectedValue(Object.assign(new Error('x'), { name: 'AbortError' })),
    });

    await expect(shareOrCopyText('bonjour')).resolves.toBe(false);
  });
});
