import { err, ok, type Result } from '../shared/Result';
import type { DailyGoal } from './DailyGoal';
import type { LocalDate } from './LocalDate';

/** Objectif quotidien en vigueur à partir d'un jour (inclus). */
export interface GoalChange {
  readonly goal: DailyGoal;
  readonly effectiveFrom: LocalDate;
}

export interface EmptyGoalHistory {
  readonly kind: 'EmptyGoalHistory';
}

export interface ConflictingGoalChanges {
  readonly kind: 'ConflictingGoalChanges';
  readonly effectiveFrom: string;
  readonly goals: readonly [number, number];
}

export type GoalHistoryError = EmptyGoalHistory | ConflictingGoalChanges;

const stepsOf = (change: GoalChange) => change.goal.steps.value;

// Ordre total : par date, puis par objectif (pour un résultat déterministe).
const chronologically = (a: GoalChange, b: GoalChange): number =>
  a.effectiveFrom.compareTo(b.effectiveFrom) || stepsOf(a) - stepsOf(b);

/**
 * Trie les changements, ignore les doublons et ne garde que les vrais changements
 * d'objectif. Deux objectifs différents à la même date sont une contradiction.
 */
const onlyChanges = (
  changes: readonly GoalChange[],
): Result<GoalChange[], ConflictingGoalChanges> => {
  const sorted = [...changes].sort(chronologically);
  const kept: GoalChange[] = [];
  let previous: GoalChange | undefined;
  for (const change of sorted) {
    // Comparaison au précédent dans l'ordre trié, pas au dernier gardé : une
    // contradiction ne doit pas être masquée par la fusion d'un changement redondant.
    if (
      previous?.effectiveFrom.equals(change.effectiveFrom) &&
      stepsOf(previous) !== stepsOf(change)
    ) {
      return err({
        kind: 'ConflictingGoalChanges',
        effectiveFrom: change.effectiveFrom.toString(),
        goals: [stepsOf(previous), stepsOf(change)],
      });
    }
    const last = kept.at(-1);
    if (!last || stepsOf(last) !== stepsOf(change)) kept.push(change);
    previous = change;
  }
  return ok(kept);
};

/**
 * Historique de l'objectif quotidien : changer d'objectif ne réécrit pas le passé.
 * Jamais vide : le type de `changes` le garantit.
 */
export class GoalHistory {
  private constructor(readonly changes: readonly [GoalChange, ...GoalChange[]]) {}

  /** Construit l'historique à partir de changements reçus dans n'importe quel ordre, doublons compris. */
  static from(changes: readonly GoalChange[]): Result<GoalHistory, GoalHistoryError> {
    const kept = onlyChanges(changes);
    if (!kept.ok) return kept;
    const [first, ...others] = kept.value;
    if (!first) return err({ kind: 'EmptyGoalHistory' });
    return ok(new GoalHistory([first, ...others]));
  }

  /** Objectif en vigueur ce jour-là ; avant le premier changement, le premier objectif connu. */
  goalOn(date: LocalDate): DailyGoal {
    let inEffect = this.changes[0];
    for (const change of this.changes) {
      if (change.effectiveFrom.compareTo(date) > 0) break;
      inEffect = change;
    }
    return inEffect.goal;
  }

  /**
   * Enregistre un nouvel objectif. Un objectif déjà fixé à la même date est remplacé :
   * les appels arrivent dans l'ordre sur l'appareil, la dernière décision l'emporte.
   */
  record(change: GoalChange): Result<GoalHistory, GoalHistoryError> {
    const others = this.changes.filter(
      ({ effectiveFrom }) => !effectiveFrom.equals(change.effectiveFrom),
    );
    return GoalHistory.from([...others, change]);
  }
}
