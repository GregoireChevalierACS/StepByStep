import { LocalDate, StepCount } from '@stepbystep/domain';
import { describe, expect, it } from 'vitest';
import { unwrap } from '../../testing/unwrap.js';
import { dailyStepsToDomain, dailyStepsToRow } from './daily-steps.mapper.js';

const DEVICE_ID = '0b9a1c2e-4f5d-4a6b-8c7d-9e0f1a2b3c4d';

describe('mapper des pas par jour', () => {
  it('traduit les pas d’un jour du domaine en ligne de base', () => {
    const daily = {
      date: unwrap(LocalDate.create('2026-10-12')),
      steps: unwrap(StepCount.create(8_500)),
    };

    expect(dailyStepsToRow(DEVICE_ID, daily)).toEqual({
      deviceId: DEVICE_ID,
      day: '2026-10-12',
      steps: 8_500,
    });
  });

  it('reconstruit les pas d’un jour du domaine à partir d’une ligne', () => {
    const daily = unwrap(
      dailyStepsToDomain({ deviceId: DEVICE_ID, day: '2026-10-12', steps: 8_500 }),
    );

    expect(daily.date.toString()).toBe('2026-10-12');
    expect(daily.steps.value).toBe(8_500);
  });

  it.each([
    [{ day: '2026-13-01', steps: 8_500 }, 'InvalidLocalDate'],
    [{ day: '2026-10-12', steps: -5 }, 'NegativeStepCount'],
  ])('signale une ligne corrompue : %j', (row, kind) => {
    expect(dailyStepsToDomain({ deviceId: DEVICE_ID, ...row })).toMatchObject({
      ok: false,
      error: { kind },
    });
  });
});
