import { BADGES, StepCount } from '@stepbystep/domain';
import { describe, expect, it } from 'vitest';

// Garde-fou d'intégration : l'API importe le domaine par son nom de package
// (champ `exports`), jamais par un chemin vers ses fichiers internes.
describe('package @stepbystep/domain', () => {
  it('est importable par son nom et exécute les règles métier', () => {
    expect(StepCount.create(-1)).toEqual({
      ok: false,
      error: { kind: 'NegativeStepCount', value: -1 },
    });
    expect(BADGES.length).toBeGreaterThan(0);
  });
});
