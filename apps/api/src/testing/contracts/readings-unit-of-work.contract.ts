import { randomUUID } from 'node:crypto';
import {
  type DailySteps,
  DailyGoal,
  err,
  type GoalChange,
  LocalDate,
  ok,
  StepCount,
  StepCounterReading,
  TimeZonePeriod,
} from '@stepbystep/domain';
import { expect, it } from 'vitest';
import type { DailyStepsRepository } from '../../daily-steps/daily-steps.repository.js';
import type { OutboxEvent } from '../../events/outbox-event.js';
import type { ReadingsUnitOfWork } from '../../readings/readings-unit-of-work.js';
import { unwrap } from '../unwrap.js';

export interface ReadingsUnitOfWorkFixture {
  readonly unitOfWork: ReadingsUnitOfWork;
  /** Lecture de la projection écrite par l'unité de travail, par le port de lecture. */
  readonly dailySteps: DailyStepsRepository;
  readonly givenDevice: () => Promise<string>;
  /** Fixe un objectif au compte de l'appareil, par l'adapter testé. */
  readonly givenGoal: (deviceId: string, change: GoalChange) => Promise<void>;
  /** Événements de l'outbox dont la clé mentionne l'appareil (base partagée entre tests). */
  readonly storedEvents: (deviceId: string) => Promise<OutboxEvent[]>;
}

const at = (instant: string) => Date.parse(instant);
const reading = (instant: string, stepsSinceBoot: number, bootCount = 7) =>
  unwrap(StepCounterReading.create({ stepsSinceBoot, bootCount, takenAt: at(instant) }));
const PARIS = unwrap(
  TimeZonePeriod.create({ timeZone: 'Europe/Paris', since: at('2026-01-01T00:00:00Z') }),
);
const day = (date: string, steps: number): DailySteps => ({
  date: unwrap(LocalDate.create(date)),
  steps: unwrap(StepCount.create(steps)),
});
const event = (deviceId: string, name: string): OutboxEvent => ({
  key: `test:${deviceId}:${name}`,
  type: 'TestEvent',
  payload: { deviceId, name },
});
const asPlain = (readings: readonly StepCounterReading[]) =>
  readings
    .map((r) => ({ takenAt: r.takenAt, bootCount: r.bootCount, steps: r.stepsSinceBoot.value }))
    .sort((a, b) => a.takenAt - b.takenAt);
const ALL_TIME = [0, at('2100-01-01T00:00:00Z')] as const;

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const waitUntil = async (condition: () => boolean) => {
  while (!condition()) await delay(5);
};

