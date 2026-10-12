import {
  DailyGoal,
  LocalDate,
  StepCount,
  StepCounterReading,
  TimeZonePeriod,
} from '@stepbystep/domain';
import { DataSource } from 'typeorm';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { unwrap } from '../../testing/unwrap.js';
import { dataSourceOptions } from '../data-source-options.js';
import { AccountEntity } from '../entities/account.entity.js';
import { DailyGoalEntity } from '../entities/daily-goal.entity.js';
import { DailyStepsEntity } from '../entities/daily-steps.entity.js';
import { DeviceTimeZoneEntity } from '../entities/device-time-zone.entity.js';
import { DeviceEntity } from '../entities/device.entity.js';
import { StepCounterReadingEntity } from '../entities/step-counter-reading.entity.js';
import { dailyStepsToDomain, dailyStepsToRow } from './daily-steps.mapper.js';
import { goalChangeToDomain, goalChangeToRow } from './goal-change.mapper.js';
import { readingToDomain, readingToRow } from './step-counter-reading.mapper.js';
import { periodToDomain, periodToRow } from './time-zone-period.mapper.js';

// Aller-retour domaine → PostgreSQL → domaine : vérifie ce que le driver pg renvoie
// réellement (colonnes date, précision des timestamptz…), invisible sans vraie base.
describe('mappers : aller-retour par PostgreSQL', () => {
  let dataSource: DataSource;
  let accountId: string;
  let deviceId: string;

  beforeAll(async () => {
    dataSource = await new DataSource(dataSourceOptions(inject('databaseUrl'))).initialize();
    accountId = (await dataSource.getRepository(AccountEntity).save({})).id;
    deviceId = (await dataSource.getRepository(DeviceEntity).save({ accountId })).id;
  });

  afterAll(async () => {
    await dataSource.getRepository(AccountEntity).delete({ id: accountId });
    await dataSource.destroy();
  });

  it('conserve un relevé à la milliseconde près', async () => {
    const takenAt = Date.parse('2026-10-12T07:30:00.123Z');
    const reading = unwrap(
      StepCounterReading.create({ stepsSinceBoot: 4200, bootCount: 7, takenAt }),
    );
    const repository = dataSource.getRepository(StepCounterReadingEntity);

    await repository.insert(readingToRow(deviceId, reading));
    const row = await repository.findOneByOrFail({ deviceId });

    expect(unwrap(readingToDomain(row))).toEqual(reading);
  });

  it('conserve une période de fuseau', async () => {
    const period = unwrap(
      TimeZonePeriod.create({
        timeZone: 'America/New_York',
        since: Date.parse('2026-10-10T14:00:00Z'),
      }),
    );
    const repository = dataSource.getRepository(DeviceTimeZoneEntity);

    await repository.insert(periodToRow(deviceId, period));
    const row = await repository.findOneByOrFail({ deviceId });

    expect(unwrap(periodToDomain(row))).toEqual(period);
  });

  it('conserve un changement d’objectif, avec son jour AAAA-MM-JJ inchangé', async () => {
    const change = {
      goal: unwrap(DailyGoal.create(12_000)),
      effectiveFrom: unwrap(LocalDate.create('2026-10-10')),
    };
    const repository = dataSource.getRepository(DailyGoalEntity);

    await repository.insert(goalChangeToRow(accountId, change));
    const row = await repository.findOneByOrFail({ accountId });

    expect(row.effectiveFrom).toBe('2026-10-10');
    expect(unwrap(goalChangeToDomain(row))).toEqual(change);
  });

  it('conserve les pas d’un jour, avec son jour AAAA-MM-JJ inchangé', async () => {
    const daily = {
      date: unwrap(LocalDate.create('2026-10-12')),
      steps: unwrap(StepCount.create(8_500)),
    };
    const repository = dataSource.getRepository(DailyStepsEntity);

    await repository.insert(dailyStepsToRow(deviceId, daily));
    const row = await repository.findOneByOrFail({ deviceId });

    expect(row.day).toBe('2026-10-12');
    expect(unwrap(dailyStepsToDomain(row))).toEqual(daily);
  });
});
