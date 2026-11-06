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

  /**
   * Cascade des clés étrangères, à la main. Les relevés, gardés par l'unité de travail en
   * mémoire, deviennent inaccessibles : elle refuse tout appareil inconnu (DeviceNotFound).
   */
  delete(accountId: string): Promise<void> {
    const { devices, timeZones, dailySteps, goals, outbox } = this.stores;
    for (const deviceId of devices.forgetAccount(accountId)) {
      timeZones.forgetDevice(deviceId);
      dailySteps.forgetDevice(deviceId);
      outbox.forgetDevice(deviceId);
    }
    goals.forgetAccount(accountId);
    return Promise.resolve();
  }
}
