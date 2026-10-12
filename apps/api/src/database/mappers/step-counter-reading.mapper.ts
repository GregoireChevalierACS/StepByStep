import { type Result, StepCounterReading, type StepCounterReadingError } from '@stepbystep/domain';
import type { StepCounterReadingEntity } from '../entities/step-counter-reading.entity.js';

export type StepCounterReadingRow = Pick<
  StepCounterReadingEntity,
  'deviceId' | 'takenAt' | 'bootCount' | 'stepsSinceBoot'
>;

/** Domaine → base : l'instant epoch (ms) devient une Date (colonne timestamptz). */
export const readingToRow = (
  deviceId: string,
  reading: StepCounterReading,
): StepCounterReadingRow => ({
  deviceId,
  takenAt: new Date(reading.takenAt),
  bootCount: reading.bootCount,
  stepsSinceBoot: reading.stepsSinceBoot.value,
});

/** Base → domaine : repasse par la fabrique du domaine, qui revalide la ligne lue. */
export const readingToDomain = (
  row: StepCounterReadingRow,
): Result<StepCounterReading, StepCounterReadingError> =>
  StepCounterReading.create({
    stepsSinceBoot: row.stepsSinceBoot,
    bootCount: row.bootCount,
    takenAt: row.takenAt.getTime(),
  });
