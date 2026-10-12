import { File, Paths } from 'expo-file-system';

import type { SyncState } from '../application/ReadingSync';

// Dossier « document » de l'app : conservé entre les lancements, effacé à la désinstallation.
const stateFile = () => new File(Paths.document, 'sync-state.json');

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

/** Relit l'état ; un fichier absent ou illisible équivaut à « jamais synchronisé ». */
export async function loadSyncState(): Promise<SyncState | undefined> {
  const file = stateFile();
  if (!file.exists) return undefined;
  let data: unknown;
  try {
    data = JSON.parse(await file.text());
  } catch {
    return undefined;
  }
  if (!isRecord(data) || typeof data['deviceId'] !== 'string') return undefined;
  const lastSentTimeZone = data['lastSentTimeZone'];
  return typeof lastSentTimeZone === 'string'
    ? { deviceId: data['deviceId'], lastSentTimeZone }
    : { deviceId: data['deviceId'] };
}

export function saveSyncState(state: SyncState): Promise<void> {
  const file = stateFile();
  if (!file.exists) file.create();
  file.write(JSON.stringify(state));
  return Promise.resolve();
}
