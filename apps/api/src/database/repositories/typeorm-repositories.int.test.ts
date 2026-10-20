import type { DailySteps, TimeZonePeriod } from '@stepbystep/domain';
import { DataSource } from 'typeorm';
import { afterAll, beforeAll, describe, inject } from 'vitest';
import { accountRepositoryContract } from '../../testing/contracts/account-repository.contract.js';
import { dailyStepsRepositoryContract } from '../../testing/contracts/daily-steps-repository.contract.js';
import { deviceRepositoryContract } from '../../testing/contracts/device-repository.contract.js';
import { goalRepositoryContract } from '../../testing/contracts/goal-repository.contract.js';
import { readingsUnitOfWorkContract } from '../../testing/contracts/readings-unit-of-work.contract.js';
import { timeZoneRepositoryContract } from '../../testing/contracts/time-zone-repository.contract.js';
import type { OutboxEvent } from '../../events/outbox-event.js';
import { dataSourceOptions } from '../data-source-options.js';
import { DailyStepsEntity } from '../entities/daily-steps.entity.js';
import { DeviceTimeZoneEntity } from '../entities/device-time-zone.entity.js';
import { OutboxEventEntity } from '../entities/outbox-event.entity.js';
import { dailyStepsToRow } from '../mappers/daily-steps.mapper.js';
import { periodToRow } from '../mappers/time-zone-period.mapper.js';
import { TypeOrmAccountRepository } from './typeorm-account.repository.js';
import { TypeOrmDailyStepsRepository } from './typeorm-daily-steps.repository.js';
import { TypeOrmDeviceRepository } from './typeorm-device.repository.js';
import { TypeOrmGoalRepository } from './typeorm-goal.repository.js';
import { TypeOrmReadingsUnitOfWork } from './typeorm-readings-unit-of-work.js';
import { TypeOrmTimeZoneRepository } from './typeorm-time-zone.repository.js';

// Les adapters PostgreSQL passent les mêmes contrats que les fakes en mémoire. Chaque test
// travaille sur des appareils et des comptes neufs : pas besoin de vider la base entre deux.
describe('adapters PostgreSQL (TypeORM)', () => {
  let dataSource: DataSource;
  const registered = () => new TypeOrmDeviceRepository(dataSource).registerWithNewAccount();
  const givenDevice = async () => (await registered()).deviceId;
  const givenAccount = async () => (await registered()).accountId;

  beforeAll(async () => {
    dataSource = await new DataSource(dataSourceOptions(inject('databaseUrl'))).initialize();
  });

  afterAll(async () => {
    await dataSource.destroy();
  });

  describe('TypeOrmDeviceRepository', () => {
    deviceRepositoryContract(() => new TypeOrmDeviceRepository(dataSource));
  });

  describe('TypeOrmAccountRepository', () => {
    accountRepositoryContract(() => ({
      repository: new TypeOrmAccountRepository(dataSource),
      givenAccount,
    }));
  });

  describe('TypeOrmDailyStepsRepository', () => {
    dailyStepsRepositoryContract(() => ({
      repository: new TypeOrmDailyStepsRepository(dataSource),
      givenDevice,
      givenDays: async (deviceId: string, days: readonly DailySteps[]) => {
        await dataSource
          .getRepository(DailyStepsEntity)
          .insert(days.map((daily) => dailyStepsToRow(deviceId, daily)));
      },
    }));
  });

  describe('TypeOrmGoalRepository', () => {
    goalRepositoryContract(() => ({
      repository: new TypeOrmGoalRepository(dataSource),
      givenAccount,
    }));
  });

  describe('TypeOrmReadingsUnitOfWork', () => {
    readingsUnitOfWorkContract(() => ({
      unitOfWork: new TypeOrmReadingsUnitOfWork(dataSource),
      dailySteps: new TypeOrmDailyStepsRepository(dataSource),
      givenDevice,
      givenGoal: async (deviceId, change) => {
        const accountId = await new TypeOrmDeviceRepository(dataSource).accountOf(deviceId);
        if (accountId === undefined) throw new Error('Appareil de test inconnu');
        await new TypeOrmGoalRepository(dataSource).record(accountId, change);
      },
      storedEvents: async (deviceId) =>
        (
          await dataSource
            .getRepository(OutboxEventEntity)
            .createQueryBuilder('event')
            .where('event.event_key LIKE :pattern', { pattern: `%${deviceId}%` })
            .getMany()
        ).map(({ eventKey, type, payload }) => ({
          key: eventKey,
          type,
          // jsonb relu tel qu'écrit : le contrat compare le contenu.
          payload: payload as OutboxEvent['payload'],
        })),
    }));
  });

  describe('TypeOrmTimeZoneRepository', () => {
    timeZoneRepositoryContract(() => ({
      repository: new TypeOrmTimeZoneRepository(dataSource),
      givenDevice,
      givenPeriods: async (deviceId: string, periods: readonly TimeZonePeriod[]) => {
        await dataSource
          .getRepository(DeviceTimeZoneEntity)
          .insert(periods.map((period) => periodToRow(deviceId, period)));
      },
    }));
  });
});
