import { Injectable } from '@nestjs/common';
import type { DailySteps, LocalDate } from '@stepbystep/domain';
import { Between, DataSource } from 'typeorm';
import type { DailyStepsRepository } from '../../daily-steps/daily-steps.repository.js';
import { DailyStepsEntity } from '../entities/daily-steps.entity.js';
import { dailyStepsToDomain } from '../mappers/daily-steps.mapper.js';

/** Adapter PostgreSQL (TypeORM) du port DailyStepsRepository. */
@Injectable()
export class TypeOrmDailyStepsRepository implements DailyStepsRepository {
  constructor(private readonly dataSource: DataSource) {}

  async between(deviceId: string, from: LocalDate, to: LocalDate): Promise<DailySteps[]> {
    const rows = await this.dataSource.getRepository(DailyStepsEntity).find({
      where: { deviceId, day: Between(from.toString(), to.toString()) },
      order: { day: 'ASC' },
    });
    // Chaque ligne relue repasse par le domaine : une donnée corrompue n'est pas renvoyée.
    return rows.map((row) => {
      const daily = dailyStepsToDomain(row);
      if (!daily.ok)
        throw new Error(`Donnée enregistrée invalide : ${JSON.stringify(daily.error)}`);
      return daily.value;
    });
  }
}
