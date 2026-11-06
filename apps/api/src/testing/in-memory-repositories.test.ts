import { beforeEach, describe } from 'vitest';
import { accountRepositoryContract } from './contracts/account-repository.contract.js';
import { dailyStepsRepositoryContract } from './contracts/daily-steps-repository.contract.js';
import { deviceRepositoryContract } from './contracts/device-repository.contract.js';
import { goalRepositoryContract } from './contracts/goal-repository.contract.js';
import { outboxContract } from './contracts/outbox.contract.js';
import { readingsUnitOfWorkContract } from './contracts/readings-unit-of-work.contract.js';
import { timeZoneRepositoryContract } from './contracts/time-zone-repository.contract.js';
import { InMemoryAccountRepository } from './in-memory-account.repository.js';
import { InMemoryDailyStepsRepository } from './in-memory-daily-steps.repository.js';
import { InMemoryDeviceRepository } from './in-memory-device.repository.js';
import { InMemoryGoalRepository } from './in-memory-goal.repository.js';
import { InMemoryOutbox } from './in-memory-outbox.js';
import { InMemoryReadingsUnitOfWork } from './in-memory-readings-unit-of-work.js';
import { type InMemoryStores, inMemoryStores } from './in-memory-stores.js';
import { InMemoryTimeZoneRepository } from './in-memory-time-zone.repository.js';
import { ANY_SECRET_HASH } from './fixtures.js';

// Les fakes des tests unitaires passent les mêmes contrats que les adapters PostgreSQL.
describe('adapters en mémoire', () => {
  let devices: InMemoryDeviceRepository;
  const givenDevice = async () => (await devices.registerWithNewAccount(ANY_SECRET_HASH)).deviceId;
  const givenAccount = async () =>
    (await devices.registerWithNewAccount(ANY_SECRET_HASH)).accountId;

  beforeEach(() => {
    devices = new InMemoryDeviceRepository();
  });

  describe('InMemoryDeviceRepository', () => {
    deviceRepositoryContract(() => devices);
  });

  describe('InMemoryAccountRepository', () => {
    accountRepositoryContract(() => {
      const stores = inMemoryStores(devices);
      return {
        repository: new InMemoryAccountRepository(stores),
        givenAccount,
        devices,
        goals: stores.goals,
        timeZones: stores.timeZones,
        dailySteps: stores.dailySteps,
        unitOfWork: new InMemoryReadingsUnitOfWork(stores),
        storedEvents: (deviceId) =>
          Promise.resolve(stores.outbox.all().filter(({ key }) => key.includes(deviceId))),
      };
    });
  });

  describe('InMemoryDailyStepsRepository', () => {
    let repository: InMemoryDailyStepsRepository;
    beforeEach(() => {
      repository = new InMemoryDailyStepsRepository();
    });

    dailyStepsRepositoryContract(() => ({
      repository,
      givenDevice,
      givenDays: (deviceId, days) => {
        repository.given(deviceId, days);
        return Promise.resolve();
      },
    }));
  });

  describe('InMemoryGoalRepository', () => {
    let repository: InMemoryGoalRepository;
    beforeEach(() => {
      repository = new InMemoryGoalRepository();
    });

    goalRepositoryContract(() => ({ repository, givenAccount }));
  });

  describe('InMemoryReadingsUnitOfWork', () => {
    let stores: InMemoryStores;
    let unitOfWork: InMemoryReadingsUnitOfWork;
    beforeEach(() => {
      stores = inMemoryStores(devices);
      unitOfWork = new InMemoryReadingsUnitOfWork(stores);
    });

    readingsUnitOfWorkContract(() => ({
      unitOfWork,
      dailySteps: stores.dailySteps,
      givenDevice,
      givenGoal: async (deviceId, change) => {
        const accountId = await devices.accountOf(deviceId);
        if (accountId === undefined) throw new Error('Appareil de test inconnu');
        await stores.goals.record(accountId, change);
      },
      storedEvents: (deviceId) =>
        Promise.resolve(stores.outbox.all().filter(({ key }) => key.includes(deviceId))),
    }));
  });

  describe('InMemoryOutbox', () => {
    outboxContract(() => {
      const outbox = new InMemoryOutbox();
      return Promise.resolve({
        outbox,
        givenEvents: (events) => {
          outbox.append(events);
          return Promise.resolve();
        },
      });
    });
  });

  describe('InMemoryTimeZoneRepository', () => {
    let repository: InMemoryTimeZoneRepository;
    beforeEach(() => {
      repository = new InMemoryTimeZoneRepository();
    });

    timeZoneRepositoryContract(() => ({
      repository,
      givenDevice,
      givenPeriods: (deviceId, periods) => {
        repository.given(deviceId, periods);
        return Promise.resolve();
      },
    }));
  });
});
