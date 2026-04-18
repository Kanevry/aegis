import { describe, expect, it } from 'vitest';
import { ATTACK_LIBRARY, getAttackById } from './attacks';

describe('ATTACK_LIBRARY', () => {
  it('contains exactly 10 attacks with unique ids', () => {
    expect(ATTACK_LIBRARY).toHaveLength(10);

    const ids = ATTACK_LIBRARY.map((attack) => attack.id);
    expect(new Set(ids).size).toBe(10);
  });

  it('exposes the expected attack definition fields', () => {
    for (const attack of ATTACK_LIBRARY) {
      expect(attack.id).toMatch(/^[a-z-]+-\d{3}$/);
      expect(attack.title).toBeTruthy();
      expect(attack.description).toBeTruthy();
      expect(attack.category).toBeTruthy();
      expect(attack.severity).toBeTruthy();
      expect(attack.prompt).toBeTruthy();
      expect(attack.expectedBlockedLayers.length).toBeGreaterThan(0);
    }
  });
});

describe('getAttackById', () => {
  it('returns the matching attack for a known id', () => {
    const attack = getAttackById('prompt-injection-001');
    expect(attack).toBeDefined();
    expect(attack?.title).toBe('System prompt override');
  });

  it('returns undefined for an unknown id', () => {
    expect(getAttackById('missing-attack')).toBeUndefined();
  });
});
