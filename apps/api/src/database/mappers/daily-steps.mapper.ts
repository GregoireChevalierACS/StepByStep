import {
  type DailySteps,
  type InvalidLocalDate,
  LocalDate,
  ok,
  type Result,
  StepCount,
  type StepCountError,
} from '@stepbystep/domain';
import type { DailyStepsEntity } from '../entities/daily-steps.entity.js';

export type DailyStepsRow = Pick<DailyStepsEntity, 'deviceId' | 'day' | 'steps'>;

/** Domaine → base : la LocalDate devient le texte AAAA-MM-JJ (colonne date). */
export const dailyStepsToRow = (deviceId: string, daily: DailySteps): DailyStepsRow => ({
  deviceId,
  day: daily.date.toString(),
  steps: daily.steps.value,
});

/** Base → domaine : repasse par les fabriques du domaine, qui revalident la ligne lue. */
export const dailyStepsToDomain = (
  row: DailyStepsRow,
): Result<DailySteps, InvalidLocalDate | StepCountError> => {
  const date = LocalDate.create(row.day);
  if (!date.ok) return date;
  const steps = StepCount.create(row.steps);
  if (!steps.ok) return steps;
  return ok({ date: date.value, steps: steps.value });
};
