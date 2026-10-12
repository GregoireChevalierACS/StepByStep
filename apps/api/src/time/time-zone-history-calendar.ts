import {
  type LocalCalendar,
  type LocalDate,
  ok,
  type Result,
  type TimeZoneHistory,
} from '@stepbystep/domain';
import { IntlLocalCalendar, type UnknownTimeZone } from './intl-local-calendar.js';

/**
 * Calendrier d'un appareil qui a pu voyager : chaque instant est situé dans le fuseau en
 * vigueur à cet instant (TimeZoneHistory du domaine). Le début d'un jour est calculé dans
 * le fuseau en vigueur ce jour-là (repère : midi UTC) ; le jour même d'un changement de
 * fuseau, c'est une approximation acceptée (ADR 0002).
 */
export class TimeZoneHistoryCalendar implements LocalCalendar {
  private constructor(
    private readonly history: TimeZoneHistory,
    private readonly calendars: ReadonlyMap<string, IntlLocalCalendar>,
  ) {}

  /** Vérifie dès la construction que chaque fuseau de l'historique existe (base IANA). */
  static for(history: TimeZoneHistory): Result<TimeZoneHistoryCalendar, UnknownTimeZone> {
    const calendars = new Map<string, IntlLocalCalendar>();
    for (const { timeZone } of history.periods) {
      if (calendars.has(timeZone)) continue;
      const calendar = IntlLocalCalendar.for(timeZone);
      if (!calendar.ok) return calendar;
      calendars.set(timeZone, calendar.value);
    }
    return ok(new TimeZoneHistoryCalendar(history, calendars));
  }

  dateOf(epochMs: number): LocalDate {
    return this.calendarAt(epochMs).dateOf(epochMs);
  }

  startOfDay(date: LocalDate): number {
    return this.calendarAt(Date.parse(`${date.toString()}T12:00:00Z`)).startOfDay(date);
  }

  private calendarAt(epochMs: number): IntlLocalCalendar {
    const calendar = this.calendars.get(this.history.timeZoneAt(epochMs));
    // Toujours présent : chaque fuseau de l'historique a été chargé dans `for`.
    if (!calendar) throw new Error('Fuseau absent du calendrier : incohérence interne.');
    return calendar;
  }
}
