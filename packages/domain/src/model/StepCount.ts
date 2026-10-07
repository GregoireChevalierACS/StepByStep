import { err, ok, type Result } from '../shared/Result';

export interface NegativeStepCount {
  readonly kind: 'NegativeStepCount';
  readonly value: number;
}

export interface NonIntegerStepCount {
  readonly kind: 'NonIntegerStepCount';
  readonly value: number;
}

export type StepCountError = NegativeStepCount | NonIntegerStepCount;

export class StepCount {
  private constructor(readonly value: number) {}

  static create(value: number): Result<StepCount, StepCountError> {
    if (!Number.isInteger(value)) return err({ kind: 'NonIntegerStepCount', value });
    if (value < 0) return err({ kind: 'NegativeStepCount', value });
    return ok(new StepCount(value));
  }

  add(other: StepCount): StepCount {
    return new StepCount(this.value + other.value);
  }

  /**
   * Répartit ces pas au prorata des poids (une part par poids). L'arrondi est fait
   * en cumulé : la somme des parts vaut toujours le total. Un poids négatif compte
   * pour zéro ; si tous les poids sont nuls, la dernière part reçoit tout.
   */
  split(weights: readonly number[]): StepCount[] {
    const safeWeights = weights.map((weight) => Math.max(0, weight));
    const totalWeight = safeWeights.reduce((sum, weight) => sum + weight, 0);
    const lastIndex = safeWeights.length - 1;
    const assignedUpTo = (cumulativeWeight: number, index: number): number => {
      if (index === lastIndex) return this.value;
      if (totalWeight === 0) return 0;
      return Math.floor((this.value * cumulativeWeight) / totalWeight);
    };
    let cumulativeWeight = 0;
    let assigned = 0;

    return safeWeights.map((weight, index) => {
      cumulativeWeight += weight;
      const cumulative = assignedUpTo(cumulativeWeight, index);
      const part = new StepCount(cumulative - assigned);
      assigned = cumulative;
      return part;
    });
  }

  subtract(other: StepCount): Result<StepCount, StepCountError> {
    return StepCount.create(this.value - other.value);
  }
}
