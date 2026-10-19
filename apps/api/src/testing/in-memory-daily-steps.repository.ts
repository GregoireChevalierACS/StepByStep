import type { DailySteps, LocalDate } from '@stepbystep/domain';
import type { DailyStepsRepository } from '../daily-steps/daily-steps.repository.js';

/** Adapter en mémoire de DailyStepsRepository, pour les tests unitaires (tenu par le contrat). */
export class InMemoryDailyStepsRepository implements DailyStepsRepository {
  private readonly days = new Map<string, Map<string, DailySteps>>();

  /** Prépare des données, comme les écrirait le cas d'usage d'envoi des relevés. */
  given(deviceId: string, days: readonly DailySteps[]): void {
    const known = this.days.get(deviceId) ?? new Map<string, DailySteps>();
    for (const daily of days) known.set(daily.date.toString(), daily);
    this.days.set(deviceId, known);
  }

  between(deviceId: string, from: LocalDate, to: LocalDate): Promise<DailySteps[]> {
    const days = [...(this.days.get(deviceId)?.values() ?? [])]
      .filter(({ date }) => date.compareTo(from) >= 0 && date.compareTo(to) <= 0)
      .sort((a, b) => a.date.compareTo(b.date));
    return Promise.resolve(days);
  }
}
