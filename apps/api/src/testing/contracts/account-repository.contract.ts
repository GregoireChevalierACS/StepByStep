import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import type { AccountRepository } from '../../accounts/account.repository.js';

export interface AccountRepositoryFixture {
  readonly repository: AccountRepository;
  readonly givenAccount: () => Promise<string>;
}

/** Contrat du port AccountRepository (voir deviceRepositoryContract). */
export const accountRepositoryContract = (fixture: () => AccountRepositoryFixture): void => {
  it('connaît un compte enregistré, et pas un compte inconnu', async () => {
    const { repository, givenAccount } = fixture();
    const accountId = await givenAccount();

    expect(await repository.exists(accountId)).toBe(true);
    expect(await repository.exists(randomUUID())).toBe(false);
  });
};
