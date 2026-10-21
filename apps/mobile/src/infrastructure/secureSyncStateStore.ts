import { File, Paths } from 'expo-file-system';
import * as SecureStore from 'expo-secure-store';

import type { SyncState } from '../application/ReadingSync';
import { parseSyncState } from '../application/syncState';

const KEY = 'sync-state';

// Ancien emplacement, en clair, d'avant l'authentification : supprimé à la première lecture.
const legacyFile = () => new File(Paths.document, 'sync-state.json');

/**
 * État de synchronisation dans le stockage chiffré du système (Keystore Android) : il contient
 * le secret de l'appareil, qui ne doit pas rester en clair dans un fichier.
 */
export async function loadSyncState(): Promise<SyncState | undefined> {
  const legacy = legacyFile();
  if (legacy.exists) legacy.delete();
  const raw = await SecureStore.getItemAsync(KEY);
  return raw === null ? undefined : parseSyncState(raw);
}

export async function saveSyncState(state: SyncState): Promise<void> {
  await SecureStore.setItemAsync(KEY, JSON.stringify(state));
}
