import { DailyActivity } from '../model/DailyActivity';
import { DailyGoal } from '../model/DailyGoal';
import { LocalDate } from '../model/LocalDate';
import { StepCount } from '../model/StepCount';
import type { ActivityHistory } from '../services/badgeRules';
import { unwrap } from './unwrap';

/**
 * Historique de test : un nombre de pas par jour, du plus ancien au plus récent,
 * le dernier jour étant « aujourd'hui » (objectif quotidien de 10 000 pas).
 * Ex. activityHistory([10_000, 12_000, 3_000]) → 3 jours finissant le 2026-10-09.
 */
export const activityHistory = (stepsPerDay: readonly number[]): ActivityHistory => {
  // Créés à l'appel, pas au chargement du module : si un mutant casse DailyGoal ou
  // LocalDate, c'est le test qui échoue (mutant tué), pas le chargement du fichier.
  const goal = unwrap(DailyGoal.create(10_000));
  const today = unwrap(LocalDate.create('2026-10-09'));
  let date = today;
  const days = [...stepsPerDay].reverse().map((steps) => {
    const day = DailyActivity.start(date, goal).addSteps(unwrap(StepCount.create(steps)));
    date = date.previous();
    return day;
  });
  return { days, today };
};
