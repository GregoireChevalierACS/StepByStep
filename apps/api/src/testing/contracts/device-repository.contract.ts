import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import type { DeviceRepository } from '../../devices/device.repository.js';

/**
 * Contrat du port DeviceRepository, exécuté contre chaque adapter (en mémoire, PostgreSQL) :
 * le fake utilisé par les tests unitaires est ainsi tenu de se comporter comme la vraie base.
 */
export const deviceRepositoryContract = (repository: () => DeviceRepository): void => {
  it('enregistre un appareil rattaché à un nouveau compte', async () => {
    const { accountId, deviceId } = await repository().registerWithNewAccount();

    expect(accountId).not.toBe(deviceId);
    expect(await repository().exists(deviceId)).toBe(true);
  });

  it('crée un compte et un appareil différents à chaque enregistrement', async () => {
    const first = await repository().registerWithNewAccount();
    const second = await repository().registerWithNewAccount();

    expect(second.accountId).not.toBe(first.accountId);
    expect(second.deviceId).not.toBe(first.deviceId);
  });

  it('ne connaît pas un appareil jamais enregistré', async () => {
    expect(await repository().exists(randomUUID())).toBe(false);
  });
};
