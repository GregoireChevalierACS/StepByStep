import { LocalDate } from '@stepbystep/domain';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { unwrap } from '../testing/unwrap.js';
import { IntlLocalCalendar } from './intl-local-calendar.js';

const calendar = (timeZone: string) => unwrap(IntlLocalCalendar.for(timeZone));
const day = (iso: string) => unwrap(LocalDate.create(iso));
const HOUR = 3_600_000;

describe('IntlLocalCalendar', () => {
  describe('jour local d’un instant', () => {
    it.each([
      ['Europe/Paris', '2026-10-11T22:30:00Z', '2026-10-12'], // déjà le 12 à Paris (UTC+2)
      ['UTC', '2026-10-11T22:30:00Z', '2026-10-11'],
      ['America/New_York', '2026-10-12T02:00:00Z', '2026-10-11'], // encore le 11 à New York
      ['Asia/Kolkata', '2026-10-11T18:30:00Z', '2026-10-12'], // UTC+5:30, pile minuit
      ['Pacific/Chatham', '2026-10-11T11:15:00Z', '2026-10-12'], // UTC+13:45
    ])('dans le fuseau %s, %s tombe le %s', (timeZone, instant, expected) => {
      expect(calendar(timeZone).dateOf(Date.parse(instant)).toString()).toBe(expected);
    });
  });

  describe('début d’un jour local', () => {
    it.each([
      ['Europe/Paris', '2026-07-14', '2026-07-13T22:00:00Z'], // été : UTC+2
      ['Europe/Paris', '2026-12-25', '2026-12-24T23:00:00Z'], // hiver : UTC+1
      ['America/New_York', '2026-10-12', '2026-10-12T04:00:00Z'],
      ['Asia/Kolkata', '2026-10-12', '2026-10-11T18:30:00Z'],
      // Chili : passage à l'heure d'été à minuit, minuit n'existe pas, le jour commence à 01:00.
      ['America/Santiago', '2026-09-06', '2026-09-06T04:00:00Z'],
    ])('dans le fuseau %s, le %s commence à %s', (timeZone, date, expected) => {
      expect(calendar(timeZone).startOfDay(day(date))).toBe(Date.parse(expected));
    });

    it.each([
      ['2026-03-29', 23], // passage à l'heure d'été : journée de 23 h
      ['2026-10-25', 25], // retour à l'heure d'hiver : journée de 25 h
      ['2026-10-12', 24],
    ])('à Paris, le %s dure %i heures', (date, hours) => {
      const paris = calendar('Europe/Paris');
      const start = paris.startOfDay(day(date));
      const end = paris.startOfDay(day(date).next());

      expect((end - start) / HOUR).toBe(hours);
    });
  });

  it('le début d’un jour appartient à ce jour, et l’instant d’avant à la veille', () => {
    const zones = [
      'UTC',
      'Europe/Paris',
      'America/New_York',
      'America/Santiago',
      'Asia/Kolkata',
      'Pacific/Chatham',
    ];
    const anyDay = fc
      .integer({ min: 0, max: 3 * 365 })
      .map((offset) =>
        new Date(Date.UTC(2026, 0, 1) + offset * 24 * HOUR).toISOString().slice(0, 10),
      );

    fc.assert(
      fc.property(fc.constantFrom(...zones), anyDay, (timeZone, iso) => {
        const zone = calendar(timeZone);
        const start = zone.startOfDay(day(iso));

        expect(zone.dateOf(start).toString()).toBe(iso);
        expect(zone.dateOf(start - 1).toString()).toBe(day(iso).previous().toString());
      }),
    );
  });

  it('refuse un fuseau qui n’existe pas dans la base IANA', () => {
    expect(IntlLocalCalendar.for('Mars/Olympus')).toEqual({
      ok: false,
      error: { kind: 'UnknownTimeZone', timeZone: 'Mars/Olympus' },
    });
  });
});
