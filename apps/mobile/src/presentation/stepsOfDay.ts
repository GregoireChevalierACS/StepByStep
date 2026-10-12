import type { ApiResponse } from '../application/ReadingSync';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

/**
 * Jour local (AAAA-MM-JJ) d'un instant dans un fuseau IANA, au format des jours renvoyés
 * par l'API. formatToParts évite de dépendre de l'ordre jour/mois propre à chaque langue.
 */
export function localDay(instant: number, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(instant);
  const date = { year: '', month: '', day: '' };
  for (const { type, value } of parts) {
    if (type === 'year' || type === 'month' || type === 'day') date[type] = value;
  }
  return `${date.year}-${date.month}-${date.day}`;
}

/** Pas du jour donné, s'il fait partie des jours recalculés par ce compte rendu de l'API. */
export function stepsOfDay({ status, body }: ApiResponse, day: string): number | undefined {
  const days: unknown = isRecord(body) ? body['days'] : undefined;
  if (status !== 200 || !Array.isArray(days)) return undefined;
  for (const entry of days) {
    if (isRecord(entry) && entry['day'] === day && typeof entry['steps'] === 'number') {
      return entry['steps'];
    }
  }
  return undefined;
}
