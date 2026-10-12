import { NativeModule, requireNativeModule } from 'expo';

/** Valeurs brutes renvoyées par le module Kotlin, avant validation par le domaine. */
export interface RawStepCounterValue {
  readonly stepsSinceBoot: number;
  readonly bootCount: number;
}

declare class StepCounterNativeModule extends NativeModule {
  readAsync(): Promise<RawStepCounterValue>;
}

// Charge le module natif « StepCounter » (déclaré dans expo-module.config.json) via JSI.
export const StepCounter = requireNativeModule<StepCounterNativeModule>('StepCounter');
