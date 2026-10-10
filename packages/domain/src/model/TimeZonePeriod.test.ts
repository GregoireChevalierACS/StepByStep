import { describe, expect, it } from 'vitest';
import { unwrap } from '../testing/unwrap';
import { TimeZonePeriod } from './TimeZonePeriod';

const SINCE = Date.parse('2026-10-09T08:00:00Z');

describe('TimeZonePeriod', () => {
  it.each([
    'Europe/Paris',
    'UTC',
    'America/Argentina/Buenos_Aires',
    'Etc/GMT+2',
    'America/Port-au-Prince',
  ])('accepte un identifiant de fuseau IANA : %s', (timeZone) => {
    const period = unwrap(TimeZonePeriod.create({ timeZone, since: SINCE }));

    expect(period.timeZone).toBe(timeZone);
    expect(period.since).toBe(SINCE);
  });

  it.each(['', ' ', 'Europe Paris', 'Europe//Paris', '/Paris', 'Europe/'])(
    'refuse un identifiant de fuseau mal formé : "%s"',
    (timeZone) => {
      expect(TimeZonePeriod.create({ timeZone, since: SINCE })).toEqual({
        ok: false,
        error: { kind: 'InvalidTimeZone', value: timeZone },
      });
    },
  );

  it('accepte zéro comme instant de début (borne incluse)', () => {
    expect(unwrap(TimeZonePeriod.create({ timeZone: 'UTC', since: 0 })).since).toBe(0);
  });

  it.each([-1, 1.5, Number.NaN])('refuse un instant de début invalide : %s', (since) => {
    expect(TimeZonePeriod.create({ timeZone: 'Europe/Paris', since })).toEqual({
      ok: false,
      error: { kind: 'InvalidPeriodStart', value: since },
    });
  });
});
