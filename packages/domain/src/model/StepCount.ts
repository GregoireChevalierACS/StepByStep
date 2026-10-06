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
}
