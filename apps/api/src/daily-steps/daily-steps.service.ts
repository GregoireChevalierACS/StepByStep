import { Injectable } from '@nestjs/common';
import { err, ok, type Result } from '@stepbystep/domain';
import { Between, DataSource } from 'typeorm';
import { DailyStepsEntity } from '../database/entities/daily-steps.entity.js';
import { DeviceEntity } from '../database/entities/device.entity.js';
import { dailyStepsToDomain } from '../database/mappers/daily-steps.mapper.js';
import type { DeviceNotFound } from '../devices/device-not-found.js';
import type { PeriodQuery } from './period.query.js';

export interface DayTotal {
  readonly day: string;
  readonly steps: number;
}

/** Lecture de la projection des pas par jour d'un appareil, sur une période. */
@Injectable()
export class DailyStepsService {
  constructor(private readonly dataSource: DataSource) {}

  async read(
    deviceId: string,
    { from, to }: PeriodQuery,
  ): Promise<Result<DayTotal[], DeviceNotFound>> {
    if (!(await this.dataSource.getRepository(DeviceEntity).existsBy({ id: deviceId }))) {
      return err({ kind: 'DeviceNotFound', deviceId });
    }
    const rows = await this.dataSource.getRepository(DailyStepsEntity).find({
      where: { deviceId, day: Between(from, to) },
      order: { day: 'ASC' },
    });
    // Chaque ligne relue repasse par le domaine : une donnée corrompue n'est pas renvoyée.
    return ok(
      rows.map((row) => {
        const daily = dailyStepsToDomain(row);
        if (!daily.ok)
          throw new Error(`Donnée enregistrée invalide : ${JSON.stringify(daily.error)}`);
        return { day: daily.value.date.toString(), steps: daily.value.steps.value };
      }),
    );
  }
}
