import { randomUUID } from 'node:crypto';
import { DailyGoal, type GoalChange, LocalDate } from '@stepbystep/domain';
import { describe, expect, it } from 'vitest';
import { InMemoryAccountRepository } from '../testing/in-memory-account.repository.js';
import { InMemoryDeviceRepository } from '../testing/in-memory-device.repository.js';
import { InMemoryGoalRepository } from '../testing/in-memory-goal.repository.js';
import { unwrap } from '../testing/unwrap.js';
import { GoalsService } from './goals.service.js';

const setup = () => {
  const devices = new InMemoryDeviceRepository();
  const service = new GoalsService(
    new InMemoryAccountRepository(devices),
    new InMemoryGoalRepository(),
  );
  return { devices, service };
};
const change = (effectiveFrom: string, goal: number): GoalChange => ({
  effectiveFrom: unwrap(LocalDate.create(effectiveFrom)),
  goal: unwrap(DailyGoal.create(goal)),
});

describe('GoalsService', () => {
  it('renvoie l’historique normalisé par le domaine (chronologique, sans redondance)', async () => {
    const { devices, service } = setup();
    const { accountId } = await devices.registerWithNewAccount();

    await service.set(accountId, change('2026-10-10', 8000));
    await service.set(accountId, change('2026-10-01', 6000));
    const history = await service.set(accountId, change('2026-10-20', 8000));

    expect(unwrap(history)).toEqual([
      { effectiveFrom: '2026-10-01', goal: 6000 },
      { effectiveFrom: '2026-10-10', goal: 8000 },
    ]);
  });

  it('signale un compte inconnu', async () => {
    const { service } = setup();
    const accountId = randomUUID();

    expect(await service.set(accountId, change('2026-10-10', 8000))).toEqual({
      ok: false,
      error: { kind: 'AccountNotFound', accountId },
    });
  });
});
