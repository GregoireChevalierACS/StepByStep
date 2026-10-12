import { LocalDate, TimeZoneHistory, TimeZonePeriod } from '@stepbystep/domain';
import { describe, expect, it } from 'vitest';
import { unwrap } from '../testing/unwrap.js';
import { IntlLocalCalendar } from './intl-local-calendar.js';
import { TimeZoneHistoryCalendar } from './time-zone-history-calendar.js';

const period = (timeZone: string, since: string) =>
  unwrap(TimeZonePeriod.create({ timeZone, since: Date.parse(since) }));
const history = (...periods: TimeZonePeriod[]) => unwrap(TimeZoneHistory.from(periods));
const day = (iso: string) => unwrap(LocalDate.create(iso));

// Voyage : Paris, puis New York à partir du 10 octobre 2026 à 14 h UTC.
const trip = () =>
  unwrap(
    TimeZoneHistoryCalendar.for(
      history(
        period('Europe/Paris', '2026-01-01T00:00:00Z'),
        period('America/New_York', '2026-10-10T14:00:00Z'),
      ),
    ),
  );

describe('TimeZoneHistoryCalendar', () => {
  it('se comporte comme le calendrier du fuseau unique de l’historique', () => {
    const single = unwrap(
      TimeZoneHistoryCalendar.for(history(period('Europe/Paris', '2026-01-01T00:00:00Z'))),
    );
    const paris = unwrap(IntlLocalCalendar.for('Europe/Paris'));
    const instant = Date.parse('2026-10-11T22:30:00Z');

    expect(single.dateOf(instant)).toEqual(paris.dateOf(instant));
    expect(single.startOfDay(day('2026-10-12'))).toBe(paris.startOfDay(day('2026-10-12')));
  });

  it.each([
    ['2026-10-09T22:30:00Z', '2026-10-10'], // avant le voyage : heure de Paris
    ['2026-10-12T02:00:00Z', '2026-10-11'], // après : heure de New York
  ])('situe %s dans le jour local du fuseau en vigueur : %s', (instant, expected) => {
    expect(trip().dateOf(Date.parse(instant)).toString()).toBe(expected);
  });

  it.each([
    ['2026-10-08', '2026-10-07T22:00:00Z'], // minuit à Paris
    ['2026-10-12', '2026-10-12T04:00:00Z'], // minuit à New York
  ])(
    'fait commencer le %s à minuit dans le fuseau en vigueur ce jour-là : %s',
    (date, expected) => {
      expect(trip().startOfDay(day(date))).toBe(Date.parse(expected));
    },
  );

  it('refuse un historique contenant un fuseau inconnu de la base IANA', () => {
    expect(
      TimeZoneHistoryCalendar.for(
        history(
          period('Europe/Paris', '2026-01-01T00:00:00Z'),
          period('Mars/Olympus', '2026-10-10T00:00:00Z'),
        ),
      ),
    ).toEqual({ ok: false, error: { kind: 'UnknownTimeZone', timeZone: 'Mars/Olympus' } });
  });
});
