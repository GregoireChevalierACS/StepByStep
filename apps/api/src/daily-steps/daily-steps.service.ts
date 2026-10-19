import { Inject, Injectable } from '@nestjs/common';
import { err, LocalDate, ok, type Result } from '@stepbystep/domain';
import type { DeviceNotFound } from '../devices/device-errors.js';
import { DEVICE_REPOSITORY, type DeviceRepository } from '../devices/device.repository.js';
import { DAILY_STEPS_REPOSITORY, type DailyStepsRepository } from './daily-steps.repository.js';
import type { PeriodQuery } from './period.query.js';

export interface DayTotal {
  readonly day: string;
  readonly steps: number;
}

// La période a déjà été validée par le schéma de la requête : un échec ici est un bug interne.
const localDate = (value: string): LocalDate => {
  const date = LocalDate.create(value);
  if (!date.ok) throw new Error(`Jour invalide après validation : ${value}`);
  return date.value;
};

/** Lecture de la projection des pas par jour d'un appareil, sur une période. */
@Injectable()
export class DailyStepsService {
  constructor(
    @Inject(DEVICE_REPOSITORY) private readonly devices: DeviceRepository,
    @Inject(DAILY_STEPS_REPOSITORY) private readonly dailySteps: DailyStepsRepository,
  ) {}

  async read(
    deviceId: string,
    { from, to }: PeriodQuery,
  ): Promise<Result<DayTotal[], DeviceNotFound>> {
    if (!(await this.devices.exists(deviceId))) {
      return err({ kind: 'DeviceNotFound', deviceId });
    }
    const days = await this.dailySteps.between(deviceId, localDate(from), localDate(to));
    return ok(days.map(({ date, steps }) => ({ day: date.toString(), steps: steps.value })));
  }
}
