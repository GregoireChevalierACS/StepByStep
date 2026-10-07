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

export interface InvalidTakenAt {
  readonly kind: 'InvalidTakenAt';
  readonly value: number;
}

export type StepCounterReadingError = InvalidStepsSinceBoot | InvalidBootCount | InvalidTakenAt;

/**
 * Relevé du capteur matériel TYPE_STEP_COUNTER : nombre de pas cumulés depuis
 * le démarrage du téléphone, numéro de ce démarrage (Settings.Global.BOOT_COUNT)
 * et instant du relevé en millisecondes epoch (sans fuseau).
 */
export class StepCounterReading {
  private constructor(
    readonly stepsSinceBoot: StepCount,
    readonly bootCount: number,
    readonly takenAt: number,
  ) {}

  static create(props: {
    stepsSinceBoot: number;
    bootCount: number;
    takenAt: number;
  }): Result<StepCounterReading, StepCounterReadingError> {
    const steps = StepCount.create(props.stepsSinceBoot);
    if (!steps.ok) return err({ kind: 'InvalidStepsSinceBoot', cause: steps.error });
    if (!Number.isInteger(props.bootCount) || props.bootCount < 0) {
      return err({ kind: 'InvalidBootCount', value: props.bootCount });
    }
    if (!Number.isInteger(props.takenAt) || props.takenAt < 0) {
      return err({ kind: 'InvalidTakenAt', value: props.takenAt });
    }
    return ok(new StepCounterReading(steps.value, props.bootCount, props.takenAt));
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
