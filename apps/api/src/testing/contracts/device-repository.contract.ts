import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import type { DeviceRepository } from '../../devices/device.repository.js';
import { ANY_SECRET_HASH } from '../fixtures.js';

/**
 * Contrat du port DeviceRepository, exécuté contre chaque adapter (en mémoire, PostgreSQL) :
 * le fake utilisé par les tests unitaires est ainsi tenu de se comporter comme la vraie base.
 */
export const deviceRepositoryContract = (repository: () => DeviceRepository): void => {
  it('enregistre un appareil rattaché à un nouveau compte', async () => {
    const { accountId, deviceId } = await repository().registerWithNewAccount(ANY_SECRET_HASH);

    expect(accountId).not.toBe(deviceId);
    expect(await repository().exists(deviceId)).toBe(true);
  });

  it('crée un compte et un appareil différents à chaque enregistrement', async () => {
    const first = await repository().registerWithNewAccount(ANY_SECRET_HASH);
    const second = await repository().registerWithNewAccount(ANY_SECRET_HASH);

    expect(second.accountId).not.toBe(first.accountId);
    expect(second.deviceId).not.toBe(first.deviceId);
  });

  it('ne connaît pas un appareil jamais enregistré', async () => {
    expect(await repository().exists(randomUUID())).toBe(false);
  });

  it('donne le compte d’un appareil, et rien pour un appareil inconnu', async () => {
    const { accountId, deviceId } = await repository().registerWithNewAccount(ANY_SECRET_HASH);

    expect(await repository().accountOf(deviceId)).toBe(accountId);
    expect(await repository().accountOf(randomUUID())).toBeUndefined();
  });

  it('restitue l’empreinte du secret de l’appareil, et rien pour un appareil inconnu', async () => {
    const { deviceId } = await repository().registerWithNewAccount('scrypt$sel$empreinte');

    expect(await repository().secretHashOf(deviceId)).toBe('scrypt$sel$empreinte');
    expect(await repository().secretHashOf(randomUUID())).toBeUndefined();
  });
};
