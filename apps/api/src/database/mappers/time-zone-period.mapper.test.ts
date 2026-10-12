import { TimeZonePeriod } from '@stepbystep/domain';
import { describe, expect, it } from 'vitest';
import { unwrap } from '../../testing/unwrap.js';
import { periodToDomain, periodToRow } from './time-zone-period.mapper.js';

const DEVICE_ID = '0b9a1c2e-4f5d-4a6b-8c7d-9e0f1a2b3c4d';
const SINCE = Date.parse('2026-10-10T14:00:00Z');

describe('mapper des périodes de fuseau', () => {
  it('traduit une période du domaine en ligne de base', () => {
    const period = unwrap(TimeZonePeriod.create({ timeZone: 'America/New_York', since: SINCE }));

    expect(periodToRow(DEVICE_ID, period)).toEqual({
      deviceId: DEVICE_ID,
      validFrom: new Date(SINCE),
      timeZone: 'America/New_York',
    });
  });

  it('reconstruit la période du domaine à partir d’une ligne', () => {
    const period = unwrap(
      periodToDomain({ deviceId: DEVICE_ID, validFrom: new Date(SINCE), timeZone: 'Europe/Paris' }),
    );

    expect(period.since).toBe(SINCE);
    expect(period.timeZone).toBe('Europe/Paris');
  });

  it('signale un fuseau corrompu en base', () => {
    expect(
      periodToDomain({ deviceId: DEVICE_ID, validFrom: new Date(SINCE), timeZone: 'Europe Paris' }),
    ).toMatchObject({ ok: false, error: { kind: 'InvalidTimeZone' } });
  });
});
