import { Inject, Injectable } from '@nestjs/common';
import { err, type GoalChange, GoalHistory, ok, type Result } from '@stepbystep/domain';
import { ACCOUNT_REPOSITORY, type AccountRepository } from '../accounts/account.repository.js';
import { GOAL_REPOSITORY, type GoalRepository } from './goal.repository.js';

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
  constructor(
    @Inject(ACCOUNT_REPOSITORY) private readonly accounts: AccountRepository,
    @Inject(GOAL_REPOSITORY) private readonly goals: GoalRepository,
  ) {}

  async set(
    accountId: string,
    change: GoalChange,
  ): Promise<Result<GoalHistoryEntry[], AccountNotFound>> {
    if (!(await this.accounts.exists(accountId))) {
      return err({ kind: 'AccountNotFound', accountId });
    }
    await this.goals.record(accountId, change);

    // Historique relu et normalisé par le domaine (ordre chronologique, redondances fusionnées).
    const history = GoalHistory.from(await this.goals.changesOf(accountId));
    if (!history.ok) {
      // Impossible si la persistance respecte son contrat (un objectif par jour).
      throw new Error(`Historique d'objectifs incohérent : ${JSON.stringify(history.error)}`);
    }
    return ok(
      history.value.changes.map(({ effectiveFrom, goal }) => ({
        effectiveFrom: effectiveFrom.toString(),
        goal: goal.steps.value,
      })),
    );
  }
}
