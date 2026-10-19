import type { TimeZonePeriod } from '@stepbystep/domain';
import type { TimeZoneRepository } from '../time/time-zone.repository.js';

/** Adapter en mémoire de TimeZoneRepository, pour les tests unitaires (tenu par le contrat). */
export class InMemoryTimeZoneRepository implements TimeZoneRepository {
  private readonly periods = new Map<string, TimeZonePeriod[]>();

  /** Prépare des données, comme les écrirait le cas d'usage d'envoi des relevés. */
  given(deviceId: string, periods: readonly TimeZonePeriod[]): void {
    this.periods.set(deviceId, [...(this.periods.get(deviceId) ?? []), ...periods]);
  }

  periodsOf(deviceId: string): Promise<TimeZonePeriod[]> {
    return Promise.resolve([...(this.periods.get(deviceId) ?? [])]);
  }
}
