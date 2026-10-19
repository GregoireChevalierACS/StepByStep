import type { DailySteps, LocalDate } from '@stepbystep/domain';

/** Port de lecture de la projection des pas par jour (voir DeviceRepository). */
export interface DailyStepsRepository {
  /** Pas par jour local de l'appareil, de `from` à `to` (bornes incluses), triés par jour. */
  between(deviceId: string, from: LocalDate, to: LocalDate): Promise<DailySteps[]>;
}

export const DAILY_STEPS_REPOSITORY = Symbol('DAILY_STEPS_REPOSITORY');
