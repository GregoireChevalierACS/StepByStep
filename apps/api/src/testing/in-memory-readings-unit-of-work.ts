import {
  type DailySteps,
  err,
  type GoalChange,
  type LocalDate,
  type Result,
  type StepCounterReading,
  type TimeZonePeriod,
} from '@stepbystep/domain';
import type { DeviceNotFound } from '../devices/device-errors.js';
import type { OutboxEvent } from '../events/outbox-event.js';
import type { DeviceLedger, ReadingsUnitOfWork } from '../readings/readings-unit-of-work.js';
import type { InMemoryDailyStepsRepository } from './in-memory-daily-steps.repository.js';
import type { InMemoryDeviceRepository } from './in-memory-device.repository.js';
import type { InMemoryGoalRepository } from './in-memory-goal.repository.js';
import type { InMemoryOutbox } from './in-memory-outbox.js';
import type { InMemoryTimeZoneRepository } from './in-memory-time-zone.repository.js';

// Même identité qu'en base : clé primaire (appareil, instant, démarrage).
const identityOf = (reading: StepCounterReading) =>
  `${String(reading.takenAt)}:${String(reading.bootCount)}`;

/** Données partagées avec les autres fakes, comme les tables d'une base commune. */
export interface InMemoryStores {
  readonly devices: InMemoryDeviceRepository;
  readonly timeZones: InMemoryTimeZoneRepository;
  readonly dailySteps: InMemoryDailyStepsRepository;
  readonly goals: InMemoryGoalRepository;
  readonly outbox: InMemoryOutbox;
}

/**
 * Adapter en mémoire de ReadingsUnitOfWork, tenu par le même contrat que l'adapter PostgreSQL.
 * Transaction : le travail écrit dans des modifications en attente, appliquées seulement s'il
 * réussit. Verrou : une file d'attente de promesses par appareil.
 */
export class InMemoryReadingsUnitOfWork implements ReadingsUnitOfWork {
  private readonly readings = new Map<string, StepCounterReading[]>();
  private readonly queues = new Map<string, Promise<void>>();

  constructor(private readonly stores: InMemoryStores) {}

  async withDeviceLocked<T, E>(
    deviceId: string,
    work: (ledger: DeviceLedger) => Promise<Result<T, E>>,
  ): Promise<Result<T, E | DeviceNotFound>> {
    const accountId = await this.stores.devices.accountOf(deviceId);
    if (accountId === undefined) return err({ kind: 'DeviceNotFound', deviceId });

    const previous = this.queues.get(deviceId) ?? Promise.resolve();
    let unlock: () => void = () => undefined;
    const current = previous.then(() => new Promise<void>((resolve) => (unlock = resolve)));
    this.queues.set(deviceId, current);
    await previous;
    try {
      const ledger = new StagedLedger(
        this.stores,
        deviceId,
        accountId,
        await this.stores.timeZones.periodsOf(deviceId),
        this.readings.get(deviceId) ?? [],
      );
      const result = await work(ledger);
      if (result.ok) this.commit(deviceId, ledger);
      return result;
    } finally {
      unlock();
    }
  }

  private commit(deviceId: string, ledger: StagedLedger): void {
    this.stores.timeZones.given(deviceId, ledger.newPeriods);
    this.readings.set(deviceId, [...(this.readings.get(deviceId) ?? []), ...ledger.newReadings]);
    this.stores.dailySteps.given(deviceId, [...ledger.savedDays.values()]);
    this.stores.outbox.append(ledger.newEvents);
  }
}

/** Vue d'un appareil pendant une unité de travail : données validées + modifications en attente. */
class StagedLedger implements DeviceLedger {
  readonly newPeriods: TimeZonePeriod[] = [];
  readonly newReadings: StepCounterReading[] = [];
  readonly savedDays = new Map<string, DailySteps>();
  readonly newEvents: OutboxEvent[] = [];

  constructor(
    private readonly stores: InMemoryStores,
    private readonly deviceId: string,
    private readonly accountId: string,
    private readonly storedPeriods: readonly TimeZonePeriod[],
    private readonly storedReadings: readonly StepCounterReading[],
  ) {}

  timeZonePeriods(): Promise<TimeZonePeriod[]> {
    return Promise.resolve([...this.storedPeriods, ...this.newPeriods]);
  }

  async addTimeZonePeriods(periods: readonly TimeZonePeriod[]): Promise<number[]> {
    const added: number[] = [];
    for (const period of periods) {
      const known = (await this.timeZonePeriods()).some(({ since }) => since === period.since);
      if (known) continue;
      this.newPeriods.push(period);
      added.push(period.since);
    }
    return added;
  }

  addReadings(readings: readonly StepCounterReading[]): Promise<number[]> {
    const known = new Set(this.all().map(identityOf));
    const added: number[] = [];
    for (const reading of readings) {
      if (known.has(identityOf(reading))) continue;
      known.add(identityOf(reading));
      this.newReadings.push(reading);
      added.push(reading.takenAt);
    }
    return Promise.resolve(added);
  }

  readingInstantBefore(instant: number, inclusive: boolean): Promise<number | undefined> {
    const before = this.instants().filter((t) => t < instant || (inclusive && t === instant));
    return Promise.resolve(before.length > 0 ? Math.max(...before) : undefined);
  }

  readingInstantAfter(instant: number, inclusive: boolean): Promise<number | undefined> {
    const after = this.instants().filter((t) => t > instant || (inclusive && t === instant));
    return Promise.resolve(after.length > 0 ? Math.min(...after) : undefined);
  }

  readingsBetween(from: number, to: number): Promise<StepCounterReading[]> {
    return Promise.resolve(this.all().filter(({ takenAt }) => takenAt >= from && takenAt <= to));
  }

  async dailyStepsBetween(from: LocalDate, to: LocalDate): Promise<DailySteps[]> {
    const days = new Map(
      (await this.stores.dailySteps.between(this.deviceId, from, to)).map((daily) => [
        daily.date.toString(),
        daily,
      ]),
    );
    for (const daily of this.savedDays.values()) {
      if (daily.date.compareTo(from) >= 0 && daily.date.compareTo(to) <= 0) {
        days.set(daily.date.toString(), daily);
      }
    }
    return [...days.values()].sort((a, b) => a.date.compareTo(b.date));
  }

  saveDailySteps(days: readonly DailySteps[]): Promise<void> {
    for (const daily of days) this.savedDays.set(daily.date.toString(), daily);
    return Promise.resolve();
  }

  goalChanges(): Promise<GoalChange[]> {
    return this.stores.goals.changesOf(this.accountId);
  }

  appendEvents(events: readonly OutboxEvent[]): Promise<void> {
    for (const event of events) {
      const known =
        this.stores.outbox.has(event.key) || this.newEvents.some(({ key }) => key === event.key);
      if (!known) this.newEvents.push(event);
    }
    return Promise.resolve();
  }

  private all(): StepCounterReading[] {
    return [...this.storedReadings, ...this.newReadings];
  }

  private instants(): number[] {
    return this.all().map(({ takenAt }) => takenAt);
  }
}
