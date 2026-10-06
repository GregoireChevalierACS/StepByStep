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
});
