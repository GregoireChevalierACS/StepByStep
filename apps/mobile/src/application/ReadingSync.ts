import type { StepCounterReading } from '@stepbystep/domain';

/** Réponse HTTP brute : statut et corps JSON, affichés tels quels par l'écran. */
export interface ApiResponse {
  readonly status: number;
  readonly body: unknown;
}

const PROBLEMS = 'https://github.com/GregoireChevalierACS/StepByStep/blob/main/docs/problems.md';

/**
 * Types de problème (RFC 9457) de l'API auxquels l'app réagit (voir docs/problems.md). C'est
 * le type qui est testé, pas le seul statut : une 404 de route ou une 401 de proxy n'ont pas
 * le même sens.
 */
export const UNKNOWN_DEVICE_PROBLEM_TYPE = `${PROBLEMS}#device-not-found`;
export const UNAUTHENTICATED_PROBLEM_TYPE = `${PROBLEMS}#unauthenticated`;

const hasProblemType = ({ status, body }: ApiResponse, expectedStatus: number, type: string) =>
  status === expectedStatus &&
  typeof body === 'object' &&
  body !== null &&
  'type' in body &&
  body.type === type;

/** Nouvelle période de fuseau de l'appareil (identifiant IANA + instant epoch ms de début). */
export interface TimeZoneChange {
  readonly timeZone: string;
  readonly since: number;
}

/** Identité de l'appareil auprès du serveur : le secret n'est remis qu'à l'enregistrement. */
export interface DeviceCredentials {
  readonly deviceId: string;
  readonly secret: string;
}

/** Jeton d'appareil, à joindre aux requêtes ; `expiresIn` en secondes. */
export interface DeviceToken {
  readonly token: string;
  readonly expiresIn: number;
}

/** Ce que l'app retient entre deux lancements (stockage chiffré : il contient le secret). */
export interface SyncState extends DeviceCredentials {
  /** Dernier fuseau confirmé par le serveur ; absent tant qu'aucun envoi n'a réussi. */
  readonly lastSentTimeZone?: string;
}

/** Ports de l'envoi : API HTTP, stockage local, fuseau et horloge de l'appareil. */
export interface ReadingSyncPorts {
  registerDevice(): Promise<DeviceCredentials>;
  /** Jeton contre le secret ; `undefined` si le serveur refuse ces identifiants. */
  requestToken(deviceId: string, secret: string): Promise<DeviceToken | undefined>;
  sendReadings(
    deviceId: string,
    token: string,
    readings: readonly StepCounterReading[],
    timeZoneChanges: readonly TimeZoneChange[],
  ): Promise<ApiResponse>;
  loadState(): Promise<SyncState | undefined>;
  saveState(state: SyncState): Promise<void>;
  currentTimeZone(): string;
  now(): number;
}

// Marge avant expiration : un jeton presque périmé n'est pas envoyé (horloges décalées, réseau lent).
const TOKEN_MARGIN_MS = 60_000;

/** L'appareil doit être réenregistré : identifiants refusés, ou appareil inconnu du serveur. */
const REREGISTER = Symbol('REREGISTER');

/**
 * Envoi des relevés au serveur. L'appareil est enregistré au premier envoi, avec son secret,
 * puis retenu entre deux lancements. Chaque envoi porte un jeton court obtenu contre ce secret
 * et gardé en mémoire seulement. Le fuseau n'est transmis qu'au premier envoi ou quand il a
 * changé (ADR 0002, décision 6).
 *
 * Reprises, chacune une seule fois : jeton refusé (401) → nouveau jeton ; identifiants refusés
 * ou appareil inconnu (404) → nouvel enregistrement. Renvoyer est sans risque : l'envoi est
 * idempotent.
 *
 * Version minimale : le changement de fuseau est daté du relevé qui le constate, pas de
 * l'événement Android ACTION_TIMEZONE_CHANGED.
 */
export class ReadingSync {
  private state: SyncState | undefined;
  private loaded = false;
  private token: { readonly value: string; readonly validUntil: number } | undefined;

  constructor(private readonly ports: ReadingSyncPorts) {}

  async send(reading: StepCounterReading): Promise<ApiResponse> {
    const response = await this.trySend(await this.registeredState(), reading);
    if (response !== REREGISTER) return response;
    const retried = await this.trySend(await this.register(), reading);
    if (retried !== REREGISTER) return retried;
    throw new Error('Appareil refusé par le serveur, même tout juste réenregistré.');
  }

  /** Envoi avec un jeton valide ; une seule reprise si le jeton est refusé. */
  private async trySend(
    state: SyncState,
    reading: StepCounterReading,
  ): Promise<ApiResponse | typeof REREGISTER> {
    let response = await this.sendWithToken(state, reading);
    if (response !== REREGISTER && hasProblemType(response, 401, UNAUTHENTICATED_PROBLEM_TYPE)) {
      this.token = undefined;
      response = await this.sendWithToken(state, reading);
    }
    if (response !== REREGISTER && hasProblemType(response, 404, UNKNOWN_DEVICE_PROBLEM_TYPE)) {
      return REREGISTER;
    }
    return response;
  }

  private async sendWithToken(
    state: SyncState,
    reading: StepCounterReading,
  ): Promise<ApiResponse | typeof REREGISTER> {
    const token = await this.validToken(state);
    if (token === undefined) return REREGISTER;

    const timeZone = this.ports.currentTimeZone();
    const timeZoneChanges =
      timeZone === state.lastSentTimeZone ? [] : [{ timeZone, since: reading.takenAt }];
    const response = await this.ports.sendReadings(
      state.deviceId,
      token,
      [reading],
      timeZoneChanges,
    );
    // Le fuseau n'est considéré comme connu du serveur que si l'envoi a réussi.
    const succeeded = response.status >= 200 && response.status < 300;
    if (succeeded && timeZoneChanges.length > 0) {
      await this.save({ ...state, lastSentTimeZone: timeZone });
    }
    return response;
  }

  /** Jeton en cours s'il est encore valide, sinon un nouveau ; `undefined` si refusé. */
  private async validToken(state: SyncState): Promise<string | undefined> {
    if (this.token !== undefined && this.ports.now() < this.token.validUntil) {
      return this.token.value;
    }
    const issued = await this.ports.requestToken(state.deviceId, state.secret);
    if (issued === undefined) return undefined;
    this.token = {
      value: issued.token,
      validUntil: this.ports.now() + issued.expiresIn * 1000 - TOKEN_MARGIN_MS,
    };
    return issued.token;
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
    this.token = undefined;
    const registered = await this.ports.registerDevice();
    await this.save(registered);
    return registered;
  }

  private async save(state: SyncState): Promise<void> {
    await this.ports.saveState(state);
    this.state = state;
  }
}
