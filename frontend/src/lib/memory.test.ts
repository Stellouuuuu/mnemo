import { describe, expect, it } from 'vitest';
import type { MemoryItem } from '../types/memory';
import { canSaveMemoryEdit, memoryLabel, sortMemories } from './memory';

function item(key: string): MemoryItem {
  return { id: key, key, value: 'v', createdAt: '', updatedAt: '' };
}

describe('memoryLabel', () => {
  it('traduit les clés connues et garde les autres telles quelles', () => {
    expect(memoryLabel('user_name')).toBe('Prénom');
    expect(memoryLabel('field_of_study')).toBe('Études');
    expect(memoryLabel('autre')).toBe('autre');
  });
});

describe('sortMemories', () => {
  it('range par ordre d’importance, clés inconnues à la fin, sans modifier l’entrée', () => {
    const input = [item('goal'), item('zzz'), item('user_name'), item('aaa'), item('location')];
    expect(sortMemories(input).map((m) => m.key)).toEqual([
      'user_name',
      'location',
      'goal',
      'aaa',
      'zzz',
    ]);
    expect(input[0]?.key).toBe('goal');
  });
});

describe('canSaveMemoryEdit', () => {
  it('refuse le vide et l’identique, accepte un vrai changement', () => {
    expect(canSaveMemoryEdit('Sarah', '   ')).toBe(false);
    expect(canSaveMemoryEdit('Sarah', ' Sarah ')).toBe(false);
    expect(canSaveMemoryEdit('Sarah', 'Julie')).toBe(true);
  });
});
