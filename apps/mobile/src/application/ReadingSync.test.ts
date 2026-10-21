import { StepCounterReading } from '@stepbystep/domain';
import { describe, expect, it } from 'vitest';

import {
  ReadingSync,
  UNAUTHENTICATED_PROBLEM_TYPE,
  UNKNOWN_DEVICE_PROBLEM_TYPE,
  type ApiResponse,
  type DeviceCredentials,
  type DeviceToken,
  type ReadingSyncPorts,
  type SyncState,
  type TimeZoneChange,
} from './ReadingSync';

interface SentBatch {
  readonly deviceId: string;
  readonly token: string;
  readonly readings: readonly StepCounterReading[];
  readonly timeZoneChanges: readonly TimeZoneChange[];
}

/**
 * Faux serveur et faux stockage : simulent les règles de l'API (jeton exigé, appareil inconnu,
 * identifiants refusés) et enregistrent les appels. Le stockage est un simple champ, partageable
 * entre deux ReadingSync pour simuler un redémarrage de l'app.
 */
class FakePorts implements ReadingSyncPorts {
  registrations = 0;
  tokenRequests = 0;
  readonly sent: SentBatch[] = [];
  timeZone = 'Europe/Paris';
  nextStatus = 200;
  nextBody: unknown = null;
  failNextRegistration = false;
  stored: SyncState | undefined;
  clock = 1_000_000;
  /** Appareils que le serveur ne connaît plus (base réinitialisée) : 404 et échange refusé. */
  readonly unknownDevices = new Set<string>();
  /** Serveur qui ne connaît aucun appareil, même tout juste enregistré. */
  forgetsEveryDevice = false;
  private readonly secrets = new Map<string, string>();
  /** Jeton → appareil auquel il a été délivré, comme la revendication `sub` du vrai jeton. */
  private validTokens = new Map<string, string>();

  /** Le serveur a changé de clé de signature : tous les jetons émis deviennent invalides. */
  revokeTokens(): void {
    this.validTokens = new Map();
  }

  loadState(): Promise<SyncState | undefined> {
    return Promise.resolve(this.stored);
  }

  saveState(state: SyncState): Promise<void> {
    this.stored = state;
    return Promise.resolve();
  }

  registerDevice(): Promise<DeviceCredentials> {
    if (this.failNextRegistration) {
      this.failNextRegistration = false;
      return Promise.reject(new Error('réseau indisponible'));
    }
    this.registrations += 1;
    const credentials = {
      deviceId: `device-${String(this.registrations)}`,
      secret: `secret-${String(this.registrations)}`,
    };
    this.secrets.set(credentials.deviceId, credentials.secret);
    return Promise.resolve(credentials);
  }

  requestToken(deviceId: string, secret: string): Promise<DeviceToken | undefined> {
    this.tokenRequests += 1;
    if (this.isUnknown(deviceId) || this.secrets.get(deviceId) !== secret) {
      return Promise.resolve(undefined);
    }
    const token = `token-${String(this.tokenRequests)}`;
    this.validTokens.set(token, deviceId);
    return Promise.resolve({ token, expiresIn: 900 });
  }

  sendReadings(
    deviceId: string,
    token: string,
    readings: readonly StepCounterReading[],
    timeZoneChanges: readonly TimeZoneChange[],
  ): Promise<ApiResponse> {
    this.sent.push({ deviceId, token, readings, timeZoneChanges });
    const tokenDevice = this.validTokens.get(token);
    if (tokenDevice === undefined) {
      return Promise.resolve({
        status: 401,
        body: { type: UNAUTHENTICATED_PROBLEM_TYPE, status: 401 },
      });
    }
    // Comme l'API : le jeton d'un autre appareil est refusé.
    if (tokenDevice !== deviceId) {
      return Promise.resolve({ status: 403, body: { type: 'forbidden', status: 403 } });
    }
    if (this.isUnknown(deviceId)) {
      return Promise.resolve({
        status: 404,
        body: { type: UNKNOWN_DEVICE_PROBLEM_TYPE, status: 404, detail: 'Appareil inconnu' },
      });
    }
    return Promise.resolve({ status: this.nextStatus, body: this.nextBody });
  }

  currentTimeZone(): string {
    return this.timeZone;
  }

  now(): number {
    return this.clock;
  }

  private isUnknown(deviceId: string): boolean {
    return this.forgetsEveryDevice || this.unknownDevices.has(deviceId);
  }
}

