import type { DailyGoal } from '../model/DailyGoal';
import type { GoalHistory } from '../model/GoalHistory';
import type { LocalDate } from '../model/LocalDate';
import type { StepCount } from '../model/StepCount';
import type { DailySteps } from './distributeStepsByDay';

/** Événement de domaine : le total d'un jour vient d'atteindre l'objectif en vigueur ce jour-là. */
export interface GoalReached {
  readonly date: LocalDate;
  readonly steps: StepCount;
  readonly goal: DailyGoal;
}

/**
 * Jours dont le total vient de franchir l'objectif lors d'un recalcul : avant < objectif ≤ après,
 * chaque jour jugé avec son propre objectif (GoalHistory). Un jour absent des totaux `before`
 * part de zéro. Un objectif déjà atteint ne produit rien : renvoyer un lot connu ne crée pas
 * d'événement. Un total qui redescend sous l'objectif (relevé en retard qui déplace des pas
 * vers la veille) ne produit rien non plus : un événement publié n'est jamais rétracté.
 */
export const goalsReached = (
  before: readonly DailySteps[],
  after: readonly DailySteps[],
  goals: GoalHistory,
): GoalReached[] => {
  const previous = new Map(before.map(({ date, steps }) => [date.toString(), steps.value]));
  return after
    .filter(({ date, steps }) => {
      const goal = goals.goalOn(date).steps.value;
      return (previous.get(date.toString()) ?? 0) < goal && steps.value >= goal;
    })
    .map(({ date, steps }) => ({ date, steps, goal: goals.goalOn(date) }));
};
