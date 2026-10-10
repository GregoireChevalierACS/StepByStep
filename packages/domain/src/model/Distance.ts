import { err, ok, type Result } from '../shared/Result';
import type { StepCount } from './StepCount';

export interface InvalidDistance {
  readonly kind: 'InvalidDistance';
  readonly meters: number;
}

/** Distance en mètres, finie et positive ou nulle. */
export class Distance {
  private constructor(readonly meters: number) {}

  static ofMeters(meters: number): Result<Distance, InvalidDistance> {
    if (!Number.isFinite(meters) || meters < 0) return err({ kind: 'InvalidDistance', meters });
    return ok(new Distance(meters));
  }

  times(steps: StepCount): Distance {
    return new Distance(this.meters * steps.value);
  }

  /** Un facteur négatif ou non fini compte pour zéro : la distance reste toujours valide. */
  scaledBy(factor: number): Distance {
    // Stryker disable next-line EqualityOperator: équivalent, un facteur nul donne 0 dans les deux branches (meters × 0 = 0).
    return new Distance(Number.isFinite(factor) && factor > 0 ? this.meters * factor : 0);
  }
}
