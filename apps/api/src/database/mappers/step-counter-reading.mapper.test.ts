import { StepCounterReading } from '@stepbystep/domain';
import { describe, expect, it } from 'vitest';
import { unwrap } from '../../testing/unwrap.js';
import { readingToDomain, readingToRow } from './step-counter-reading.mapper.js';

const DEVICE_ID = '0b9a1c2e-4f5d-4a6b-8c7d-9e0f1a2b3c4d';
const TAKEN_AT = Date.parse('2026-10-12T07:30:00.123Z');

describe('mapper des relevés du compteur de pas', () => {
  it('traduit un relevé du domaine en ligne de base (instant epoch → Date)', () => {
    const reading = unwrap(
      StepCounterReading.create({ stepsSinceBoot: 4200, bootCount: 7, takenAt: TAKEN_AT }),
    );

    expect(readingToRow(DEVICE_ID, reading)).toEqual({
      deviceId: DEVICE_ID,
      takenAt: new Date(TAKEN_AT),
      bootCount: 7,
      stepsSinceBoot: 4200,
    });
  });

  it('reconstruit le relevé du domaine à partir d’une ligne', () => {
    const reading = unwrap(
      readingToDomain({
        deviceId: DEVICE_ID,
        takenAt: new Date(TAKEN_AT),
        bootCount: 7,
        stepsSinceBoot: 4200,
      }),
    );

    expect(reading.takenAt).toBe(TAKEN_AT);
    expect(reading.bootCount).toBe(7);
    expect(reading.stepsSinceBoot.value).toBe(4200);
  });

  it('signale une ligne corrompue plutôt que de créer un relevé invalide', () => {
    expect(
      readingToDomain({
        deviceId: DEVICE_ID,
        takenAt: new Date(TAKEN_AT),
        bootCount: 7,
        stepsSinceBoot: -1,
      }),
    ).toMatchObject({ ok: false, error: { kind: 'InvalidStepsSinceBoot' } });
  });
});
