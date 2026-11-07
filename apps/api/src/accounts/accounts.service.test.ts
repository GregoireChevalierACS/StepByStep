import { randomUUID } from 'node:crypto';
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
  describe('pseudo', () => {
    it('enregistre et renvoie la forme normalisée du pseudo', async () => {
      const { stores, accounts, service } = setup();
      const { accountId } = await stores.devices.registerWithNewAccount(ANY_SECRET_HASH);

      const result = await service.setNickname(accountId, '  Zoé   la  rapide ');

      expect(result.ok && result.value.value).toBe('Zoé la rapide');
      expect((await accounts.nicknameOf(accountId))?.value).toBe('Zoé la rapide');
    });

    it('refuse un pseudo invalide sans rien enregistrer', async () => {
      const { stores, accounts, service } = setup();
      const { accountId } = await stores.devices.registerWithNewAccount(ANY_SECRET_HASH);

      const result = await service.setNickname(accountId, '<b>');

      expect(result).toEqual({
        ok: false,
        error: { kind: 'InvalidNickname', value: '<b>', reason: 'Characters' },
      });
      expect(await accounts.nicknameOf(accountId)).toBeUndefined();
    });

    it('signale un compte inconnu', async () => {
      const { service } = setup();
      const accountId = randomUUID();

      expect(await service.setNickname(accountId, 'Zoé')).toEqual({
        ok: false,
        error: { kind: 'AccountNotFound', accountId },
      });
    });
  });

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
