import { randomUUID } from 'node:crypto';
import { DailyGoal, LocalDate, ok, StepCounterReading, TimeZonePeriod } from '@stepbystep/domain';
import { describe, expect, it } from 'vitest';
import { InMemoryDailyStepsRepository } from '../testing/in-memory-daily-steps.repository.js';
import { InMemoryDeviceRepository } from '../testing/in-memory-device.repository.js';
import { InMemoryGoalRepository } from '../testing/in-memory-goal.repository.js';
import { InMemoryOutbox } from '../testing/in-memory-outbox.js';
import { InMemoryReadingsUnitOfWork } from '../testing/in-memory-readings-unit-of-work.js';
import { InMemoryTimeZoneRepository } from '../testing/in-memory-time-zone.repository.js';
import { unwrap } from '../testing/unwrap.js';
import { RecordReadingsService } from './record-readings.service.js';

const reading = (instant: string, stepsSinceBoot: number, bootCount = 7) =>
  unwrap(StepCounterReading.create({ stepsSinceBoot, bootCount, takenAt: Date.parse(instant) }));
const zone = (timeZone: string, since = '2026-01-01T00:00:00Z') =>
  unwrap(TimeZonePeriod.create({ timeZone, since: Date.parse(since) }));
const PARIS = zone('Europe/Paris');

// Cas d'usage testé sans base : l'unité de travail en mémoire tient le même contrat que
// l'adapter PostgreSQL (transaction, verrou par appareil, doublons ignorés).
const setup = async () => {
  const devices = new InMemoryDeviceRepository();
  const timeZones = new InMemoryTimeZoneRepository();
  const dailySteps = new InMemoryDailyStepsRepository();
  const goals = new InMemoryGoalRepository();
  const outbox = new InMemoryOutbox();
  const unitOfWork = new InMemoryReadingsUnitOfWork({
    devices,
    timeZones,
    dailySteps,
    goals,
    outbox,
  });
  const { accountId, deviceId } = await devices.registerWithNewAccount();
  const storedDays = async () =>
    (await dailySteps.upTo(deviceId, unwrap(LocalDate.create('2100-01-01')))).map(
      ({ date, steps }) => ({ day: date.toString(), steps: steps.value }),
    );
  const storedReadings = async () =>
    unwrap(
      await unitOfWork.withDeviceLocked(deviceId, async (ledger) =>
        ok((await ledger.readingsBetween(0, Date.parse('2100-01-01'))).length),
      ),
    );
  return {
    accountId,
    deviceId,
    goals,
    outbox,
    timeZones,
    storedDays,
    storedReadings,
    service: new RecordReadingsService(unitOfWork),
  };
};

