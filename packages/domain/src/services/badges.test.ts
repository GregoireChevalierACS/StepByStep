import { describe, expect, it } from 'vitest';
import { specification } from '../shared/Specification';
import { activityHistory } from '../testing/activityHistory';
import { type ActivityHistory } from './badgeRules';
import { unlockedBadges } from './badges';

const unlockedIds = (history: ActivityHistory) => unlockedBadges(history).map(({ id }) => id);
const days = (count: number, steps: number) => Array.from({ length: count }, () => steps);

describe('badges', () => {
  it('ne débloque aucun badge sans activité', () => {
    expect(unlockedIds(activityHistory([]))).toEqual([]);
  });

  it('débloque « Semaine parfaite » après 7 jours de série', () => {
    expect(unlockedIds(activityHistory(days(7, 10_000)))).toEqual(['perfect-week']);
  });

  it('débloque « Marathonien » avec 7 jours de série ET une journée à 20 000 pas', () => {
    expect(unlockedIds(activityHistory([...days(6, 10_000), 20_000]))).toEqual([
      'perfect-week',
      'marathoner',
    ]);
  });

  it('ne débloque pas « Marathonien » avec la journée à 20 000 pas mais seulement 6 jours de série', () => {
    expect(unlockedIds(activityHistory([...days(5, 10_000), 20_000]))).toEqual([]);
  });

  it('débloque « Exceptionnel » avec une journée à 30 000 pas, même sans série', () => {
    expect(unlockedIds(activityHistory([30_000]))).toEqual(['outstanding']);
  });

  it('débloque « Exceptionnel » avec 30 jours de série, même sans record', () => {
    expect(unlockedIds(activityHistory(days(30, 10_000)))).toEqual(['perfect-week', 'outstanding']);
  });

  it('évalue n’importe quel catalogue : ajouter un badge ne modifie pas le code existant', () => {
    const firstGoal = {
      id: 'first-goal',
      label: 'Premier objectif',
      description: 'Atteindre son objectif une première fois.',
      rule: specification((history: ActivityHistory) =>
        history.days.some((day) => day.isGoalReached()),
      ),
    };

    expect(unlockedBadges(activityHistory([10_000]), [firstGoal])).toEqual([firstGoal]);
    expect(unlockedBadges(activityHistory([2_000]), [firstGoal])).toEqual([]);
  });
});
