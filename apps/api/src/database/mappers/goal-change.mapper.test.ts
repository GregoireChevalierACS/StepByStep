import { DailyGoal, LocalDate } from '@stepbystep/domain';
import { describe, expect, it } from 'vitest';
import { unwrap } from '../../testing/unwrap.js';
import { goalChangeToDomain, goalChangeToRow } from './goal-change.mapper.js';

const ACCOUNT_ID = '5d6e7f80-91a2-4b3c-8d4e-5f6071829304';

describe('mapper des changements d’objectif', () => {
  it('traduit un changement du domaine en ligne de base (LocalDate → AAAA-MM-JJ)', () => {
    const change = {
      goal: unwrap(DailyGoal.create(12_000)),
      effectiveFrom: unwrap(LocalDate.create('2026-10-10')),
    };

    expect(goalChangeToRow(ACCOUNT_ID, change)).toEqual({
      accountId: ACCOUNT_ID,
      effectiveFrom: '2026-10-10',
      goalSteps: 12_000,
    });
  });

  it('reconstruit le changement du domaine à partir d’une ligne', () => {
    const change = unwrap(
      goalChangeToDomain({ accountId: ACCOUNT_ID, effectiveFrom: '2026-10-10', goalSteps: 12_000 }),
    );

    expect(change.effectiveFrom.toString()).toBe('2026-10-10');
    expect(change.goal.steps.value).toBe(12_000);
  });

  it.each([
    [{ effectiveFrom: '2026-02-30', goalSteps: 12_000 }, 'InvalidLocalDate'],
    [{ effectiveFrom: '2026-10-10', goalSteps: 0 }, 'InvalidDailyGoal'],
  ])('signale une ligne corrompue : %j', (row, kind) => {
    expect(goalChangeToDomain({ accountId: ACCOUNT_ID, ...row })).toMatchObject({
      ok: false,
      error: { kind },
    });
  });
});
