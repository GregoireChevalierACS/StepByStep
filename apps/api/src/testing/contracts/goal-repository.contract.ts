import { DailyGoal, type GoalChange, LocalDate } from '@stepbystep/domain';
import { expect, it } from 'vitest';
import type { GoalRepository } from '../../goals/goal.repository.js';
import { unwrap } from '../unwrap.js';

export interface GoalRepositoryFixture {
  readonly repository: GoalRepository;
  readonly givenAccount: () => Promise<string>;
}

const change = (effectiveFrom: string, goal: number): GoalChange => ({
  effectiveFrom: unwrap(LocalDate.create(effectiveFrom)),
  goal: unwrap(DailyGoal.create(goal)),
});
// Ordre indifférent (voir le port) : on compare des listes triées par jour.
const asPlain = (changes: readonly GoalChange[]) =>
  changes
    .map(({ effectiveFrom, goal }) => ({ from: effectiveFrom.toString(), goal: goal.steps.value }))
    .sort((a, b) => a.from.localeCompare(b.from));

/** Contrat du port GoalRepository (voir deviceRepositoryContract). */
export const goalRepositoryContract = (fixture: () => GoalRepositoryFixture): void => {
  it('restitue les changements d’objectif enregistrés', async () => {
    const { repository, givenAccount } = fixture();
    const accountId = await givenAccount();

    await repository.record(accountId, change('2026-10-10', 8000));
    await repository.record(accountId, change('2026-10-01', 6000));

    expect(asPlain(await repository.changesOf(accountId))).toEqual([
      { from: '2026-10-01', goal: 6000 },
      { from: '2026-10-10', goal: 8000 },
    ]);
  });

  it('remplace un objectif déjà fixé le même jour (la dernière décision l’emporte)', async () => {
    const { repository, givenAccount } = fixture();
    const accountId = await givenAccount();

    await repository.record(accountId, change('2026-10-10', 8000));
    await repository.record(accountId, change('2026-10-10', 12000));

    expect(asPlain(await repository.changesOf(accountId))).toEqual([
      { from: '2026-10-10', goal: 12000 },
    ]);
  });

  it('ne mélange pas les objectifs de deux comptes', async () => {
    const { repository, givenAccount } = fixture();
    const accountId = await givenAccount();
    const otherAccountId = await givenAccount();
    await repository.record(otherAccountId, change('2026-10-10', 9000));

    expect(await repository.changesOf(accountId)).toEqual([]);
  });
};
