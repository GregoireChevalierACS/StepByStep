import { err, ok, type Result } from '../shared/Result';

export interface InvalidLocalDate {
  readonly kind: 'InvalidLocalDate';
  readonly value: string;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Jour du calendrier, sans heure ni fuseau (« 2026-10-06 »). Les calculs passent
 * par UTC uniquement comme arithmétique de calendrier : aucun fuseau n'intervient.
 */
export class LocalDate {
  private constructor(private readonly iso: string) {}

  static create(value: string): Result<LocalDate, InvalidLocalDate> {
    if (!ISO_DATE.test(value)) return err({ kind: 'InvalidLocalDate', value });
    const utc = new Date(`${value}T00:00:00Z`);
    if (Number.isNaN(utc.getTime()) || utc.toISOString().slice(0, 10) !== value) {
      return err({ kind: 'InvalidLocalDate', value });
    }
    return ok(new LocalDate(value));
  }

  next(): LocalDate {
    const nextDay = new Date(Date.parse(`${this.iso}T00:00:00Z`) + MS_PER_DAY);
    return new LocalDate(nextDay.toISOString().slice(0, 10));
  }

  equals(other: LocalDate): boolean {
    return this.iso === other.iso;
  }

  toString(): string {
    return this.iso;
  }
}
