import { describe, expect, it } from 'vitest';
import { ANY_SECRET_HASH } from '../testing/fixtures.js';
import { InMemoryAccountRepository } from '../testing/in-memory-account.repository.js';
import { inMemoryStores } from '../testing/in-memory-stores.js';
import { AccountsService } from './accounts.service.js';

const setup = () => {
  const stores = inMemoryStores();
  const accounts = new InMemoryAccountRepository(stores);
  return { stores, accounts, service: new AccountsService(accounts) };
};

describe('AccountsService', () => {
  it('efface le compte et ses appareils', async () => {
    const { stores, accounts, service } = setup();
    const { accountId, deviceId } = await stores.devices.registerWithNewAccount(ANY_SECRET_HASH);

    await service.delete(accountId);

    expect(await accounts.exists(accountId)).toBe(false);
    expect(await stores.devices.exists(deviceId)).toBe(false);
  });

  it('accepte un compte déjà effacé sans erreur (idempotent)', async () => {
    const { stores, service } = setup();
    const { accountId } = await stores.devices.registerWithNewAccount(ANY_SECRET_HASH);
    await service.delete(accountId);

    await expect(service.delete(accountId)).resolves.toBeUndefined();
  });
});
