import type { StepCounterReading } from '@stepbystep/domain';

/** Réponse HTTP brute : statut et corps JSON, affichés tels quels par l'écran. */
export interface ApiResponse {
  readonly status: number;
  readonly body: unknown;
}

/** Nouvelle période de fuseau de l'appareil (identifiant IANA + instant epoch ms de début). */
export interface TimeZoneChange {
  readonly timeZone: string;
  readonly since: number;
}

/** Ports de l'envoi : implémentés par l'adapter HTTP et par l'horloge de l'appareil. */
export interface ReadingSyncPorts {
  registerDevice(): Promise<string>;
  sendReadings(
    deviceId: string,
    readings: readonly StepCounterReading[],
    timeZoneChanges: readonly TimeZoneChange[],
  ): Promise<ApiResponse>;
  currentTimeZone(): string;
}

/**
 * Envoi des relevés au serveur. L'appareil est enregistré au premier envoi, et le fuseau
 * n'est transmis qu'au premier envoi ou quand il a changé (ADR 0002, décision 6).
 *
 * Version minimale : l'identifiant de l'appareil n'est gardé qu'en mémoire (un nouvel appareil
 * à chaque lancement de l'app) et le changement de fuseau est daté du relevé qui le constate,
 * pas de l'événement Android ACTION_TIMEZONE_CHANGED.
 */
export class ReadingSync {
  private deviceId: string | undefined;
  private lastSentTimeZone: string | undefined;

  constructor(private readonly ports: ReadingSyncPorts) {}

  async send(reading: StepCounterReading): Promise<ApiResponse> {
    this.deviceId ??= await this.ports.registerDevice();
    const timeZone = this.ports.currentTimeZone();
    const timeZoneChanges =
      timeZone === this.lastSentTimeZone ? [] : [{ timeZone, since: reading.takenAt }];

    const response = await this.ports.sendReadings(this.deviceId, [reading], timeZoneChanges);
    // Le fuseau n'est considéré comme connu du serveur que si l'envoi a réussi.
    if (response.status >= 200 && response.status < 300) this.lastSentTimeZone = timeZone;
    return response;
  }
}