/** Contrat du port ReadingsUnitOfWork (voir deviceRepositoryContract). */
export const readingsUnitOfWorkContract = (fixture: () => ReadingsUnitOfWorkFixture): void => {
  // État d'un appareil, relu dans une nouvelle unité de travail.
  const snapshot = async (
    { unitOfWork, dailySteps, storedEvents }: ReadingsUnitOfWorkFixture,
    id: string,
  ) => {
    const stored = unwrap(
      await unitOfWork.withDeviceLocked(id, async (ledger) =>
        ok({
          periods: (await ledger.timeZonePeriods()).length,
          readings: (await ledger.readingsBetween(...ALL_TIME)).length,
        }),
      ),
    );
    const days = await dailySteps.upTo(id, unwrap(LocalDate.create('2100-01-01')));
    return { ...stored, days: days.length, events: (await storedEvents(id)).length };
  };

  it('valide tout le travail quand il réussit', async () => {
    const f = fixture();
    const deviceId = await f.givenDevice();

    const result = await f.unitOfWork.withDeviceLocked(deviceId, async (ledger) => {
      await ledger.addTimeZonePeriods([PARIS]);
      await ledger.addReadings([reading('2026-10-12T06:00:00Z', 1000)]);
      await ledger.saveDailySteps([day('2026-10-12', 0)]);
      await ledger.appendEvents([event(deviceId, 'a')]);
      return ok('terminé');
    });

    expect(result).toEqual(ok('terminé'));
    expect(await snapshot(f, deviceId)).toEqual({ periods: 1, readings: 1, days: 1, events: 1 });
  });

  it('annule tout le travail quand il renvoie une erreur', async () => {
    const f = fixture();
    const deviceId = await f.givenDevice();

    const result = await f.unitOfWork.withDeviceLocked(deviceId, async (ledger) => {
      await ledger.addTimeZonePeriods([PARIS]);
      await ledger.addReadings([reading('2026-10-12T06:00:00Z', 1000)]);
      await ledger.saveDailySteps([day('2026-10-12', 0)]);
      await ledger.appendEvents([event(deviceId, 'a')]);
      return err('refusé');
    });

    expect(result).toEqual(err('refusé'));
    expect(await snapshot(f, deviceId)).toEqual({ periods: 0, readings: 0, days: 0, events: 0 });
  });

  it('annule tout le travail quand il lève une exception, et la propage', async () => {
    const f = fixture();
    const deviceId = await f.givenDevice();

    await expect(
      f.unitOfWork.withDeviceLocked(deviceId, async (ledger) => {
        await ledger.addReadings([reading('2026-10-12T06:00:00Z', 1000)]);
        throw new Error('panne');
      }),
    ).rejects.toThrow('panne');
    expect(await snapshot(f, deviceId)).toEqual({ periods: 0, readings: 0, days: 0, events: 0 });
  });

  it('signale un appareil inconnu sans exécuter le travail', async () => {
    const { unitOfWork } = fixture();
    const deviceId = randomUUID();
    let executed = false;

    const result = await unitOfWork.withDeviceLocked(deviceId, () => {
      executed = true;
      return Promise.resolve(ok(undefined));
    });

    expect(result).toEqual({ ok: false, error: { kind: 'DeviceNotFound', deviceId } });
    expect(executed).toBe(false);
  });

  it('ignore les relevés et périodes déjà connus, et ne renvoie que les nouveaux instants', async () => {
    const { unitOfWork, givenDevice } = fixture();
    const deviceId = await givenDevice();
    const first = reading('2026-10-12T06:00:00Z', 1000);
    const second = reading('2026-10-12T10:00:00Z', 3000);

    const added = unwrap(
      await unitOfWork.withDeviceLocked(deviceId, async (ledger) => {
        await ledger.addTimeZonePeriods([PARIS]);
        await ledger.addReadings([first]);
        return ok({
          periods: await ledger.addTimeZonePeriods([PARIS]),
          readings: await ledger.addReadings([first, second]),
          stored: await ledger.readingsBetween(...ALL_TIME),
        });
      }),
    );

    expect(added.periods).toEqual([]);
    expect(added.readings).toEqual([second.takenAt]);
    expect(asPlain(added.stored)).toEqual(asPlain([first, second]));
  });

  it('distingue deux relevés au même instant mais de démarrages différents', async () => {
    const { unitOfWork, givenDevice } = fixture();
    const deviceId = await givenDevice();

    const added = unwrap(
      await unitOfWork.withDeviceLocked(deviceId, async (ledger) =>
        ok(
          await ledger.addReadings([
            reading('2026-10-12T06:00:00Z', 1000, 7),
            reading('2026-10-12T06:00:00Z', 10, 8),
          ]),
        ),
      ),
    );

    expect(added).toHaveLength(2);
  });

  it('trouve les relevés voisins d’un instant, bornes incluses ou non', async () => {
    const { unitOfWork, givenDevice } = fixture();
    const deviceId = await givenDevice();
    const six = at('2026-10-12T06:00:00Z');
    const ten = at('2026-10-12T10:00:00Z');
    const noon = at('2026-10-12T12:00:00Z');

    const found = unwrap(
      await unitOfWork.withDeviceLocked(deviceId, async (ledger) => {
        await ledger.addReadings([
          reading('2026-10-12T06:00:00Z', 1000),
          reading('2026-10-12T10:00:00Z', 2000),
          reading('2026-10-12T12:00:00Z', 3000),
        ]);
        return ok({
          before: await ledger.readingInstantBefore(ten, false),
          atOrBefore: await ledger.readingInstantBefore(ten, true),
          after: await ledger.readingInstantAfter(ten, false),
          atOrAfter: await ledger.readingInstantAfter(ten, true),
          none: await ledger.readingInstantBefore(six, false),
          between: await ledger.readingsBetween(ten, noon),
        });
      }),
    );

    expect(found).toMatchObject({ before: six, atOrBefore: ten, after: noon, atOrAfter: ten });
    expect(found.none).toBeUndefined();
    expect(asPlain(found.between).map(({ takenAt }) => takenAt)).toEqual([ten, noon]);
  });

  it('remplace le total d’un jour déjà enregistré', async () => {
    const f = fixture();
    const deviceId = await f.givenDevice();

    for (const steps of [1000, 2500]) {
      await f.unitOfWork.withDeviceLocked(deviceId, async (ledger) => {
        await ledger.saveDailySteps([day('2026-10-12', steps)]);
        return ok(undefined);
      });
    }

    const days = await f.dailySteps.upTo(deviceId, unwrap(LocalDate.create('2026-10-12')));
    expect(days.map(({ steps }) => steps.value)).toEqual([2500]);
  });

  it('relit les totaux déjà enregistrés des jours demandés, triés par jour', async () => {
    const { unitOfWork, givenDevice } = fixture();
    const deviceId = await givenDevice();
    const date = (value: string) => unwrap(LocalDate.create(value));

    const totals = unwrap(
      await unitOfWork.withDeviceLocked(deviceId, async (ledger) => {
        await ledger.saveDailySteps([
          day('2026-10-13', 1300),
          day('2026-10-11', 1100),
          day('2026-10-14', 1400),
        ]);
        return ok(await ledger.dailyStepsBetween(date('2026-10-11'), date('2026-10-13')));
      }),
    );

    expect(totals.map(({ date: d, steps }) => [d.toString(), steps.value])).toEqual([
      ['2026-10-11', 1100],
      ['2026-10-13', 1300],
    ]);
  });

  it('relit les objectifs du compte de l’appareil, et rien sans objectif fixé', async () => {
    const { unitOfWork, givenDevice, givenGoal } = fixture();
    const [deviceId, otherDeviceId] = [await givenDevice(), await givenDevice()];
    await givenGoal(deviceId, {
      effectiveFrom: unwrap(LocalDate.create('2026-10-01')),
      goal: unwrap(DailyGoal.create(8000)),
    });

    const goalsOf = async (id: string) =>
      unwrap(
        await unitOfWork.withDeviceLocked(id, async (ledger) => ok(await ledger.goalChanges())),
      );

    expect(
      (await goalsOf(deviceId)).map(({ effectiveFrom, goal }) => [
        effectiveFrom.toString(),
        goal.steps.value,
      ]),
    ).toEqual([['2026-10-01', 8000]]);
    expect(await goalsOf(otherDeviceId)).toEqual([]);
  });

  it('écrit les événements une seule fois par clé, avec leur contenu', async () => {
    const f = fixture();
    const deviceId = await f.givenDevice();

    for (let attempt = 0; attempt < 2; attempt += 1) {
      unwrap(
        await f.unitOfWork.withDeviceLocked(deviceId, async (ledger) => {
          await ledger.appendEvents([event(deviceId, 'a'), event(deviceId, 'b')]);
          await ledger.appendEvents([event(deviceId, 'a')]);
          return ok(undefined);
        }),
      );
    }

    const stored = (await f.storedEvents(deviceId)).sort((a, b) => a.key.localeCompare(b.key));
    expect(stored).toEqual([event(deviceId, 'a'), event(deviceId, 'b')]);
  });

  it('fait attendre un second travail sur le même appareil jusqu’à la fin du premier', async () => {
    const { unitOfWork, givenDevice } = fixture();
    const deviceId = await givenDevice();
    const events: string[] = [];
    let release: () => void = () => undefined;
    const barrier = new Promise<void>((resolve) => (release = resolve));

    const first = unitOfWork.withDeviceLocked(deviceId, async () => {
      events.push('premier : début');
      await barrier;
      events.push('premier : fin');
      return ok(undefined);
    });
    await waitUntil(() => events.length > 0);
    const second = unitOfWork.withDeviceLocked(deviceId, () => {
      events.push('second');
      return Promise.resolve(ok(undefined));
    });

    await delay(150);
    expect(events).toEqual(['premier : début']);
    release();
    await Promise.all([first, second]);
    expect(events).toEqual(['premier : début', 'premier : fin', 'second']);
  });

  it('ne fait pas attendre un travail sur un autre appareil', async () => {
    const { unitOfWork, givenDevice } = fixture();
    const [deviceId, otherDeviceId] = [await givenDevice(), await givenDevice()];
    let release: () => void = () => undefined;
    const barrier = new Promise<void>((resolve) => (release = resolve));
    let started = false;

    const first = unitOfWork.withDeviceLocked(deviceId, async () => {
      started = true;
      await barrier;
      return ok(undefined);
    });
    await waitUntil(() => started);
    const other = await unitOfWork.withDeviceLocked(otherDeviceId, () =>
      Promise.resolve(ok('libre')),
    );

    expect(other).toEqual(ok('libre'));
    release();
    await first;
  });
};
