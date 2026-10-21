import type { SyncState } from './ReadingSync';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Relit l'état de synchronisation sauvegardé. Illisible, mal formé ou d'avant
 * l'authentification (sans secret) : `undefined`, comme un appareil jamais enregistré ; l'app
 * s'enregistre alors de nouveau.
 */
export const parseSyncState = (raw: string): SyncState | undefined => {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return undefined;
  }
  if (!isRecord(data)) return undefined;
  const { deviceId, secret, lastSentTimeZone } = data;
  if (typeof deviceId !== 'string' || typeof secret !== 'string') return undefined;
  return typeof lastSentTimeZone === 'string'
    ? { deviceId, secret, lastSentTimeZone }
    : { deviceId, secret };
};
