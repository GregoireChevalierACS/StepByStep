import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { DailyGoal } from '../model/DailyGoal';
import { type GoalChange, GoalHistory } from '../model/GoalHistory';
import { LocalDate } from '../model/LocalDate';
import { StepCount } from '../model/StepCount';
import { unwrap } from '../testing/unwrap';
import type { DailySteps } from './distributeStepsByDay';
import { goalsReached } from './goalsReached';

// Fixtures paresseuses : créées pendant les tests, jamais au chargement du module.
const date = (dayOfMonth: number) =>
  unwrap(LocalDate.create(`2026-10-${String(dayOfMonth).padStart(2, '0')}`));
const day = (dayOfMonth: number, steps: number): DailySteps => ({
  date: date(dayOfMonth),
  steps: unwrap(StepCount.create(steps)),
});
const change = (dayOfMonth: number, goal: number): GoalChange => ({
  effectiveFrom: date(dayOfMonth),
  goal: unwrap(DailyGoal.create(goal)),
});
const goals = (...changes: GoalChange[]) => unwrap(GoalHistory.from(changes));
const tenThousand = () => goals(change(1, 10_000));
const reachedDays = (events: ReturnType<typeof goalsReached>) =>
  events.map(({ date: d, steps, goal }) => ({
    day: d.toString(),
    steps: steps.value,
    goal: goal.steps.value,
  }));

describe('goalsReached', () => {
  it('signale un jour qui vient de franchir son objectif', () => {
    const events = goalsReached([day(12, 9_000)], [day(12, 10_500)], tenThousand());

    expect(reachedDays(events)).toEqual([{ day: '2026-10-12', steps: 10_500, goal: 10_000 }]);
  });

  it('compte l’objectif atteint pile', () => {
    expect(goalsReached([day(12, 9_999)], [day(12, 10_000)], tenThousand())).toHaveLength(1);
  });

  it('considère un jour encore inconnu comme parti de zéro', () => {
    expect(goalsReached([], [day(12, 12_000)], tenThousand())).toHaveLength(1);
  });

  it('ne signale pas un objectif déjà atteint avant ce recalcul', () => {
    expect(goalsReached([day(12, 10_000)], [day(12, 11_000)], tenThousand())).toEqual([]);
  });

  it('ne signale rien quand le total reste sous l’objectif ou y redescend', () => {
    expect(goalsReached([day(12, 2_000)], [day(12, 9_999)], tenThousand())).toEqual([]);
    // Relevé en retard qui déplace des pas vers la veille : pas de rétractation.
    expect(goalsReached([day(12, 10_500)], [day(12, 9_000)], tenThousand())).toEqual([]);
  });

  it('juge chaque jour avec l’objectif en vigueur ce jour-là', () => {
    const history = goals(change(1, 5_000), change(12, 20_000));

    const events = goalsReached([], [day(11, 6_000), day(12, 6_000)], history);

    expect(reachedDays(events)).toEqual([{ day: '2026-10-11', steps: 6_000, goal: 5_000 }]);
  });

  it('ignore les totaux « avant » des jours qui ne sont pas recalculés', () => {
    expect(goalsReached([day(11, 0)], [day(12, 0)], tenThousand())).toEqual([]);
  });

  describe('propriétés', () => {
    const anyDays = fc
      .uniqueArray(fc.tuple(fc.integer({ min: 1, max: 28 }), fc.nat({ max: 25_000 })), {
        selector: ([dayOfMonth]) => dayOfMonth,
        maxLength: 10,
      })
      .map((entries) =>
        entries.sort(([a], [b]) => a - b).map(([dayOfMonth, steps]) => day(dayOfMonth, steps)),
      );
    const anyGoals = fc
      .uniqueArray(fc.tuple(fc.integer({ min: 1, max: 28 }), fc.integer({ min: 1, max: 20_000 })), {
        selector: ([dayOfMonth]) => dayOfMonth,
        minLength: 1,
        maxLength: 4,
      })
      .map((entries) => goals(...entries.map(([dayOfMonth, goal]) => change(dayOfMonth, goal))));

    it('ne signale que des franchissements : avant < objectif ≤ après', () => {
      fc.assert(
        fc.property(anyDays, anyDays, anyGoals, (before, after, history) => {
          for (const { date: d, steps, goal } of goalsReached(before, after, history)) {
            const previous = before.find(({ date: b }) => b.equals(d))?.steps.value ?? 0;
            expect(previous).toBeLessThan(goal.steps.value);
            expect(steps.value).toBeGreaterThanOrEqual(goal.steps.value);
            expect(goal).toBe(history.goalOn(d));
          }
        }),
      );
    });

    it('signale tout jour recalculé qui franchit son objectif, dans l’ordre des jours', () => {
      fc.assert(
        fc.property(anyDays, anyDays, anyGoals, (before, after, history) => {
          const crossing = after.filter(({ date: d, steps }) => {
            const previous = before.find(({ date: b }) => b.equals(d))?.steps.value ?? 0;
            const goal = history.goalOn(d).steps.value;
            return previous < goal && steps.value >= goal;
          });

          expect(goalsReached(before, after, history).map(({ date: d }) => d)).toEqual(
            crossing.map(({ date: d }) => d),
          );
        }),
      );
    });

    it('ne signale rien quand rien n’a changé (renvoi d’un lot déjà connu)', () => {
      fc.assert(
        fc.property(anyDays, anyGoals, (days, history) => {
          expect(goalsReached(days, days, history)).toEqual([]);
        }),
      );
    });
  });
});
