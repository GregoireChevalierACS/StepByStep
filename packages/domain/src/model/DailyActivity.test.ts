import { describe, expect, it } from 'vitest';
import { unwrap } from '../testing/unwrap';
import { DailyActivity } from './DailyActivity';
import { DailyGoal } from './DailyGoal';
import { LocalDate } from './LocalDate';
import { StepCount } from './StepCount';

const today = unwrap(LocalDate.create('2026-10-08'));
const goal = unwrap(DailyGoal.create(10_000));
const steps = (value: number) => unwrap(StepCount.create(value));

describe('DailyActivity', () => {
  it('démarre la journée à zéro pas, avec sa date et son objectif', () => {
    const activity = DailyActivity.start(today, goal);

    expect(activity.date).toBe(today);
    expect(activity.goal).toBe(goal);
    expect(activity.steps.value).toBe(0);
  });

  it('cumule les pas ajoutés sans modifier la journée d’origine', () => {
    const morning = DailyActivity.start(today, goal).addSteps(steps(3_000));
    const evening = morning.addSteps(steps(4_500));

    expect(evening.steps.value).toBe(7_500);
    expect(morning.steps.value).toBe(3_000);
  });

  it.each([
    [9_999, false],
    [10_000, true],
    [12_500, true],
  ])('avec %s pas, objectif atteint : %s', (walked, reached) => {
    expect(DailyActivity.start(today, goal).addSteps(steps(walked)).isGoalReached()).toBe(reached);
  });
});
