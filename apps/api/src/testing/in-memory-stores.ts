import type { Nickname } from '@stepbystep/domain';
import { InMemoryDailyStepsRepository } from './in-memory-daily-steps.repository.js';
import { InMemoryDeviceRepository } from './in-memory-device.repository.js';
import { InMemoryGoalRepository } from './in-memory-goal.repository.js';
import { InMemoryGroupRepository } from './in-memory-group.repository.js';
import { InMemoryOutbox } from './in-memory-outbox.js';
import { InMemoryTimeZoneRepository } from './in-memory-time-zone.repository.js';

/** Données partagées entre les fakes, comme les tables d'une base commune. */
export interface InMemoryStores {
  readonly devices: InMemoryDeviceRepository;
  /** Pseudo de chaque compte (colonne accounts.nickname). */
  readonly nicknames: Map<string, Nickname>;
  readonly timeZones: InMemoryTimeZoneRepository;
  readonly dailySteps: InMemoryDailyStepsRepository;
  readonly goals: InMemoryGoalRepository;
  readonly outbox: InMemoryOutbox;
  readonly groups: InMemoryGroupRepository;
}

/** Une « base » en mémoire vide ; `devices` permet de partager un registre déjà créé. */
export const inMemoryStores = (
  devices: InMemoryDeviceRepository = new InMemoryDeviceRepository(),
): InMemoryStores => {
  const nicknames = new Map<string, Nickname>();
  return {
    devices,
    nicknames,
    timeZones: new InMemoryTimeZoneRepository(),
    dailySteps: new InMemoryDailyStepsRepository(),
    goals: new InMemoryGoalRepository(),
    outbox: new InMemoryOutbox(),
    groups: new InMemoryGroupRepository(nicknames),
  };
};
