import { err, ok, type Result } from '../shared/Result';

export interface InvalidTimeZone {
  readonly kind: 'InvalidTimeZone';
  readonly value: string;
}

export interface InvalidPeriodStart {
  readonly kind: 'InvalidPeriodStart';
  readonly value: number;
}

export type TimeZonePeriodError = InvalidTimeZone | InvalidPeriodStart;

// Forme d'un identifiant IANA : « UTC », « Europe/Paris », « America/Argentina/Buenos_Aires ».
// Le domaine ne vérifie que la forme : savoir si le fuseau existe et appliquer ses
// règles (heure d'été, décalage) est le rôle de l'adapter LocalCalendar.
const IANA_TIME_ZONE = /^[A-Za-z0-9_+-]+(\/[A-Za-z0-9_+-]+)*$/;

/** Fuseau horaire de l'appareil, en vigueur à partir d'un instant (millisecondes epoch). */
export class TimeZonePeriod {
  private constructor(
    readonly timeZone: string,
    readonly since: number,
  ) {}

  static create(props: {
    timeZone: string;
    since: number;
  }): Result<TimeZonePeriod, TimeZonePeriodError> {
    if (!IANA_TIME_ZONE.test(props.timeZone)) {
      return err({ kind: 'InvalidTimeZone', value: props.timeZone });
    }
    if (!Number.isInteger(props.since) || props.since < 0) {
      return err({ kind: 'InvalidPeriodStart', value: props.since });
    }
    return ok(new TimeZonePeriod(props.timeZone, props.since));
  }
}
