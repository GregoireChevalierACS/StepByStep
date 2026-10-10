import { err, ok, type Result } from '../shared/Result';

export interface InvalidLocalDate {
  readonly kind: 'InvalidLocalDate';
  readonly value: string;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Jour du calendrier, sans heure ni fuseau (« 2026-10-06 »). Les calculs passent
 * par UTC uniquement comme arithmétique de calendrier : aucun fuseau n'intervient.
 */
export class LocalDate {
  private constructor(private readonly iso: string) {}

  static create(value: string): Result<LocalDate, InvalidLocalDate> {
    // Aller-retour : seule une date réelle, écrite exactement AAAA-MM-JJ, redonne la
    // même chaîne. Cela rejette les formats approchants comme les dates impossibles.
    const utc = new Date(`${value}T00:00:00Z`);
    if (Number.isNaN(utc.getTime()) || utc.toISOString().slice(0, 10) !== value) {
      return err({ kind: 'InvalidLocalDate', value });
    }
    return ok(new LocalDate(value));
  }

  next(): LocalDate {
    return this.plusDays(1);
  }

  previous(): LocalDate {
    return this.plusDays(-1);
  }

  private plusDays(days: number): LocalDate {
    const day = new Date(Date.parse(`${this.iso}T00:00:00Z`) + days * MS_PER_DAY);
    return new LocalDate(day.toISOString().slice(0, 10));
  }

  equals(other: LocalDate): boolean {
    return this.iso === other.iso;
  }

  /** Négatif si cette date est avant l'autre, positif si après, zéro si égales (pour `sort`). */
  compareTo(other: LocalDate): number {
    // Le format ISO AAAA-MM-JJ, à largeur fixe, se trie comme du texte.
    if (this.iso === other.iso) return 0;
    // Stryker disable next-line EqualityOperator: équivalent, l'égalité est déjà traitée à la ligne précédente.
    return this.iso < other.iso ? -1 : 1;
  }

  toString(): string {
    return this.iso;
  }
}
