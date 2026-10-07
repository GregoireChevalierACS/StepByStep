import { LocalDate } from '../model/LocalDate';
import type { LocalCalendar } from '../ports/LocalCalendar';
import { unwrap } from './unwrap';

const MS_PER_MINUTE = 60 * 1000;

// Calendrier de test à décalage UTC fixe (ex. 120 = Paris en heure d'été), sans changement d'heure.
export class FixedOffsetCalendar implements LocalCalendar {
  constructor(private readonly offsetMinutes: number) {}

  dateOf(epochMs: number): LocalDate {
    const local = new Date(epochMs + this.offsetMinutes * MS_PER_MINUTE);
    return unwrap(LocalDate.create(local.toISOString().slice(0, 10)));
  }

  startOfDay(date: LocalDate): number {
    return Date.parse(`${date.toString()}T00:00:00Z`) - this.offsetMinutes * MS_PER_MINUTE;
  }
}
