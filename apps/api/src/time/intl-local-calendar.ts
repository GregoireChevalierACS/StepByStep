import { err, type LocalCalendar, LocalDate, ok, type Result } from '@stepbystep/domain';

export interface UnknownTimeZone {
  readonly kind: 'UnknownTimeZone';
  readonly timeZone: string;
}

const HOUR = 3_600_000;

/**
 * Adapter du port LocalCalendar pour un fuseau IANA (ex. Europe/Paris), via `Intl` intégré
 * à Node : base des fuseaux complète et mise à jour avec Node, heure d'été comprise,
 * sans dépendance.
 */
export class IntlLocalCalendar implements LocalCalendar {
  private constructor(private readonly formatter: Intl.DateTimeFormat) {}

  /** Le fuseau doit exister dans la base IANA (le domaine n'en vérifie que la forme). */
  static for(timeZone: string): Result<IntlLocalCalendar, UnknownTimeZone> {
    try {
      // en-CA : chiffres occidentaux, ordre année-mois-jour.
      const formatter = new Intl.DateTimeFormat('en-CA', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      });
      return ok(new IntlLocalCalendar(formatter));
    } catch {
      return err({ kind: 'UnknownTimeZone', timeZone });
    }
  }

  dateOf(epochMs: number): LocalDate {
    const parts = this.formatter.formatToParts(epochMs);
    const part = (type: Intl.DateTimeFormatPartTypes) =>
      parts.find((candidate) => candidate.type === type)?.value ?? '';
    const date = LocalDate.create(`${part('year')}-${part('month')}-${part('day')}`);
    if (!date.ok) throw new Error(`Date locale illisible pour l'instant ${String(epochMs)}`);
    return date.value;
  }

  /**
   * Premier instant dont la date locale est `date`. Recherche dichotomique plutôt
   * qu'arithmétique de décalages : correcte même quand minuit n'existe pas (passage à
   * l'heure d'été à minuit, ex. America/Santiago). Les décalages UTC vont de -12 h à +14 h :
   * minuit UTC - 15 h tombe toujours la veille, minuit UTC + 15 h jamais avant ce jour.
   */
  startOfDay(date: LocalDate): number {
    const utcMidnight = Date.parse(`${date.toString()}T00:00:00Z`);
    let before = utcMidnight - 15 * HOUR;
    let atOrAfter = utcMidnight + 15 * HOUR;
    while (atOrAfter - before > 1) {
      const middle = before + Math.floor((atOrAfter - before) / 2);
      if (this.dateOf(middle).compareTo(date) < 0) before = middle;
      else atOrAfter = middle;
    }
    return atOrAfter;
  }
}
