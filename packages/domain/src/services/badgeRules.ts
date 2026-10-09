import type { DailyActivity } from '../model/DailyActivity';
import type { LocalDate } from '../model/LocalDate';
import { type Specification, specification } from '../shared/Specification';
import { computeStreak } from './computeStreak';

/** Candidat évalué par les règles de badge : l'historique des journées et la date du jour. */
export interface ActivityHistory {
  readonly days: readonly DailyActivity[];
  readonly today: LocalDate;
}

/** Au moins `days` jours consécutifs avec l'objectif atteint (voir computeStreak). */
export const streakOfAtLeast = (days: number): Specification<ActivityHistory> =>
  specification((history) => computeStreak(history.days, history.today) >= days);

/** Au moins une journée avec `steps` pas ou plus. */
export const bestDayOfAtLeast = (steps: number): Specification<ActivityHistory> =>
  specification((history) => history.days.some((day) => day.steps.value >= steps));
