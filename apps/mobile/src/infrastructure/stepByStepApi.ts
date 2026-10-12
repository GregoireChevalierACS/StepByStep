import type { StepCounterReading } from '@stepbystep/domain';

import type { ApiResponse, TimeZoneChange } from '../application/ReadingSync';

/**
 * Adresse de l'API vue depuis le téléphone. En développement, `adb reverse tcp:3000 tcp:3000`
 * redirige le port 3000 du téléphone vers celui du PC à travers ADB Wi-Fi : aucune IP codée en
 * dur, aucune règle de pare-feu. Le trafic HTTP en clair n'est autorisé que dans le build debug.
 */
const API_URL = 'http://localhost:3000';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

async function request(path: string, body?: unknown): Promise<ApiResponse> {
  const response = await fetch(`${API_URL}${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const text = await response.text();
  return { status: response.status, body: text === '' ? null : (JSON.parse(text) as unknown) };
}

/** Erreur HTTP inattendue, avec le corps reçu (Problem Details de l'API). */
export class ApiError extends Error {
  constructor(readonly response: ApiResponse) {
    super(`HTTP ${String(response.status)} : ${JSON.stringify(response.body)}`);
  }
}

export function checkHealth(): Promise<ApiResponse> {
  return request('/v1/health');
}

/** Crée un compte et son appareil (sans authentification en phase 8a). */
export async function registerDevice(): Promise<string> {
  const response = await request('/v1/devices', {});
  const deviceId = isRecord(response.body) ? response.body['deviceId'] : undefined;
  if (response.status !== 201 || typeof deviceId !== 'string') throw new ApiError(response);
  return deviceId;
}

/**
 * Mapper domaine → contrat HTTP : les instants voyagent en ISO 8601, le domaine les garde
 * en millisecondes epoch.
 */
export function sendReadings(
  deviceId: string,
  readings: readonly StepCounterReading[],
  timeZoneChanges: readonly TimeZoneChange[],
): Promise<ApiResponse> {
  return request(`/v1/devices/${encodeURIComponent(deviceId)}/readings`, {
    readings: readings.map((reading) => ({
      stepsSinceBoot: reading.stepsSinceBoot.value,
      bootCount: reading.bootCount,
      takenAt: new Date(reading.takenAt).toISOString(),
    })),
    ...(timeZoneChanges.length === 0
      ? {}
      : {
          timeZoneChanges: timeZoneChanges.map(({ timeZone, since }) => ({
            timeZone,
            since: new Date(since).toISOString(),
          })),
        }),
  });
}
