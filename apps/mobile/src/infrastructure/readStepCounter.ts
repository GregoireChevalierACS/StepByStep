import {
  err,
  StepCounterReading,
  type Result,
  type StepCounterReadingError,
} from '@stepbystep/domain';
import { PermissionsAndroid } from 'react-native';

import { StepCounter } from '../../modules/step-counter';

export interface ActivityRecognitionDenied {
  readonly kind: 'ActivityRecognitionDenied';
}

export type ReadStepCounterError = ActivityRecognitionDenied | StepCounterReadingError;

/**
 * Prend un relevé du capteur de pas : permission à l'exécution, lecture native, puis
 * validation par le domaine. L'horloge est injectée pour garder l'instant du relevé testable.
 */
export async function readStepCounter(
  now: () => number = Date.now,
): Promise<Result<StepCounterReading, ReadStepCounterError>> {
  const permission = await PermissionsAndroid.request(
    PermissionsAndroid.PERMISSIONS.ACTIVITY_RECOGNITION,
  );
  if (permission !== PermissionsAndroid.RESULTS.GRANTED) {
    return err({ kind: 'ActivityRecognitionDenied' });
  }
  const { stepsSinceBoot, bootCount } = await StepCounter.readAsync();
  return StepCounterReading.create({ stepsSinceBoot, bootCount, takenAt: now() });
}
