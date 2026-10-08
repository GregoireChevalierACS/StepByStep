import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { unwrap } from '../testing/unwrap';
import { DailyGoal } from './DailyGoal';
import { StepCount } from './StepCount';

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

  describe('progression en %', () => {
    const goal = unwrap(DailyGoal.create(10_000));
    const steps = (value: number) => unwrap(StepCount.create(value));

    it.each([
      [0, 0],
      [5_000, 50],
      [9_999, 99],
      [10_000, 100],
      [12_500, 125],
    ])('%s pas donnent %s %% sans plafond, arrondi à l’inférieur', (walked, percent) => {
      expect(goal.progressPercent(steps(walked))).toBe(percent);
    });

    it.each([
      [9_999, 99],
      [10_000, 100],
      [12_500, 100],
    ])('%s pas donnent %s %% avec un plafond à 100 %%', (walked, percent) => {
      expect(goal.cappedProgressPercent(steps(walked))).toBe(percent);
    });

    it('atteint 100 % plafonné si et seulement si l’objectif est atteint', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 100_000 }),
          fc.nat({ max: 200_000 }),
          (target, walked) => {
            const percent = unwrap(DailyGoal.create(target)).cappedProgressPercent(steps(walked));

            expect(percent >= 0 && percent <= 100).toBe(true);
            expect(percent === 100).toBe(walked >= target);
          },
        ),
      );
    });
  });
});
