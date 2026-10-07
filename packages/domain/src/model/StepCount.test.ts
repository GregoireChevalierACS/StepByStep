import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { unwrap } from '../testing/unwrap';
import { StepCount } from './StepCount';

describe('StepCount', () => {
  it('refuse un nombre de pas négatif', () => {
    const result = StepCount.create(-1);

    expect(result).toEqual({ ok: false, error: { kind: 'NegativeStepCount', value: -1 } });
  });

  it.each([1.5, -0.5, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    'refuse une valeur non entière : %s',
    (value) => {
      const result = StepCount.create(value);

      expect(result).toEqual({ ok: false, error: { kind: 'NonIntegerStepCount', value } });
    },
  );

  it.each([0, 1, 12_345])('accepte un entier positif ou nul : %s', (value) => {
    const steps = unwrap(StepCount.create(value));

    expect(steps.value).toBe(value);
  });

  it('additionne deux comptes de pas sans modifier les originaux', () => {
    const morning = unwrap(StepCount.create(1200));
    const evening = unwrap(StepCount.create(300));

    const total = morning.add(evening);

    expect(total.value).toBe(1500);
    expect(morning.value).toBe(1200);
    expect(evening.value).toBe(300);
  });

  it('soustrait un compte de pas plus petit ou égal', () => {
    const total = unwrap(StepCount.create(1500));
    const morning = unwrap(StepCount.create(1200));

    expect(unwrap(total.subtract(morning)).value).toBe(300);
    expect(unwrap(total.subtract(total)).value).toBe(0);
  });

  describe('répartition au prorata de poids', () => {
    const values = (counts: readonly StepCount[]) => counts.map((count) => count.value);

    it('répartit proportionnellement aux poids', () => {
      expect(values(unwrap(StepCount.create(100)).split([1, 3]))).toEqual([25, 75]);
    });

    it('arrondit en cumulé pour conserver le total exact', () => {
      expect(values(unwrap(StepCount.create(100)).split([1, 1, 1]))).toEqual([33, 33, 34]);
    });

    it('donne tout au dernier poids quand tous les poids sont nuls', () => {
      expect(values(unwrap(StepCount.create(100)).split([0, 0]))).toEqual([0, 100]);
    });

    it('traite un poids négatif comme un poids nul', () => {
      expect(values(unwrap(StepCount.create(100)).split([-5, 1]))).toEqual([0, 100]);
    });

    it('conserve toujours le total, sans part négative, quels que soient les poids', () => {
      fc.assert(
        fc.property(
          fc.nat({ max: 1_000_000 }),
          fc.array(fc.nat({ max: 86_400_000 }), { minLength: 1, maxLength: 10 }),
          (total, weights) => {
            const parts = values(unwrap(StepCount.create(total)).split(weights));

            expect(parts).toHaveLength(weights.length);
            expect(parts.reduce((sum, part) => sum + part, 0)).toBe(total);
            expect(parts.every((part) => Number.isInteger(part) && part >= 0)).toBe(true);
          },
        ),
      );
    });
  });

  it('refuse une soustraction qui donnerait un nombre de pas négatif', () => {
    const morning = unwrap(StepCount.create(1200));
    const total = unwrap(StepCount.create(1500));

    expect(morning.subtract(total)).toEqual({
      ok: false,
      error: { kind: 'NegativeStepCount', value: -300 },
    });
  });
});
