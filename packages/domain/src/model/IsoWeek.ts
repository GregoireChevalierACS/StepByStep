import { err, ok, type Result } from '../shared/Result';
import { LocalDate } from './LocalDate';

export interface InvalidIsoWeek {
  readonly kind: 'InvalidIsoWeek';
  readonly value: string;
}

// AAAA-Wss, année à quatre chiffres.
const FORMAT = /^(\d{4})-W(\d{2})$/;

/**
 * Semaine ISO 8601 (« 2026-W45 »), du lundi au dimanche : la période d'un défi entre amis. La
 * semaine 1 est celle qui contient le 4 janvier, et une semaine appartient à l'année de son
 * jeudi : une année a donc 52 ou 53 semaines, et la semaine 1 peut commencer en décembre.
 */
export class IsoWeek {
  private constructor(
    private readonly label: string,
    readonly start: LocalDate,
    readonly end: LocalDate,
  ) {}

  static create(value: string): Result<IsoWeek, InvalidIsoWeek> {
    const match = FORMAT.exec(value);
    // Stryker disable next-line StringLiteral: équivalent, sans correspondance la semaine est refusée juste après.
    const year = match?.[1] ?? '';
    const week = Number(match?.[2]);
    const january4 = LocalDate.create(`${year}-01-04`);
    // Stryker disable next-line ConditionalExpression: équivalent, le 4 janvier d'une année à quatre chiffres existe toujours.
    if (match === null || !january4.ok || week < 1) return err({ kind: 'InvalidIsoWeek', value });

    // Jours écoulés depuis le lundi : getUTCDay() vaut 0 le dimanche, 1 le lundi…
    const sinceMonday = (new Date(`${year}-01-04T00:00:00Z`).getUTCDay() + 6) % 7;
    const monday = january4.value.plusDays(7 * (week - 1) - sinceMonday);
    // La semaine 53 n'existe que si son jeudi est encore dans l'année.
    if (!monday.plusDays(3).toString().startsWith(`${year}-`)) {
      return err({ kind: 'InvalidIsoWeek', value });
    }
    return ok(new IsoWeek(value, monday, monday.plusDays(6)));
  }

  contains(date: LocalDate): boolean {
    return date.compareTo(this.start) >= 0 && date.compareTo(this.end) <= 0;
  }

  toString(): string {
    return this.label;
  }
}
