import { err, ok, type Result } from '../shared/Result';
import { StepCount, type StepCountError } from './StepCount';

export interface InvalidStepsSinceBoot {
  readonly kind: 'InvalidStepsSinceBoot';
  readonly cause: StepCountError;
}

export interface InvalidBootCount {
  readonly kind: 'InvalidBootCount';
  readonly value: number;
}

export type StepCounterReadingError = InvalidStepsSinceBoot | InvalidBootCount;

/**
 * Relevé du capteur matériel TYPE_STEP_COUNTER : nombre de pas cumulés depuis
 * le démarrage du téléphone, et numéro de ce démarrage (Settings.Global.BOOT_COUNT).
 */
export class StepCounterReading {
  private constructor(
    readonly stepsSinceBoot: StepCount,
    readonly bootCount: number,
  ) {}

  static create(props: {
    stepsSinceBoot: number;
    bootCount: number;
  }): Result<StepCounterReading, StepCounterReadingError> {
    const steps = StepCount.create(props.stepsSinceBoot);
    if (!steps.ok) return err({ kind: 'InvalidStepsSinceBoot', cause: steps.error });
    if (!Number.isInteger(props.bootCount) || props.bootCount < 0) {
      return err({ kind: 'InvalidBootCount', value: props.bootCount });
    }
    return ok(new StepCounterReading(steps.value, props.bootCount));
  }

  /**
   * Le compteur matériel repart à 0 à chaque démarrage. Après une remise à zéro
   * (autre démarrage, ou compteur qui baisse), seuls les pas faits depuis ce
   * démarrage sont connus : ceux d'avant l'extinction sont perdus.
   */
  stepsSince(previous: StepCounterReading): StepCount {
    if (this.bootCount !== previous.bootCount) return this.stepsSinceBoot;
    const delta = this.stepsSinceBoot.subtract(previous.stepsSinceBoot);
    return delta.ok ? delta.value : this.stepsSinceBoot;
  }
}
