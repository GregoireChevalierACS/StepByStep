import { randomUUID } from 'node:crypto';
import { LocalDate, StepCount } from '@stepbystep/domain';
import { describe, expect, it } from 'vitest';
import { InMemoryDailyStepsRepository } from '../testing/in-memory-daily-steps.repository.js';
import { InMemoryDeviceRepository } from '../testing/in-memory-device.repository.js';
import { unwrap } from '../testing/unwrap.js';
import { DailyStepsService } from './daily-steps.service.js';
import { ANY_SECRET_HASH } from '../testing/fixtures.js';

// Cas d'usage testé sans base ni NestJS : ses ports sont remplacés par les adapters en mémoire.
const setup = () => {
  const devices = new InMemoryDeviceRepository();
  const dailySteps = new InMemoryDailyStepsRepository();
  return { devices, dailySteps, service: new DailyStepsService(devices, dailySteps) };
};

describe('DailyStepsService', () => {
  it('renvoie les pas par jour de la période, au format de l’API', async () => {
    const { devices, dailySteps, service } = setup();
    const { deviceId } = await devices.registerWithNewAccount(ANY_SECRET_HASH);
    dailySteps.given(deviceId, [
      { date: unwrap(LocalDate.create('2026-10-05')), steps: unwrap(StepCount.create(2800)) },
    ]);

    const result = await service.read(deviceId, { from: '2026-10-05', to: '2026-10-06' });

    expect(unwrap(result)).toEqual([{ day: '2026-10-05', steps: 2800 }]);
  });

  it('signale un appareil inconnu', async () => {
    const { service } = setup();
    const deviceId = randomUUID();

    const result = await service.read(deviceId, { from: '2026-10-05', to: '2026-10-06' });

    expect(result).toEqual({ ok: false, error: { kind: 'DeviceNotFound', deviceId } });
  });
});
