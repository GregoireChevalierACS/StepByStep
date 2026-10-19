import { beforeEach, describe } from 'vitest';
import { dailyStepsRepositoryContract } from './contracts/daily-steps-repository.contract.js';
import { deviceRepositoryContract } from './contracts/device-repository.contract.js';
import { InMemoryDailyStepsRepository } from './in-memory-daily-steps.repository.js';
import { InMemoryDeviceRepository } from './in-memory-device.repository.js';

// Les fakes des tests unitaires passent les mêmes contrats que les adapters PostgreSQL.
describe('InMemoryDeviceRepository', () => {
  let repository: InMemoryDeviceRepository;
  beforeEach(() => {
    repository = new InMemoryDeviceRepository();
  });

  deviceRepositoryContract(() => repository);
});

describe('InMemoryDailyStepsRepository', () => {
  let devices: InMemoryDeviceRepository;
  let repository: InMemoryDailyStepsRepository;
  beforeEach(() => {
    devices = new InMemoryDeviceRepository();
    repository = new InMemoryDailyStepsRepository();
  });

  dailyStepsRepositoryContract(() => ({
    repository,
    givenDevice: async () => (await devices.registerWithNewAccount()).deviceId,
    givenDays: (deviceId, days) => {
      repository.given(deviceId, days);
      return Promise.resolve();
    },
  }));
});
