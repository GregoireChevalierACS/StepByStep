import { StepCounterReading, TimeZonePeriod } from '@stepbystep/domain';
import { DataSource } from 'typeorm';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { dataSourceOptions } from '../database/data-source-options.js';
import { AccountEntity } from '../database/entities/account.entity.js';
import { DailyStepsEntity } from '../database/entities/daily-steps.entity.js';
import { DeviceEntity } from '../database/entities/device.entity.js';
import { StepCounterReadingEntity } from '../database/entities/step-counter-reading.entity.js';
import { TypeOrmReadingsUnitOfWork } from '../database/repositories/typeorm-readings-unit-of-work.js';
import { unwrap } from '../testing/unwrap.js';
import { RecordReadingsService } from './record-readings.service.js';

const reading = (instant: string, stepsSinceBoot: number, bootCount = 7) =>
  unwrap(StepCounterReading.create({ stepsSinceBoot, bootCount, takenAt: Date.parse(instant) }));
const zone = (timeZone: string, since = '2026-01-01T00:00:00Z') =>
  unwrap(TimeZonePeriod.create({ timeZone, since: Date.parse(since) }));
const PARIS = zone('Europe/Paris');

describe('RecordReadingsService', () => {
  let dataSource: DataSource;
  let service: RecordReadingsService;

  // Un appareil neuf par test : les tests restent indépendants sur la base partagée.
  const newDevice = async (): Promise<string> => {
    const account = await dataSource.getRepository(AccountEntity).save({});
    return (await dataSource.getRepository(DeviceEntity).save({ accountId: account.id })).id;
  };
  const storedDays = async (deviceId: string) =>
    (
      await dataSource
        .getRepository(DailyStepsEntity)
        .find({ where: { deviceId }, order: { day: 'ASC' } })
    ).map(({ day, steps }) => ({ day, steps }));
  const storedReadings = (deviceId: string) =>
    dataSource.getRepository(StepCounterReadingEntity).countBy({ deviceId });

  beforeAll(async () => {
    dataSource = await new DataSource(dataSourceOptions(inject('databaseUrl'))).initialize();
    service = new RecordReadingsService(new TypeOrmReadingsUnitOfWork(dataSource));
  });

  afterAll(async () => {
    await dataSource.destroy();
  });

  it('enregistre un premier lot et calcule les pas du jour', async () => {
    const deviceId = await newDevice();

    const report = unwrap(
      await service.record({
        deviceId,
        readings: [reading('2026-10-12T06:00:00Z', 1000), reading('2026-10-12T10:00:00Z', 3000)],
        timeZoneChanges: [PARIS],
      }),
    );

    expect(report).toEqual({
      accepted: 2,
      duplicates: 0,
      days: [{ day: '2026-10-12', steps: 2000 }],
    });
    expect(await storedDays(deviceId)).toEqual([{ day: '2026-10-12', steps: 2000 }]);
  });

  it('ignore un lot renvoyé à l’identique (idempotence)', async () => {
    const deviceId = await newDevice();
    const batch = {
      deviceId,
      readings: [reading('2026-10-12T06:00:00Z', 1000), reading('2026-10-12T10:00:00Z', 3000)],
      timeZoneChanges: [PARIS],
    };
    unwrap(await service.record(batch));

    const report = unwrap(await service.record(batch));

    expect(report).toEqual({ accepted: 0, duplicates: 2, days: [] });
    expect(await storedReadings(deviceId)).toBe(2);
    expect(await storedDays(deviceId)).toEqual([{ day: '2026-10-12', steps: 2000 }]);
  });

  it('recalcule les deux jours voisins quand un relevé arrive en retard', async () => {
    const deviceId = await newDevice();
    // 23:00 et 01:00 heure de Paris : 2000 pas répartis à moitié de part et d'autre de minuit.
    unwrap(
      await service.record({
        deviceId,
        readings: [reading('2026-10-12T21:00:00Z', 1000), reading('2026-10-12T23:00:00Z', 3000)],
        timeZoneChanges: [PARIS],
      }),
    );
    expect(await storedDays(deviceId)).toEqual([
      { day: '2026-10-12', steps: 1000 },
      { day: '2026-10-13', steps: 1000 },
    ]);

    // Relevé de 23:50 reçu en retard : presque tous les pas avaient été faits avant minuit.
    const report = unwrap(
      await service.record({
        deviceId,
        readings: [reading('2026-10-12T21:50:00Z', 2900)],
        timeZoneChanges: [],
      }),
    );

    expect(report.accepted).toBe(1);
    expect(await storedDays(deviceId)).toEqual([
      { day: '2026-10-12', steps: 1914 },
      { day: '2026-10-13', steps: 86 },
    ]);
  });

  it('compte les pas faits depuis un redémarrage du téléphone', async () => {
    const deviceId = await newDevice();

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

    expect(await storedDays(deviceId)).toEqual([{ day: '2026-10-12', steps: 300 }]);
  });

  it('donne un résultat juste quand deux lots du même appareil sont envoyés en même temps', async () => {
    const deviceId = await newDevice();
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

    expect(await storedDays(deviceId)).toEqual([{ day: '2026-10-12', steps: 3000 }]);
  });

  it('attend la fin d’un traitement en cours sur le même appareil (verrou)', async () => {
    const deviceId = await newDevice();
    unwrap(await service.record({ deviceId, readings: [], timeZoneChanges: [PARIS] }));
    // Une transaction qui tient un verrou sur l'appareil. FOR NO KEY UPDATE entre en conflit
    // avec le FOR UPDATE du cas d'usage, mais pas avec le verrou léger (FOR KEY SHARE) que
    // PostgreSQL pose pour vérifier la clé étrangère d'un relevé : le test ne réussit donc
    // que si le cas d'usage verrouille lui-même l'appareil.
    const other = dataSource.createQueryRunner();
    await other.connect();
    await other.startTransaction();
    await other.query('SELECT id FROM devices WHERE id = $1 FOR NO KEY UPDATE', [deviceId]);

    let finished = false;
    const pending = service
      .record({ deviceId, readings: [reading('2026-10-12T06:00:00Z', 1)], timeZoneChanges: [] })
      .finally(() => {
        finished = true;
      });
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(finished).toBe(false); // bloqué par le verrou

    await other.commitTransaction();
    await other.release();
    unwrap(await pending);
    expect(finished).toBe(true); // reprend dès que le verrou est libéré
  });

  describe('erreurs : rien n’est enregistré (transaction annulée)', () => {
    it('signale un appareil inconnu', async () => {
      const deviceId = '00000000-0000-4000-8000-000000000000';

      expect(
        await service.record({
          deviceId,
          readings: [reading('2026-10-12T06:00:00Z', 1)],
          timeZoneChanges: [PARIS],
        }),
      ).toEqual({ ok: false, error: { kind: 'DeviceNotFound', deviceId } });
    });

    it('exige un fuseau horaire au premier envoi', async () => {
      const deviceId = await newDevice();

      expect(
        await service.record({
          deviceId,
          readings: [reading('2026-10-12T06:00:00Z', 1)],
          timeZoneChanges: [],
        }),
      ).toEqual({ ok: false, error: { kind: 'MissingTimeZone', deviceId } });
      expect(await storedReadings(deviceId)).toBe(0);
    });

    it('refuse un fuseau contradictoire avec un fuseau déjà enregistré', async () => {
      const deviceId = await newDevice();
      unwrap(await service.record({ deviceId, readings: [], timeZoneChanges: [PARIS] }));

      const result = await service.record({
        deviceId,
        readings: [reading('2026-10-12T06:00:00Z', 1)],
        timeZoneChanges: [zone('Asia/Tokyo')],
      });

      expect(result).toMatchObject({ ok: false, error: { kind: 'ConflictingTimeZonePeriods' } });
      expect(await storedReadings(deviceId)).toBe(0);
    });

    it('refuse un fuseau inconnu de la base IANA', async () => {
      const deviceId = await newDevice();

      const result = await service.record({
        deviceId,
        readings: [reading('2026-10-12T06:00:00Z', 1)],
        timeZoneChanges: [zone('Mars/Olympus')],
      });

      expect(result).toEqual({
        ok: false,
        error: { kind: 'UnknownTimeZone', timeZone: 'Mars/Olympus' },
      });
      expect(await storedReadings(deviceId)).toBe(0);
    });
  });
});
