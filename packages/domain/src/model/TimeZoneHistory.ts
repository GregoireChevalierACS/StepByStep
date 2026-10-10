import { err, ok, type Result } from '../shared/Result';
import type { TimeZonePeriod } from './TimeZonePeriod';

export interface EmptyTimeZoneHistory {
  readonly kind: 'EmptyTimeZoneHistory';
}

export interface ConflictingTimeZonePeriods {
  readonly kind: 'ConflictingTimeZonePeriods';
  readonly since: number;
  readonly timeZones: readonly [string, string];
}

export type TimeZoneHistoryError = EmptyTimeZoneHistory | ConflictingTimeZonePeriods;

// Ordre total et indépendant de la locale : par instant, puis par identifiant de fuseau.
const chronologically = (a: TimeZonePeriod, b: TimeZonePeriod): number => {
  if (a.since !== b.since) return a.since - b.since;
  // Stryker disable next-line ConditionalExpression: équivalent, deux périodes égales (même instant, même fuseau) sont interchangeables dans le tri.
  if (a.timeZone === b.timeZone) return 0;
  // Stryker disable next-line EqualityOperator: équivalent, l'égalité est déjà traitée à la ligne précédente.
  return a.timeZone < b.timeZone ? -1 : 1;
};

/**
 * Trie les périodes, ignore les doublons et ne garde que les changements de fuseau.
 * Deux fuseaux différents au même instant sont une contradiction.
 */
const onlyChanges = (
  periods: readonly TimeZonePeriod[],
): Result<TimeZonePeriod[], ConflictingTimeZonePeriods> => {
  const sorted = [...periods].sort(chronologically);
  const changes: TimeZonePeriod[] = [];
  let previous: TimeZonePeriod | undefined;
  for (const period of sorted) {
    // On compare à la période précédente dans l'ordre trié, pas à la dernière gardée :
    // une contradiction ne doit pas être masquée par la fusion d'une période redondante.
    if (previous?.since === period.since && previous.timeZone !== period.timeZone) {
      return err({
        kind: 'ConflictingTimeZonePeriods',
        since: period.since,
        timeZones: [previous.timeZone, period.timeZone],
      });
    }
    if (changes.at(-1)?.timeZone !== period.timeZone) changes.push(period);
    previous = period;
  }
  return ok(changes);
};

/**
 * Historique des fuseaux de l'appareil, enregistré seulement quand il change.
 * Jamais vide : le type de `periods` le garantit.
 */
export class TimeZoneHistory {
  private constructor(readonly periods: readonly [TimeZonePeriod, ...TimeZonePeriod[]]) {}

  /** Construit l'historique à partir de périodes reçues dans n'importe quel ordre, doublons compris. */
  static from(periods: readonly TimeZonePeriod[]): Result<TimeZoneHistory, TimeZoneHistoryError> {
    const changes = onlyChanges(periods);
    if (!changes.ok) return changes;
    const [first, ...others] = changes.value;
    if (!first) return err({ kind: 'EmptyTimeZoneHistory' });
    return ok(new TimeZoneHistory([first, ...others]));
  }

  /** Fuseau en vigueur à cet instant ; avant la première période, le premier fuseau connu. */
  timeZoneAt(instant: number): string {
    let inEffect = this.periods[0];
    for (const period of this.periods) {
      if (period.since > instant) break;
      inEffect = period;
    }
    return inEffect.timeZone;
  }

  /** Enregistre un changement de fuseau ; sans effet si le fuseau en vigueur est le même. */
  record(period: TimeZonePeriod): Result<TimeZoneHistory, TimeZoneHistoryError> {
    return TimeZoneHistory.from([...this.periods, period]);
  }
}
