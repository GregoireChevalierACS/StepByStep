import { describe, expect, it } from 'vitest';
import { unwrap } from '../testing/unwrap';
import { DailyGoal } from './DailyGoal';

describe('DailyGoal', () => {
  it.each([1, 10_000])('accepte un objectif entier strictement positif : %s', (value) => {
    expect(unwrap(DailyGoal.create(value)).steps.value).toBe(value);
  });

  it.each([0, -1, 1.5, Number.NaN])('refuse un objectif invalide : %s', (value) => {
    expect(DailyGoal.create(value)).toEqual({
      ok: false,
      error: { kind: 'InvalidDailyGoal', value },
    });
  });
});
