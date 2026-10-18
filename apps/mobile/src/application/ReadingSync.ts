import type { StepCounterReading } from '@stepbystep/domain';

/** Réponse HTTP brute : statut et corps JSON, affichés tels quels par l'écran. */
export interface ApiResponse {
  readonly status: number;
  readonly body: unknown;
}

/**
 * Type de problème (RFC 9457) que renvoie l'API pour un appareil qu'elle ne connaît pas
 * (voir docs/problems.md). C'est lui qui est testé, pas le statut 404 seul.
 */
export const UNKNOWN_DEVICE_PROBLEM_TYPE =
  'https://github.com/GregoireChevalierACS/StepByStep/blob/main/docs/problems.md#device-not-found';

const isUnknownDevice = ({ status, body }: ApiResponse): boolean =>
  status === 404 &&
  typeof body === 'object' &&
  body !== null &&
  'type' in body &&
  body.type === UNKNOWN_DEVICE_PROBLEM_TYPE;

/** Nouvelle période de fuseau de l'appareil (identifiant IANA + instant epoch ms de début). */
export interface TimeZoneChange {
  readonly timeZone: string;
  readonly since: number;
}

/** Ce que l'app retient entre deux lancements pour la synchronisation. */
export interface SyncState {
  readonly deviceId: string;
  /** Dernier fuseau confirmé par le serveur ; absent tant qu'aucun envoi n'a réussi. */
  readonly lastSentTimeZone?: string;
}

/** Ports de l'envoi : API HTTP, stockage local et fuseau de l'appareil. */
export interface ReadingSyncPorts {
  registerDevice(): Promise<string>;
  sendReadings(
    deviceId: string,
    readings: readonly StepCounterReading[],
    timeZoneChanges: readonly TimeZoneChange[],
  ): Promise<ApiResponse>;
  loadState(): Promise<SyncState | undefined>;
  saveState(state: SyncState): Promise<void>;
  currentTimeZone(): string;
}

/**
 * Envoi des relevés au serveur. L'appareil est enregistré au premier envoi puis retenu entre
 * deux lancements de l'app : tous les relevés du téléphone alimentent le même historique.
 * Le fuseau n'est transmis qu'au premier envoi ou quand il a changé (ADR 0002, décision 6).
 *
 * Version minimale : le changement de fuseau est daté du relevé qui le constate, pas de
 * l'événement Android ACTION_TIMEZONE_CHANGED.
 */
export class ReadingSync {
  private state: SyncState | undefined;
  private loaded = false;

  constructor(private readonly ports: ReadingSyncPorts) {}

  async send(reading: StepCounterReading): Promise<ApiResponse> {
    const response = await this.sendAs(await this.registeredState(), reading);
    if (!isUnknownDevice(response)) return response;
    // Le serveur ne connaît plus l'appareil (base réinitialisée) : on en enregistre un nouveau
    // et on renvoie le relevé, avec le fuseau. Sans risque, l'envoi est idempotent. Une seule
    // fois : si le nouvel appareil est inconnu lui aussi, le problème est ailleurs.
    return this.sendAs(await this.register(), reading);
  }

  private async sendAs(state: SyncState, reading: StepCounterReading): Promise<ApiResponse> {
    const timeZone = this.ports.currentTimeZone();
    const timeZoneChanges =
      timeZone === state.lastSentTimeZone ? [] : [{ timeZone, since: reading.takenAt }];

    const response = await this.ports.sendReadings(state.deviceId, [reading], timeZoneChanges);
    // Le fuseau n'est considéré comme connu du serveur que si l'envoi a réussi.
    const succeeded = response.status >= 200 && response.status < 300;
    if (succeeded && timeZoneChanges.length > 0) {
      await this.save({ deviceId: state.deviceId, lastSentTimeZone: timeZone });
    }
    return response;
  }

  /** État chargé une seule fois ; l'appareil est enregistré (et retenu) s'il ne l'est pas. */
  private async registeredState(): Promise<SyncState> {
    if (!this.loaded) {
      this.state = await this.ports.loadState();
      this.loaded = true;
    }
    return this.state ?? this.register();
  }

  /** Enregistre un appareil, retenu avant tout envoi : un envoi raté n'en crée pas un second. */
  private async register(): Promise<SyncState> {
    const registered = { deviceId: await this.ports.registerDevice() };
    await this.save(registered);
    return registered;
  }

  private async save(state: SyncState): Promise<void> {
    await this.ports.saveState(state);
    this.state = state;
  }
}
