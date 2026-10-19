import { Injectable } from '@nestjs/common';
import type { DailySteps, LocalDate } from '@stepbystep/domain';
import { Between, DataSource, type FindOperator, LessThanOrEqual } from 'typeorm';
import type { DailyStepsRepository } from '../../daily-steps/daily-steps.repository.js';
import { DailyStepsEntity } from '../entities/daily-steps.entity.js';
import { dailyStepsToDomain } from '../mappers/daily-steps.mapper.js';
import { stored } from './stored.js';

/** Adapter PostgreSQL (TypeORM) du port DailyStepsRepository. */
@Injectable()
export class TypeOrmDailyStepsRepository implements DailyStepsRepository {
  constructor(private readonly dataSource: DataSource) {}

  between(deviceId: string, from: LocalDate, to: LocalDate): Promise<DailySteps[]> {
    return this.find(deviceId, Between(from.toString(), to.toString()));
  }

  upTo(deviceId: string, to: LocalDate): Promise<DailySteps[]> {
    return this.find(deviceId, LessThanOrEqual(to.toString()));
  }

  private async find(deviceId: string, day: FindOperator<string>): Promise<DailySteps[]> {
    const rows = await this.dataSource
      .getRepository(DailyStepsEntity)
      .find({ where: { deviceId, day }, order: { day: 'ASC' } });
    // Chaque ligne relue repasse par le domaine : une donnée corrompue n'est pas renvoyée.
    return rows.map((row) => stored(dailyStepsToDomain(row)));
  }
}
