import type { DailySteps } from '@stepbystep/domain';
import { DataSource } from 'typeorm';
import { afterAll, beforeAll, describe, inject } from 'vitest';
import { dailyStepsRepositoryContract } from '../../testing/contracts/daily-steps-repository.contract.js';
import { deviceRepositoryContract } from '../../testing/contracts/device-repository.contract.js';
import { dataSourceOptions } from '../data-source-options.js';
import { DailyStepsEntity } from '../entities/daily-steps.entity.js';
import { dailyStepsToRow } from '../mappers/daily-steps.mapper.js';
import { TypeOrmDailyStepsRepository } from './typeorm-daily-steps.repository.js';
import { TypeOrmDeviceRepository } from './typeorm-device.repository.js';

// Les adapters PostgreSQL passent les mêmes contrats que les fakes en mémoire. Chaque test
// travaille sur des appareils neufs : pas besoin de vider la base entre deux tests.
describe('adapters PostgreSQL (TypeORM)', () => {
  let dataSource: DataSource;

  beforeAll(async () => {
    dataSource = await new DataSource(dataSourceOptions(inject('databaseUrl'))).initialize();
  });

  afterAll(async () => {
    await dataSource.destroy();
  });

  describe('TypeOrmDeviceRepository', () => {
    deviceRepositoryContract(() => new TypeOrmDeviceRepository(dataSource));
  });

  describe('TypeOrmDailyStepsRepository', () => {
    dailyStepsRepositoryContract(() => ({
      repository: new TypeOrmDailyStepsRepository(dataSource),
      givenDevice: async () =>
        (await new TypeOrmDeviceRepository(dataSource).registerWithNewAccount()).deviceId,
      givenDays: async (deviceId: string, days: readonly DailySteps[]) => {
        await dataSource
          .getRepository(DailyStepsEntity)
          .insert(days.map((daily) => dailyStepsToRow(deviceId, daily)));
      },
    }));
  });
});
