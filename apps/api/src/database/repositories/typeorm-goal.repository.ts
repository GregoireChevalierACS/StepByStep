import { Injectable } from '@nestjs/common';
import type { GoalChange } from '@stepbystep/domain';
import { DataSource } from 'typeorm';
import type { GoalRepository } from '../../goals/goal.repository.js';
import { DailyGoalEntity } from '../entities/daily-goal.entity.js';
import { goalChangeToDomain, goalChangeToRow } from '../mappers/goal-change.mapper.js';
import { stored } from './stored.js';

/** Adapter PostgreSQL (TypeORM) du port GoalRepository. */
@Injectable()
export class TypeOrmGoalRepository implements GoalRepository {
  constructor(private readonly dataSource: DataSource) {}

  async record(accountId: string, change: GoalChange): Promise<void> {
    // UPSERT sur (compte, jour) : un objectif fixé deux fois le même jour est remplacé.
    await this.dataSource
      .createQueryBuilder()
      .insert()
      .into(DailyGoalEntity)
      .values(goalChangeToRow(accountId, change))
      .orUpdate(['goal_steps'], ['account_id', 'effective_from'])
      .execute();
  }

  async changesOf(accountId: string): Promise<GoalChange[]> {
    const rows = await this.dataSource.getRepository(DailyGoalEntity).findBy({ accountId });
    return rows.map((row) => stored(goalChangeToDomain(row)));
  }
}
