import { err, ok, type Result } from '../shared/Result';
import { StepCount } from './StepCount';

export interface InvalidDailyGoal {
  readonly kind: 'InvalidDailyGoal';
  readonly value: number;
}

/** Objectif de pas quotidien : un nombre entier de pas, strictement positif. */
export class DailyGoal {
  private constructor(readonly steps: StepCount) {}

  static create(value: number): Result<DailyGoal, InvalidDailyGoal> {
    const steps = StepCount.create(value);
    if (!steps.ok || steps.value.value === 0) return err({ kind: 'InvalidDailyGoal', value });
    return ok(new DailyGoal(steps.value));
  }
}
