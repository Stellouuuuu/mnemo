import { describe, expect, it } from 'vitest';
import {
  isNearBottom,
  scrollBehaviorForMotion,
  shouldAutoScroll,
} from './chat-scroll';

describe('auto-scroll du chat', () => {
  it('détecte le bas de liste', () => {
    expect(
      isNearBottom({ scrollHeight: 1000, scrollTop: 920, clientHeight: 80 }),
    ).toBe(true);
  });

  it('détecte un utilisateur remonté dans l’historique', () => {
    expect(
      isNearBottom({ scrollHeight: 1000, scrollTop: 100, clientHeight: 80 }),
    ).toBe(false);
  });

  it('suit un nouveau message utilisateur même si on n’était pas collé', () => {
    expect(
      shouldAutoScroll({ stuckToBottom: false, lastMessageIsUser: true }),
    ).toBe(true);
  });

  it('ne force pas le scroll si l’utilisateur est remonté et que ce n’est pas son message', () => {
    expect(
      shouldAutoScroll({ stuckToBottom: false, lastMessageIsUser: false }),
    ).toBe(false);
  });

  it('suit si on est déjà en bas', () => {
    expect(
      shouldAutoScroll({ stuckToBottom: true, lastMessageIsUser: false }),
    ).toBe(true);
  });

  it('respecte prefers-reduced-motion', () => {
    expect(scrollBehaviorForMotion(true)).toBe('auto');
    expect(scrollBehaviorForMotion(false)).toBe('smooth');
  });
});
