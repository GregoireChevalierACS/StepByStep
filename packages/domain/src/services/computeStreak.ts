import type { DailyActivity } from '../model/DailyActivity';
import type { LocalDate } from '../model/LocalDate';

/**
 * Nombre de jours consécutifs, jusqu'à aujourd'hui, où l'objectif a été atteint.
 * La journée en cours ne casse pas la série tant que son objectif n'est pas atteint :
 * on compte alors à partir d'hier. Un jour sans activité interrompt la série.
 */
export const computeStreak = (activities: readonly DailyActivity[], today: LocalDate): number => {
  const reachedDays = new Set(
    activities.filter((activity) => activity.isGoalReached()).map(({ date }) => date.toString()),
  );

  let day = reachedDays.has(today.toString()) ? today : today.previous();
  let streak = 0;
  while (reachedDays.has(day.toString())) {
    streak += 1;
    day = day.previous();
  }
  return streak;
};
