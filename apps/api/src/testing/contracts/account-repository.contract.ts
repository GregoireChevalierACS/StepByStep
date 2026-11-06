import { randomUUID } from 'node:crypto';
import {
  DailyGoal,
  LocalDate,
  ok,
  StepCount,
  StepCounterReading,
  TimeZonePeriod,
} from '@stepbystep/domain';
import { expect, it } from 'vitest';
import type { AccountRepository } from '../../accounts/account.repository.js';
import type { DailyStepsRepository } from '../../daily-steps/daily-steps.repository.js';
import type { DeviceRepository, RegisteredDevice } from '../../devices/device.repository.js';
import type { OutboxEvent } from '../../events/outbox-event.js';
import type { GoalRepository } from '../../goals/goal.repository.js';
import type { ReadingsUnitOfWork } from '../../readings/readings-unit-of-work.js';
import type { TimeZoneRepository } from '../../time/time-zone.repository.js';
import { ANY_SECRET_HASH } from '../fixtures.js';
import { unwrap } from '../unwrap.js';

/** Adapters d'une même base : le contrat écrit par les uns et vérifie l'effacement par tous. */
export interface AccountRepositoryFixture {
  readonly repository: AccountRepository;
  readonly givenAccount: () => Promise<string>;
  readonly devices: DeviceRepository;
  readonly goals: GoalRepository;
  readonly timeZones: TimeZoneRepository;
  readonly dailySteps: DailyStepsRepository;
  readonly unitOfWork: ReadingsUnitOfWork;
  /** Événements de l'outbox dont la clé mentionne l'appareil (base partagée entre tests). */
  readonly storedEvents: (deviceId: string) => Promise<OutboxEvent[]>;
}

const at = (instant: string) => Date.parse(instant);
const ALL_TIME = [0, at('2100-01-01T00:00:00Z')] as const;
const date = (iso: string) => unwrap(LocalDate.create(iso));

/** Contrat du port AccountRepository (voir deviceRepositoryContract). */
export const accountRepositoryContract = (fixture: () => AccountRepositoryFixture): void => {
  // Un appareil et son compte, avec une donnée dans chaque table qui les concerne.
  const givenDeviceWithData = async (f: AccountRepositoryFixture): Promise<RegisteredDevice> => {
    const registered = await f.devices.registerWithNewAccount(ANY_SECRET_HASH);
    const { accountId, deviceId } = registered;
    await f.goals.record(accountId, {
      effectiveFrom: date('2026-10-01'),
      goal: unwrap(DailyGoal.create(10_000)),
    });
    unwrap(
      await f.unitOfWork.withDeviceLocked(deviceId, async (ledger) => {
        await ledger.addTimeZonePeriods([
          unwrap(TimeZonePeriod.create({ timeZone: 'Europe/Paris', since: at('2026-01-01') })),
        ]);
        await ledger.addReadings([
          unwrap(
            StepCounterReading.create({
              stepsSinceBoot: 12_000,
              bootCount: 7,
              takenAt: at('2026-10-12T18:00:00Z'),
            }),
          ),
        ]);
        await ledger.saveDailySteps([
          { date: date('2026-10-12'), steps: unwrap(StepCount.create(12_000)) },
        ]);
        await ledger.appendEvents([
          { key: `test:${deviceId}:effacement`, type: 'TestEvent', payload: { deviceId } },
        ]);
        return ok(undefined);
      }),
    );
    return registered;
  };

  // Ce qui reste d'un compte et de son appareil, vu par chaque port.
  const remains = async (
    f: AccountRepositoryFixture,
    { accountId, deviceId }: RegisteredDevice,
  ) => {
    const readings = await f.unitOfWork.withDeviceLocked(deviceId, async (ledger) =>
      ok((await ledger.readingsBetween(...ALL_TIME)).length),
    );
    return {
      account: await f.repository.exists(accountId),
      device: await f.devices.exists(deviceId),
      goals: (await f.goals.changesOf(accountId)).length,
      timeZones: (await f.timeZones.periodsOf(deviceId)).length,
      readings: readings.ok ? readings.value : 0,
      dailySteps: (await f.dailySteps.upTo(deviceId, date('2100-01-01'))).length,
      events: (await f.storedEvents(deviceId)).length,
    };
  };
  const EVERYTHING = {
    account: true,
    device: true,
    goals: 1,
    timeZones: 1,
    readings: 1,
    dailySteps: 1,
    events: 1,
  };
  const NOTHING = {
    account: false,
    device: false,
    goals: 0,
    timeZones: 0,
    readings: 0,
    dailySteps: 0,
    events: 0,
  };

  it('connaît un compte enregistré, et pas un compte inconnu', async () => {
    const { repository, givenAccount } = fixture();
    const accountId = await givenAccount();

    expect(await repository.exists(accountId)).toBe(true);
    expect(await repository.exists(randomUUID())).toBe(false);
  });

  it('efface le compte et toutes ses données', async () => {
    const f = fixture();
    const registered = await givenDeviceWithData(f);
    expect(await remains(f, registered)).toEqual(EVERYTHING);

    await f.repository.delete(registered.accountId);

    expect(await remains(f, registered)).toEqual(NOTHING);
  });

  it('n’efface rien des autres comptes', async () => {
    const f = fixture();
    const deleted = await givenDeviceWithData(f);
    const kept = await givenDeviceWithData(f);

    await f.repository.delete(deleted.accountId);

    expect(await remains(f, kept)).toEqual(EVERYTHING);
  });

  it('est sans effet sur un compte déjà effacé ou inconnu', async () => {
    const f = fixture();
    const registered = await givenDeviceWithData(f);
    await f.repository.delete(registered.accountId);

    await f.repository.delete(registered.accountId);
    await f.repository.delete(randomUUID());

    expect(await remains(f, registered)).toEqual(NOTHING);
  });
};
