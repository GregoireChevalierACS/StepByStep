import {
  DailyGoal,
  err,
  type GoalChange,
  type InvalidDailyGoal,
  type InvalidLocalDate,
  LocalDate,
  ok,
  type Result,
} from '@stepbystep/domain';
import type { DailyGoalEntity } from '../entities/daily-goal.entity.js';

export type DailyGoalRow = Pick<DailyGoalEntity, 'accountId' | 'effectiveFrom' | 'goalSteps'>;

/** Domaine → base : la LocalDate devient le texte AAAA-MM-JJ (colonne date). */
export const goalChangeToRow = (accountId: string, change: GoalChange): DailyGoalRow => ({
  accountId,
  effectiveFrom: change.effectiveFrom.toString(),
  goalSteps: change.goal.steps.value,
});

/** Base → domaine : repasse par les fabriques du domaine, qui revalident la ligne lue. */
export const goalChangeToDomain = (
  row: DailyGoalRow,
): Result<GoalChange, InvalidLocalDate | InvalidDailyGoal> => {
  const effectiveFrom = LocalDate.create(row.effectiveFrom);
  if (!effectiveFrom.ok) return effectiveFrom;
  const goal = DailyGoal.create(row.goalSteps);
  if (!goal.ok) return err(goal.error);
  return ok({ goal: goal.value, effectiveFrom: effectiveFrom.value });
};
