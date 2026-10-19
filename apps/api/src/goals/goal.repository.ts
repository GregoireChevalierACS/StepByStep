import type { GoalChange } from '@stepbystep/domain';

/** Port de persistance de l'historique des objectifs d'un compte (voir DeviceRepository). */
export interface GoalRepository {
  /**
   * Enregistre un changement d'objectif. Un objectif déjà fixé le même jour est remplacé :
   * la dernière décision l'emporte (GoalHistory.record du domaine).
   */
  record(accountId: string, change: GoalChange): Promise<void>;
  /** Changements enregistrés, dans un ordre quelconque : GoalHistory.from les normalise. */
  changesOf(accountId: string): Promise<GoalChange[]>;
}

export const GOAL_REPOSITORY = Symbol('GOAL_REPOSITORY');
