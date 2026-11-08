import { describe, expect, it } from 'vitest';
import { statusLabel, summarize, tookEffect, type AuditItem } from './audit';

const item = (status: string): AuditItem => ({ id: status, tool: 't', status, detail: null, createdAt: '' });

describe('journal des actions', () => {
  it('nomme les statuts connus et garde les autres', () => {
    expect(statusLabel('rejected')).toBe('Refusé par le serveur');
    expect(statusLabel('autre')).toBe('autre');
  });

  it('distingue ce qui a eu un effet de ce qui a été bloqué', () => {
    expect(tookEffect('executed')).toBe(true);
    expect(tookEffect('confirmed')).toBe(true);
    expect(tookEffect('rejected')).toBe(false);
    expect(tookEffect('confirmation_requested')).toBe(false);
  });

  it('compte exécuté, bloqué et en attente', () => {
    expect(summarize(['executed', 'confirmed', 'rejected', 'denied', 'expired', 'confirmation_requested', 'error'].map(item))).toEqual({
      executed: 2,
      blocked: 3,
      waiting: 1,
    });
  });
});
