import { DailyGoal, type GoalChange, GoalHistory, type LocalDate } from '@stepbystep/domain';

/** Objectif appliqué tant que le compte n'en a fixé aucun (la référence courante). */
export const DEFAULT_DAILY_GOAL = 10_000;

/**
 * Historique des objectifs d'un compte, ou l'objectif par défaut s'il n'en a fixé aucun.
 * `anyDay` sert de date d'effet à l'objectif par défaut : avant son premier changement, un
 * historique applique de toute façon son premier objectif.
 */
export const goalHistoryOrDefault = (
  changes: readonly GoalChange[],
  anyDay: LocalDate,
): GoalHistory => {
  const defaultGoal = DailyGoal.create(DEFAULT_DAILY_GOAL);
  if (!defaultGoal.ok) throw new Error('Objectif par défaut invalide.');
  const history = GoalHistory.from(
    changes.length > 0 ? changes : [{ effectiveFrom: anyDay, goal: defaultGoal.value }],
  );
  // Impossible si la persistance respecte son contrat (un objectif par jour).
  if (!history.ok) throw new Error(`Historique d'objectifs incohérent : ${history.error.kind}`);
  return history.value;
};
