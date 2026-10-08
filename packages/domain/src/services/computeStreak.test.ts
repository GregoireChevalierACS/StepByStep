import { describe, expect, it } from 'vitest';
import { DailyActivity } from '../model/DailyActivity';
import { DailyGoal } from '../model/DailyGoal';
import { LocalDate } from '../model/LocalDate';
import { StepCount } from '../model/StepCount';
import { unwrap } from '../testing/unwrap';
import { computeStreak } from './computeStreak';

const goal = unwrap(DailyGoal.create(10_000));
const today = unwrap(LocalDate.create('2026-10-08'));

// Journée du 2026-10-<day>, objectif atteint ou non.
const day = (dayOfMonth: number, reached: boolean) =>
  DailyActivity.start(
    unwrap(LocalDate.create(`2026-10-${String(dayOfMonth).padStart(2, '0')}`)),
    goal,
  ).addSteps(unwrap(StepCount.create(reached ? 10_000 : 2_000)));

describe('computeStreak', () => {
  it('vaut zéro sans aucune activité', () => {
    expect(computeStreak([], today)).toBe(0);
  });

  it('compte aujourd’hui quand son objectif est atteint', () => {
    expect(computeStreak([day(8, true)], today)).toBe(1);
  });

  it('compte les jours consécutifs jusqu’à aujourd’hui', () => {
    expect(computeStreak([day(6, true), day(7, true), day(8, true)], today)).toBe(3);
  });

  it('ne casse pas la série tant que l’objectif du jour n’est pas encore atteint', () => {
    expect(computeStreak([day(6, true), day(7, true), day(8, false)], today)).toBe(2);
    expect(computeStreak([day(6, true), day(7, true)], today)).toBe(2);
  });

  it('s’arrête au premier jour manquant', () => {
    expect(computeStreak([day(4, true), day(5, true), day(7, true), day(8, true)], today)).toBe(2);
  });

  it('s’arrête au premier jour où l’objectif est raté', () => {
    expect(computeStreak([day(5, true), day(6, false), day(7, true), day(8, true)], today)).toBe(2);
  });

  it('vaut zéro quand l’objectif d’hier est raté et celui du jour pas encore atteint', () => {
    expect(computeStreak([day(6, true), day(7, false), day(8, false)], today)).toBe(0);
  });

  it('ne dépend pas de l’ordre des activités et ignore les jours futurs', () => {
    expect(computeStreak([day(9, true), day(8, true), day(6, true), day(7, true)], today)).toBe(3);
  });
});
