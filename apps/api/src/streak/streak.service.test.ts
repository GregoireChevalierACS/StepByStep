import { randomUUID } from 'node:crypto';
import { DailyGoal, LocalDate, StepCount, TimeZonePeriod } from '@stepbystep/domain';
import { describe, expect, it } from 'vitest';
import { InMemoryDailyStepsRepository } from '../testing/in-memory-daily-steps.repository.js';
import { InMemoryDeviceRepository } from '../testing/in-memory-device.repository.js';
import { InMemoryGoalRepository } from '../testing/in-memory-goal.repository.js';
import { InMemoryTimeZoneRepository } from '../testing/in-memory-time-zone.repository.js';
import { unwrap } from '../testing/unwrap.js';
import { StreakService } from './streak.service.js';

// « Maintenant » figé : le 12/10/2026 à 10:00 à Paris.
const NOW = Date.parse('2026-10-12T08:00:00Z');
const PARIS = unwrap(
  TimeZonePeriod.create({ timeZone: 'Europe/Paris', since: Date.parse('2026-01-01T00:00:00Z') }),
);
const day = (date: string, steps: number) => ({
  date: unwrap(LocalDate.create(date)),
  steps: unwrap(StepCount.create(steps)),
});

const setup = () => {
  const devices = new InMemoryDeviceRepository();
  const timeZones = new InMemoryTimeZoneRepository();
  const dailySteps = new InMemoryDailyStepsRepository();
  const goals = new InMemoryGoalRepository();
  const service = new StreakService(devices, timeZones, dailySteps, goals, { now: () => NOW });
  return { devices, timeZones, dailySteps, goals, service };
};

describe('StreakService', () => {
  it('compte la série avec l’objectif par défaut tant que le compte n’en a fixé aucun', async () => {
    const { devices, timeZones, dailySteps, service } = setup();
    const { deviceId } = await devices.registerWithNewAccount();
    timeZones.given(deviceId, [PARIS]);
    dailySteps.given(deviceId, [
      day('2026-10-10', 10_000),
      day('2026-10-11', 12_000),
      day('2026-10-12', 10_500),
    ]);

    const report = unwrap(await service.compute(deviceId));

    expect(report).toMatchObject({ today: '2026-10-12', streak: 3 });
  });

  it('juge chaque jour avec l’objectif en vigueur ce jour-là', async () => {
    const { devices, timeZones, dailySteps, goals, service } = setup();
    const { accountId, deviceId } = await devices.registerWithNewAccount();
    timeZones.given(deviceId, [PARIS]);
    dailySteps.given(deviceId, [day('2026-10-11', 6000), day('2026-10-12', 6000)]);
    await goals.record(accountId, {
      effectiveFrom: unwrap(LocalDate.create('2026-10-01')),
      goal: unwrap(DailyGoal.create(5000)),
    });
    // Objectif relevé aujourd'hui : il ne s'applique pas à hier.
    await goals.record(accountId, {
      effectiveFrom: unwrap(LocalDate.create('2026-10-12')),
      goal: unwrap(DailyGoal.create(20_000)),
    });

    expect(unwrap(await service.compute(deviceId))).toMatchObject({ streak: 1 });
  });

  it('signale un appareil inconnu, puis un appareil sans fuseau', async () => {
    const { devices, service } = setup();
    const unknown = randomUUID();
    const { deviceId } = await devices.registerWithNewAccount();

    expect(await service.compute(unknown)).toEqual({
      ok: false,
      error: { kind: 'DeviceNotFound', deviceId: unknown },
    });
    expect(await service.compute(deviceId)).toEqual({
      ok: false,
      error: { kind: 'MissingTimeZone', deviceId },
    });
  });
});
