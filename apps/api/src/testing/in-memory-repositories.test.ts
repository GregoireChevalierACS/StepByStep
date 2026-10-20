import { beforeEach, describe } from 'vitest';
import { accountRepositoryContract } from './contracts/account-repository.contract.js';
import { dailyStepsRepositoryContract } from './contracts/daily-steps-repository.contract.js';
import { deviceRepositoryContract } from './contracts/device-repository.contract.js';
import { goalRepositoryContract } from './contracts/goal-repository.contract.js';
import { readingsUnitOfWorkContract } from './contracts/readings-unit-of-work.contract.js';
import { timeZoneRepositoryContract } from './contracts/time-zone-repository.contract.js';
import { InMemoryAccountRepository } from './in-memory-account.repository.js';
import { InMemoryDailyStepsRepository } from './in-memory-daily-steps.repository.js';
import { InMemoryDeviceRepository } from './in-memory-device.repository.js';
import { InMemoryGoalRepository } from './in-memory-goal.repository.js';
import { InMemoryReadingsUnitOfWork } from './in-memory-readings-unit-of-work.js';
import { InMemoryTimeZoneRepository } from './in-memory-time-zone.repository.js';

// Les fakes des tests unitaires passent les mêmes contrats que les adapters PostgreSQL.
describe('adapters en mémoire', () => {
  let devices: InMemoryDeviceRepository;
  const givenDevice = async () => (await devices.registerWithNewAccount()).deviceId;
  const givenAccount = async () => (await devices.registerWithNewAccount()).accountId;

  beforeEach(() => {
    devices = new InMemoryDeviceRepository();
  });

  describe('InMemoryDeviceRepository', () => {
    deviceRepositoryContract(() => devices);
  });

  describe('InMemoryAccountRepository', () => {
    accountRepositoryContract(() => ({
      repository: new InMemoryAccountRepository(devices),
      givenAccount,
    }));
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
    let dailySteps: InMemoryDailyStepsRepository;
    let unitOfWork: InMemoryReadingsUnitOfWork;
    beforeEach(() => {
      dailySteps = new InMemoryDailyStepsRepository();
      unitOfWork = new InMemoryReadingsUnitOfWork(
        devices,
        new InMemoryTimeZoneRepository(),
        dailySteps,
      );
    });

    readingsUnitOfWorkContract(() => ({ unitOfWork, dailySteps, givenDevice }));
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
