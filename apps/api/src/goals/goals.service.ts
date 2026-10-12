import { Injectable } from '@nestjs/common';
import { err, type GoalChange, GoalHistory, ok, type Result } from '@stepbystep/domain';
import { DataSource } from 'typeorm';
import { AccountEntity } from '../database/entities/account.entity.js';
import { DailyGoalEntity } from '../database/entities/daily-goal.entity.js';
import { goalChangeToDomain, goalChangeToRow } from '../database/mappers/goal-change.mapper.js';

export interface AccountNotFound {
  readonly kind: 'AccountNotFound';
  readonly accountId: string;
}

export interface GoalHistoryEntry {
  readonly effectiveFrom: string;
  readonly goal: number;
}

/**
 * Objectif quotidien d'un compte. Changer d'objectif ne réécrit pas le passé : chaque
 * changement s'applique à partir de son jour (GoalHistory du domaine).
 */
@Injectable()
export class GoalsService {
  constructor(private readonly dataSource: DataSource) {}

  async set(
    accountId: string,
    change: GoalChange,
  ): Promise<Result<GoalHistoryEntry[], AccountNotFound>> {
    if (!(await this.dataSource.getRepository(AccountEntity).existsBy({ id: accountId }))) {
      return err({ kind: 'AccountNotFound', accountId });
    }

    // UPSERT sur (compte, jour) : un objectif fixé deux fois le même jour est remplacé.
    // Traduction en base de GoalHistory.record : la dernière décision l'emporte.
    await this.dataSource
      .createQueryBuilder()
      .insert()
      .into(DailyGoalEntity)
      .values(goalChangeToRow(accountId, change))
      .orUpdate(['goal_steps'], ['account_id', 'effective_from'])
      .execute();

    // Historique relu et normalisé par le domaine (ordre chronologique, redondances fusionnées).
    const rows = await this.dataSource.getRepository(DailyGoalEntity).findBy({ accountId });
    const history = GoalHistory.from(rows.map((row) => this.valid(goalChangeToDomain(row))));
    const changes = this.valid(history).changes;
    return ok(
      changes.map(({ effectiveFrom, goal }) => ({
        effectiveFrom: effectiveFrom.toString(),
        goal: goal.steps.value,
      })),
    );
  }

  /** Une ligne relue invalide (ou un historique incohérent) est une incohérence de données. */
  private valid<T>(result: Result<T, unknown>): T {
    if (!result.ok) {
      throw new Error(`Donnée enregistrée invalide : ${JSON.stringify(result.error)}`);
    }
    return result.value;
  }
}