describe('RecordReadingsService', () => {
  it('enregistre un premier lot et calcule les pas du jour', async () => {
    const { deviceId, service, storedDays } = await setup();

    const report = await service.record({
      deviceId,
      readings: [reading('2026-10-12T06:00:00Z', 1000), reading('2026-10-12T10:00:00Z', 3000)],
      timeZoneChanges: [PARIS],
    });

    expect(unwrap(report)).toEqual({
      accepted: 2,
      duplicates: 0,
      days: [{ day: '2026-10-12', steps: 2000 }],
    });
    expect(await storedDays()).toEqual([{ day: '2026-10-12', steps: 2000 }]);
  });

  it('ignore un lot renvoyé à l’identique (idempotence)', async () => {
    const { deviceId, service, storedDays } = await setup();
    const batch = {
      deviceId,
      readings: [reading('2026-10-12T06:00:00Z', 1000), reading('2026-10-12T10:00:00Z', 3000)],
      timeZoneChanges: [PARIS],
    };
    unwrap(await service.record(batch));

    expect(unwrap(await service.record(batch))).toEqual({ accepted: 0, duplicates: 2, days: [] });
    expect(await storedDays()).toEqual([{ day: '2026-10-12', steps: 2000 }]);
  });

  it('recalcule les deux jours voisins quand un relevé arrive en retard', async () => {
    const { deviceId, service, storedDays } = await setup();
    // 23:00 et 01:00 heure de Paris : 2000 pas répartis à moitié de part et d'autre de minuit.
    unwrap(
      await service.record({
        deviceId,
        readings: [reading('2026-10-12T21:00:00Z', 1000), reading('2026-10-12T23:00:00Z', 3000)],
        timeZoneChanges: [PARIS],
      }),
    );

    // Relevé de 23:50 reçu en retard : presque tous les pas avaient été faits avant minuit.
    unwrap(
      await service.record({
        deviceId,
        readings: [reading('2026-10-12T21:50:00Z', 2900)],
        timeZoneChanges: [],
      }),
    );

    expect(await storedDays()).toEqual([
      { day: '2026-10-12', steps: 1914 },
      { day: '2026-10-13', steps: 86 },
    ]);
  });

  it('compte les pas faits depuis un redémarrage du téléphone', async () => {
    const { deviceId, service, storedDays } = await setup();

    unwrap(
      await service.record({
        deviceId,
        readings: [
          reading('2026-10-12T06:00:00Z', 5000, 7),
          reading('2026-10-12T10:00:00Z', 300, 8),
        ],
        timeZoneChanges: [PARIS],
      }),
    );

    expect(await storedDays()).toEqual([{ day: '2026-10-12', steps: 300 }]);
  });

  it('donne un résultat juste quand deux lots du même appareil sont envoyés en même temps', async () => {
    const { deviceId, service, storedDays } = await setup();
    unwrap(await service.record({ deviceId, readings: [], timeZoneChanges: [PARIS] }));

    await Promise.all([
      service.record({
        deviceId,
        readings: [reading('2026-10-12T06:00:00Z', 1000), reading('2026-10-12T10:00:00Z', 3000)],
        timeZoneChanges: [],
      }),
      service.record({
        deviceId,
        readings: [reading('2026-10-12T08:00:00Z', 2000), reading('2026-10-12T12:00:00Z', 4000)],
        timeZoneChanges: [],
      }),
    ]);

    expect(await storedDays()).toEqual([{ day: '2026-10-12', steps: 3000 }]);
  });

  describe('événement GoalReached, écrit dans l’outbox avec les données', () => {
    it('le publie quand un lot fait atteindre l’objectif du jour (10 000 par défaut)', async () => {
      const { deviceId, service, outbox } = await setup();

      unwrap(
        await service.record({
          deviceId,
          readings: [
            reading('2026-10-12T06:00:00Z', 1000),
            reading('2026-10-12T10:00:00Z', 11_500),
          ],
          timeZoneChanges: [PARIS],
        }),
      );

      expect(outbox.all()).toEqual([
        {
          key: `goal-reached:${deviceId}:2026-10-12`,
          type: 'GoalReached',
          payload: { deviceId, day: '2026-10-12', steps: 10_500, goal: 10_000 },
        },
      ]);
    });

    it('ne le publie qu’une fois par jour, même si le total continue de monter', async () => {
      const { deviceId, service, outbox } = await setup();
      const first = {
        deviceId,
        readings: [reading('2026-10-12T06:00:00Z', 1000), reading('2026-10-12T10:00:00Z', 11_500)],
        timeZoneChanges: [PARIS],
      };
      unwrap(await service.record(first));

      unwrap(await service.record(first));
      unwrap(
        await service.record({
          deviceId,
          readings: [reading('2026-10-12T15:00:00Z', 14_000)],
          timeZoneChanges: [],
        }),
      );

      expect(outbox.all()).toHaveLength(1);
    });

    it('juge le jour avec l’objectif fixé par le compte', async () => {
      const { accountId, deviceId, goals, service, outbox } = await setup();
      await goals.record(accountId, {
        effectiveFrom: unwrap(LocalDate.create('2026-10-01')),
        goal: unwrap(DailyGoal.create(5000)),
      });

      unwrap(
        await service.record({
          deviceId,
          readings: [reading('2026-10-12T06:00:00Z', 1000), reading('2026-10-12T10:00:00Z', 7000)],
          timeZoneChanges: [PARIS],
        }),
      );

      expect(outbox.all().map(({ payload }) => payload)).toEqual([
        { deviceId, day: '2026-10-12', steps: 6000, goal: 5000 },
      ]);
    });

    it('ne publie rien sous l’objectif', async () => {
      const { deviceId, service, outbox } = await setup();

      unwrap(
        await service.record({
          deviceId,
          readings: [reading('2026-10-12T06:00:00Z', 1000), reading('2026-10-12T10:00:00Z', 3000)],
          timeZoneChanges: [PARIS],
        }),
      );

      expect(outbox.all()).toEqual([]);
    });
  });

  describe('erreurs : rien n’est enregistré', () => {
    it('signale un appareil inconnu', async () => {
      const { service } = await setup();
      const deviceId = randomUUID();

      expect(
        await service.record({
          deviceId,
          readings: [reading('2026-10-12T06:00:00Z', 1)],
          timeZoneChanges: [PARIS],
        }),
      ).toEqual({ ok: false, error: { kind: 'DeviceNotFound', deviceId } });
    });

    it('exige un fuseau horaire au premier envoi', async () => {
      const { deviceId, service, storedReadings } = await setup();

      expect(
        await service.record({
          deviceId,
          readings: [reading('2026-10-12T06:00:00Z', 1)],
          timeZoneChanges: [],
        }),
      ).toEqual({ ok: false, error: { kind: 'MissingTimeZone', deviceId } });
      expect(await storedReadings()).toBe(0);
    });

    it('refuse un fuseau contradictoire avec un fuseau déjà enregistré', async () => {
      const { deviceId, service, storedReadings, timeZones } = await setup();
      unwrap(await service.record({ deviceId, readings: [], timeZoneChanges: [PARIS] }));

      const result = await service.record({
        deviceId,
        readings: [reading('2026-10-12T06:00:00Z', 1)],
        timeZoneChanges: [zone('Asia/Tokyo')],
      });

      expect(result).toMatchObject({ ok: false, error: { kind: 'ConflictingTimeZonePeriods' } });
      expect(await storedReadings()).toBe(0);
      expect(await timeZones.periodsOf(deviceId)).toEqual([PARIS]);
    });

    it('refuse un fuseau inconnu de la base IANA', async () => {
      const { deviceId, service, storedReadings } = await setup();

      const result = await service.record({
        deviceId,
        readings: [reading('2026-10-12T06:00:00Z', 1)],
        timeZoneChanges: [zone('Mars/Olympus')],
      });

      expect(result).toEqual({
        ok: false,
        error: { kind: 'UnknownTimeZone', timeZone: 'Mars/Olympus' },
      });
      expect(await storedReadings()).toBe(0);
    });
  });
});
