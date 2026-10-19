import {
  type DailySteps,
  err,
  type Result,
  type StepCounterReading,
  type TimeZonePeriod,
} from '@stepbystep/domain';
import type { DeviceNotFound } from '../devices/device-errors.js';
import type { DeviceLedger, ReadingsUnitOfWork } from '../readings/readings-unit-of-work.js';
import type { InMemoryDailyStepsRepository } from './in-memory-daily-steps.repository.js';
import type { InMemoryDeviceRepository } from './in-memory-device.repository.js';
import type { InMemoryTimeZoneRepository } from './in-memory-time-zone.repository.js';

// Même identité qu'en base : clé primaire (appareil, instant, démarrage).
const identityOf = (reading: StepCounterReading) =>
  `${String(reading.takenAt)}:${String(reading.bootCount)}`;

/**
 * Adapter en mémoire de ReadingsUnitOfWork, tenu par le même contrat que l'adapter PostgreSQL.
 * Il partage ses données avec les autres fakes (appareils, fuseaux, pas par jour), comme une
 * base commune. Transaction : le travail écrit dans des modifications en attente, appliquées
 * seulement s'il réussit. Verrou : une file d'attente de promesses par appareil.
 */
export class InMemoryReadingsUnitOfWork implements ReadingsUnitOfWork {
  private readonly readings = new Map<string, StepCounterReading[]>();
  private readonly queues = new Map<string, Promise<void>>();

  constructor(
    private readonly devices: InMemoryDeviceRepository,
    private readonly timeZones: InMemoryTimeZoneRepository,
    private readonly dailySteps: InMemoryDailyStepsRepository,
  ) {}

  async withDeviceLocked<T, E>(
    deviceId: string,
    work: (ledger: DeviceLedger) => Promise<Result<T, E>>,
  ): Promise<Result<T, E | DeviceNotFound>> {
    if (!(await this.devices.exists(deviceId))) return err({ kind: 'DeviceNotFound', deviceId });

    const previous = this.queues.get(deviceId) ?? Promise.resolve();
    let unlock: () => void = () => undefined;
    const current = previous.then(() => new Promise<void>((resolve) => (unlock = resolve)));
    this.queues.set(deviceId, current);
    await previous;
    try {
      const ledger = new StagedLedger(
        await this.timeZones.periodsOf(deviceId),
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
    this.timeZones.given(deviceId, ledger.newPeriods);
    this.readings.set(deviceId, [...(this.readings.get(deviceId) ?? []), ...ledger.newReadings]);
    this.dailySteps.given(deviceId, [...ledger.savedDays.values()]);
  }
}

/** Vue d'un appareil pendant une unité de travail : données validées + modifications en attente. */
class StagedLedger implements DeviceLedger {
  readonly newPeriods: TimeZonePeriod[] = [];
  readonly newReadings: StepCounterReading[] = [];
  readonly savedDays = new Map<string, DailySteps>();

  constructor(
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

  saveDailySteps(days: readonly DailySteps[]): Promise<void> {
    for (const daily of days) this.savedDays.set(daily.date.toString(), daily);
    return Promise.resolve();
  }

  private all(): StepCounterReading[] {
    return [...this.storedReadings, ...this.newReadings];
  }

  private instants(): number[] {
    return this.all().map(({ takenAt }) => takenAt);
  }
}
