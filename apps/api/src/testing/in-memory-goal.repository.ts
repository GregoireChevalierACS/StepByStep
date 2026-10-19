import type { GoalChange } from '@stepbystep/domain';
import type { GoalRepository } from '../goals/goal.repository.js';

/** Adapter en mémoire de GoalRepository, pour les tests unitaires (tenu par le contrat). */
export class InMemoryGoalRepository implements GoalRepository {
  /** Compte → (jour d'effet → changement) : un seul objectif par jour, comme la clé en base. */
  private readonly changes = new Map<string, Map<string, GoalChange>>();

  record(accountId: string, change: GoalChange): Promise<void> {
    const known = this.changes.get(accountId) ?? new Map<string, GoalChange>();
    known.set(change.effectiveFrom.toString(), change);
    this.changes.set(accountId, known);
    return Promise.resolve();
  }

  changesOf(accountId: string): Promise<GoalChange[]> {
    return Promise.resolve([...(this.changes.get(accountId)?.values() ?? [])]);
  }
}
