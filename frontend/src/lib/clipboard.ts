export async function copyTextToClipboard(text: string): Promise<boolean> {
  try {
    if (typeof navigator === 'undefined' || !navigator.clipboard?.writeText) {
      return false;
    }

    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export async function shareOrCopyText(
  text: string,
): Promise<'shared' | 'copied' | false> {
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      await navigator.share({ text });
      return 'shared';
    }
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      return false;
    }
  }

  const copied = await copyTextToClipboard(text);
  return copied ? 'copied' : false;
}
