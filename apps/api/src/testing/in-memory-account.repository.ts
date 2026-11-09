import type { Nickname } from '@stepbystep/domain';
import type { AccountRepository } from '../accounts/account.repository.js';
import type { InMemoryStores } from './in-memory-stores.js';

/**
 * Adapter en mémoire d'AccountRepository. En 8a, un compte naît avec son premier appareil :
 * les comptes connus sont ceux des appareils enregistrés, comme dans la vraie base.
 */
export class InMemoryAccountRepository implements AccountRepository {
  constructor(private readonly stores: InMemoryStores) {}

  exists(accountId: string): Promise<boolean> {
    return Promise.resolve(this.stores.devices.hasAccount(accountId));
  }

  nicknameOf(accountId: string): Promise<Nickname | undefined> {
    return Promise.resolve(this.stores.nicknames.get(accountId));
  }

  setNickname(accountId: string, nickname: Nickname): Promise<void> {
    // Comme l'UPDATE en base : sans effet sur un compte inconnu.
    if (this.stores.devices.hasAccount(accountId)) this.stores.nicknames.set(accountId, nickname);
    return Promise.resolve();
  }

  /**
   * Cascade des clés étrangères, à la main. Les relevés, gardés par l'unité de travail en
   * mémoire, deviennent inaccessibles : elle refuse tout appareil inconnu (DeviceNotFound).
   */
  delete(accountId: string): Promise<void> {
    const { devices, nicknames, timeZones, dailySteps, goals, outbox, groups, weeklyResults } =
      this.stores;
    for (const deviceId of devices.forgetAccount(accountId)) {
      timeZones.forgetDevice(deviceId);
      dailySteps.forgetDevice(deviceId);
      outbox.forgetDevice(deviceId);
    }
    goals.forgetAccount(accountId);
    groups.forgetAccount(accountId);
    weeklyResults.forgetAccount(accountId);
    nicknames.delete(accountId);
    return Promise.resolve();
  }
}
