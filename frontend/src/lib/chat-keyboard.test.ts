import { describe, expect, it } from 'vitest';
import {
  isChatNewlineKeyboardEvent,
  isChatSubmitKeyboardEvent,
} from './chat-keyboard';

describe('clavier du composer', () => {
  it('Enter sans Shift envoie', () => {
    expect(
      isChatSubmitKeyboardEvent({ key: 'Enter', shiftKey: false }),
    ).toBe(true);
  });

  it('Shift+Enter n’envoie pas (nouvelle ligne)', () => {
    expect(
      isChatSubmitKeyboardEvent({ key: 'Enter', shiftKey: true }),
    ).toBe(false);
    expect(
      isChatNewlineKeyboardEvent({ key: 'Enter', shiftKey: true }),
    ).toBe(true);
  });

  it('n’envoie pas pendant une composition IME', () => {
    expect(
      isChatSubmitKeyboardEvent({
        key: 'Enter',
        shiftKey: false,
        isComposing: true,
      }),
    ).toBe(false);
    expect(
      isChatSubmitKeyboardEvent({
        key: 'Enter',
        shiftKey: false,
        nativeEvent: { keyCode: 229 },
      }),
    ).toBe(false);
  });
});
