import { InMemoryDailyStepsRepository } from './in-memory-daily-steps.repository.js';
import { InMemoryDeviceRepository } from './in-memory-device.repository.js';
import { InMemoryGoalRepository } from './in-memory-goal.repository.js';
import { InMemoryOutbox } from './in-memory-outbox.js';
import { InMemoryTimeZoneRepository } from './in-memory-time-zone.repository.js';

/** Données partagées entre les fakes, comme les tables d'une base commune. */
export interface InMemoryStores {
  readonly devices: InMemoryDeviceRepository;
  readonly timeZones: InMemoryTimeZoneRepository;
  readonly dailySteps: InMemoryDailyStepsRepository;
  readonly goals: InMemoryGoalRepository;
  readonly outbox: InMemoryOutbox;
}

/** Une « base » en mémoire vide ; `devices` permet de partager un registre déjà créé. */
export const inMemoryStores = (
  devices: InMemoryDeviceRepository = new InMemoryDeviceRepository(),
): InMemoryStores => ({
  devices,
  timeZones: new InMemoryTimeZoneRepository(),
  dailySteps: new InMemoryDailyStepsRepository(),
  goals: new InMemoryGoalRepository(),
  outbox: new InMemoryOutbox(),
});
