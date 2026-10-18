import { StepCounterReading } from '@stepbystep/domain';
import { describe, expect, it } from 'vitest';

import {
  ReadingSync,
  UNKNOWN_DEVICE_PROBLEM_TYPE,
  type ApiResponse,
  type ReadingSyncPorts,
  type SyncState,
  type TimeZoneChange,
} from './ReadingSync';

interface SentBatch {
  readonly deviceId: string;
  readonly readings: readonly StepCounterReading[];
  readonly timeZoneChanges: readonly TimeZoneChange[];
}

/**
 * Fake des ports : enregistre les appels ; réponses, fuseau et stockage pilotables par le
 * test. Le stockage est un simple champ, partageable entre deux ReadingSync pour simuler un
 * redémarrage de l'app.
 */
class FakePorts implements ReadingSyncPorts {
  registrations = 0;
  readonly sent: SentBatch[] = [];
  timeZone = 'Europe/Paris';
  nextStatus = 200;
  nextBody: unknown = null;
  failNextRegistration = false;
  stored: SyncState | undefined;
  /** Appareils que le serveur ne connaît pas (base réinitialisée) : 404 « appareil inconnu ». */
  readonly unknownDevices = new Set<string>();
  /** Serveur qui ne connaît aucun appareil, même tout juste enregistré. */
  forgetsEveryDevice = false;

  loadState(): Promise<SyncState | undefined> {
    return Promise.resolve(this.stored);
  }

  saveState(state: SyncState): Promise<void> {
    this.stored = state;
    return Promise.resolve();
  }

  registerDevice(): Promise<string> {
    if (this.failNextRegistration) {
      this.failNextRegistration = false;
      return Promise.reject(new Error('réseau indisponible'));
    }
    this.registrations += 1;
    return Promise.resolve(`device-${String(this.registrations)}`);
  }

  sendReadings(
    deviceId: string,
    readings: readonly StepCounterReading[],
    timeZoneChanges: readonly TimeZoneChange[],
  ): Promise<ApiResponse> {
    this.sent.push({ deviceId, readings, timeZoneChanges });
    if (this.forgetsEveryDevice || this.unknownDevices.has(deviceId)) {
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
}

function aReading(takenAt: number): StepCounterReading {
  const reading = StepCounterReading.create({ stepsSinceBoot: 4200, bootCount: 7, takenAt });
  if (!reading.ok) throw new Error('relevé de test invalide');
  return reading.value;
}

describe('ReadingSync', () => {
  it('enregistre l’appareil puis envoie le relevé avec le fuseau, daté du relevé', async () => {
    const ports = new FakePorts();
    const reading = aReading(1_000);

    await new ReadingSync(ports).send(reading);

    expect(ports.registrations).toBe(1);
    expect(ports.sent).toEqual([
      {
        deviceId: 'device-1',
        readings: [reading],
        timeZoneChanges: [{ timeZone: 'Europe/Paris', since: 1_000 }],
      },
    ]);
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

    expect(ports.stored).toEqual({ deviceId: 'device-1' });
  });

  it('ne lit le stockage qu’au premier envoi', async () => {
    const ports = new FakePorts();
    const sync = new ReadingSync(ports);
    await sync.send(aReading(1_000));

    ports.stored = { deviceId: 'device-effacé' };
    await sync.send(aReading(2_000));

    expect(ports.sent[1]?.deviceId).toBe('device-1');
  });

  describe('appareil inconnu du serveur (base réinitialisée)', () => {
    it('enregistre un nouvel appareil et lui renvoie le relevé, avec le fuseau', async () => {
      const ports = new FakePorts();
      ports.stored = { deviceId: 'device-perdu', lastSentTimeZone: 'Europe/Paris' };
      ports.unknownDevices.add('device-perdu');
      const reading = aReading(1_000);

      const response = await new ReadingSync(ports).send(reading);

      expect(response.status).toBe(200);
      expect(ports.sent).toEqual([
        { deviceId: 'device-perdu', readings: [reading], timeZoneChanges: [] },
        {
          deviceId: 'device-1',
          readings: [reading],
          timeZoneChanges: [{ timeZone: 'Europe/Paris', since: 1_000 }],
        },
      ]);
      expect(ports.stored).toEqual({ deviceId: 'device-1', lastSentTimeZone: 'Europe/Paris' });
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

    it('ne réessaie qu’une fois si le nouvel appareil est inconnu lui aussi', async () => {
      const ports = new FakePorts();
      ports.forgetsEveryDevice = true;

      const response = await new ReadingSync(ports).send(aReading(1_000));

      expect(response.status).toBe(404);
      expect(ports.registrations).toBe(2);
      expect(ports.sent).toHaveLength(2);
    });
  });
});
