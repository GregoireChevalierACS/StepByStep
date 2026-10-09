import { describe, expect, it } from 'vitest';
import { activityHistory } from '../testing/activityHistory';
import { bestDayOfAtLeast, streakOfAtLeast } from './badgeRules';

describe('règles de badge', () => {
  describe('streakOfAtLeast', () => {
    it('est satisfaite quand la série atteint le seuil', () => {
      expect(streakOfAtLeast(3).isSatisfiedBy(activityHistory([10_000, 11_000, 12_000]))).toBe(
        true,
      );
    });

    it('n’est pas satisfaite quand la série est plus courte', () => {
      expect(streakOfAtLeast(3).isSatisfiedBy(activityHistory([2_000, 11_000, 12_000]))).toBe(
        false,
      );
    });

    it('n’est pas satisfaite sans aucune activité', () => {
      expect(streakOfAtLeast(1).isSatisfiedBy(activityHistory([]))).toBe(false);
    });
  });

  describe('bestDayOfAtLeast', () => {
    it.each([
      [[5_000, 20_000, 3_000], true],
      [[5_000, 19_999, 3_000], false],
      [[], false],
    ])('pour les journées %j, une journée à 20 000 pas ou plus : %s', (stepsPerDay, expected) => {
      expect(bestDayOfAtLeast(20_000).isSatisfiedBy(activityHistory(stepsPerDay))).toBe(expected);
    });
  });
});
