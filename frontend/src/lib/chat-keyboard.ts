export interface ChatKeyEvent {
  key: string;
  shiftKey: boolean;
  isComposing?: boolean;
  nativeEvent?: {
    isComposing?: boolean;
    keyCode?: number;
  };
}

function isComposingKey(event: ChatKeyEvent): boolean {
  return (
    event.isComposing === true ||
    event.nativeEvent?.isComposing === true ||
    event.nativeEvent?.keyCode === 229
  );
}

/** Enter sans Shift envoie le message. */
export function isChatSubmitKeyboardEvent(event: ChatKeyEvent): boolean {
  if (isComposingKey(event)) {
    return false;
  }

  return event.key === 'Enter' && !event.shiftKey;
}

/** Shift+Enter insère une nouvelle ligne (le navigateur gère le saut de ligne). */
export function isChatNewlineKeyboardEvent(event: ChatKeyEvent): boolean {
  if (isComposingKey(event)) {
    return false;
  }

  return event.key === 'Enter' && event.shiftKey;
}