function aReading(takenAt: number): StepCounterReading {
  const reading = StepCounterReading.create({ stepsSinceBoot: 4200, bootCount: 7, takenAt });
  if (!reading.ok) throw new Error('relevé de test invalide');
  return reading.value;
}

describe('ReadingSync', () => {
  it('enregistre l’appareil, obtient un jeton, puis envoie le relevé avec le fuseau', async () => {
    const ports = new FakePorts();
    const reading = aReading(1_000);

    await new ReadingSync(ports).send(reading);

    expect(ports.registrations).toBe(1);
    expect(ports.sent).toEqual([
      {
        deviceId: 'device-1',
        token: 'token-1',
        readings: [reading],
        timeZoneChanges: [{ timeZone: 'Europe/Paris', since: 1_000 }],
      },
    ]);
  });

  it('retient l’appareil avec son secret, jamais le jeton', async () => {
    const ports = new FakePorts();

    await new ReadingSync(ports).send(aReading(1_000));

    expect(ports.stored).toEqual({
      deviceId: 'device-1',
      secret: 'secret-1',
      lastSentTimeZone: 'Europe/Paris',
    });
  });

  it('n’enregistre l’appareil qu’une fois et ne renvoie pas un fuseau inchangé', async () => {
    const ports = new FakePorts();
    const sync = new ReadingSync(ports);

    await sync.send(aReading(1_000));
    await sync.send(aReading(2_000));

    expect(ports.registrations).toBe(1);
    expect(ports.sent[1]).toMatchObject({ deviceId: 'device-1', timeZoneChanges: [] });
  });

  it('envoie le nouveau fuseau quand il a changé', async () => {
    const ports = new FakePorts();
    const sync = new ReadingSync(ports);

    await sync.send(aReading(1_000));
    ports.timeZone = 'America/New_York';
    await sync.send(aReading(2_000));

    expect(ports.sent[1]?.timeZoneChanges).toEqual([
      { timeZone: 'America/New_York', since: 2_000 },
    ]);
  });

  it('renvoie le fuseau si l’envoi précédent a échoué', async () => {
    const ports = new FakePorts();
    const sync = new ReadingSync(ports);

    ports.nextStatus = 503;
    await sync.send(aReading(1_000));
    ports.nextStatus = 200;
    await sync.send(aReading(2_000));

    expect(ports.sent[1]?.timeZoneChanges).toEqual([{ timeZone: 'Europe/Paris', since: 2_000 }]);
  });

  it('renvoie la réponse du serveur telle quelle', async () => {
    const ports = new FakePorts();
    ports.nextStatus = 422;

    const response = await new ReadingSync(ports).send(aReading(1_000));

    expect(response).toEqual({ status: 422, body: null });
  });

  it('retente l’enregistrement de l’appareil au prochain envoi s’il a échoué', async () => {
    const ports = new FakePorts();
    const sync = new ReadingSync(ports);
    ports.failNextRegistration = true;

    await expect(sync.send(aReading(1_000))).rejects.toThrow('réseau indisponible');
    await sync.send(aReading(2_000));

    expect(ports.registrations).toBe(1);
    expect(ports.sent).toHaveLength(1);
  });

  it('reprend l’appareil et le fuseau retenus après un redémarrage de l’app', async () => {
    const ports = new FakePorts();
    await new ReadingSync(ports).send(aReading(1_000));

    await new ReadingSync(ports).send(aReading(2_000));

    expect(ports.registrations).toBe(1);
    expect(ports.sent[1]).toMatchObject({ deviceId: 'device-1', timeZoneChanges: [] });
  });

  it('retient l’appareil dès son enregistrement, même si l’envoi échoue ensuite', async () => {
    const ports = new FakePorts();
    ports.nextStatus = 503;

    await new ReadingSync(ports).send(aReading(1_000));

    expect(ports.stored).toEqual({ deviceId: 'device-1', secret: 'secret-1' });
  });

  it('ne lit le stockage qu’au premier envoi', async () => {
    const ports = new FakePorts();
    const sync = new ReadingSync(ports);
    await sync.send(aReading(1_000));

    ports.stored = { deviceId: 'device-effacé', secret: 'secret-effacé' };
    await sync.send(aReading(2_000));

    expect(ports.sent[1]?.deviceId).toBe('device-1');
  });

  describe('jeton d’appareil', () => {
    it('réutilise le jeton tant qu’il est valide', async () => {
      const ports = new FakePorts();
      const sync = new ReadingSync(ports);

      await sync.send(aReading(1_000));
      ports.clock += 800_000;
      await sync.send(aReading(2_000));

      expect(ports.tokenRequests).toBe(1);
      expect(ports.sent.map(({ token }) => token)).toEqual(['token-1', 'token-1']);
    });

    it('en demande un nouveau peu avant son expiration, pour ne pas l’envoyer périmé', async () => {
      const ports = new FakePorts();
      const sync = new ReadingSync(ports);

      await sync.send(aReading(1_000));
      ports.clock += 841_000; // moins d'une minute avant les 15 minutes
      await sync.send(aReading(2_000));

      expect(ports.sent.map(({ token }) => token)).toEqual(['token-1', 'token-2']);
    });

    it('sur un 401, obtient un nouveau jeton et renvoie le relevé une fois', async () => {
      const ports = new FakePorts();
      const sync = new ReadingSync(ports);
      await sync.send(aReading(1_000));
      ports.revokeTokens();

      const response = await sync.send(aReading(2_000));

      expect(response.status).toBe(200);
      expect(ports.sent.map(({ token }) => token)).toEqual(['token-1', 'token-1', 'token-2']);
      expect(ports.registrations).toBe(1);
    });

    it('ne réessaie qu’une fois si le nouveau jeton est refusé lui aussi', async () => {
      const ports = new FakePorts();
      const sync = new ReadingSync(ports);
      await sync.send(aReading(1_000));
      ports.revokeTokens();
      const revokeAgain = ports.requestToken.bind(ports);
      ports.requestToken = async (deviceId, secret) => {
        const issued = await revokeAgain(deviceId, secret);
        ports.revokeTokens();
        return issued;
      };

      const response = await sync.send(aReading(2_000));

      expect(response.status).toBe(401);
      expect(ports.sent).toHaveLength(3);
    });
  });

  describe('appareil inconnu du serveur, ou identifiants refusés', () => {
    it('se réenregistre quand l’échange du secret est refusé (appareil créé avant l’authentification)', async () => {
      const ports = new FakePorts();
      ports.stored = { deviceId: 'ancien-appareil', secret: 'ancien-secret' };
      const reading = aReading(1_000);

      const response = await new ReadingSync(ports).send(reading);

      expect(response.status).toBe(200);
      expect(ports.sent).toEqual([
        {
          deviceId: 'device-1',
          token: 'token-2',
          readings: [reading],
          timeZoneChanges: [{ timeZone: 'Europe/Paris', since: 1_000 }],
        },
      ]);
      expect(ports.stored).toEqual({
        deviceId: 'device-1',
        secret: 'secret-1',
        lastSentTimeZone: 'Europe/Paris',
      });
    });

    it('se réenregistre quand le serveur ne connaît plus l’appareil (404 dédié)', async () => {
      const ports = new FakePorts();
      const sync = new ReadingSync(ports);
      await sync.send(aReading(1_000));
      ports.unknownDevices.add('device-1');

      const response = await sync.send(aReading(2_000));

      expect(response.status).toBe(200);
      expect(ports.sent.at(-1)).toMatchObject({
        deviceId: 'device-2',
        timeZoneChanges: [{ timeZone: 'Europe/Paris', since: 2_000 }],
      });
    });

    it('ne réagit pas à une 404 d’un autre type (route ou adresse du serveur erronée)', async () => {
      const ports = new FakePorts();
      // Ce que renvoie l'API pour une route qui n'existe pas : une 404 Problem Details générique.
      ports.nextStatus = 404;
      ports.nextBody = { type: 'about:blank', title: 'Not Found', status: 404 };

      const response = await new ReadingSync(ports).send(aReading(1_000));

      expect(response.status).toBe(404);
      expect(ports.registrations).toBe(1);
      expect(ports.sent).toHaveLength(1);
    });

    it('échoue sans boucler si le nouvel appareil est refusé lui aussi', async () => {
      const ports = new FakePorts();
      ports.forgetsEveryDevice = true;

      await expect(new ReadingSync(ports).send(aReading(1_000))).rejects.toThrow(/refus/);
      expect(ports.registrations).toBe(2);
      expect(ports.sent).toEqual([]);
    });
  });
});
