import type { LocalDate } from '../model/LocalDate';

/**
 * Calendrier local du téléphone. Le domaine ne connaît pas les fuseaux horaires :
 * l'adapter traduit un instant (millisecondes epoch) en jour local et inversement,
 * en gérant le fuseau et les changements d'heure.
 */
export interface LocalCalendar {
  /** Jour local qui contient cet instant. */
  dateOf(epochMs: number): LocalDate;
  /** Instant de minuit, heure locale, au début de ce jour. */
  startOfDay(date: LocalDate): number;
}
