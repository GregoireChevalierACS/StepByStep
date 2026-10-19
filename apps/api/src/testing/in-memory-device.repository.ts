import { randomUUID } from 'node:crypto';
import type { DeviceRepository, RegisteredDevice } from '../devices/device.repository.js';

/** Adapter en mémoire de DeviceRepository, pour les tests unitaires (tenu par le contrat). */
export class InMemoryDeviceRepository implements DeviceRepository {
  /** Appareil → compte. */
  private readonly devices = new Map<string, string>();

  registerWithNewAccount(): Promise<RegisteredDevice> {
    const registered = { accountId: randomUUID(), deviceId: randomUUID() };
    this.devices.set(registered.deviceId, registered.accountId);
    return Promise.resolve(registered);
  }

  exists(deviceId: string): Promise<boolean> {
    return Promise.resolve(this.devices.has(deviceId));
  }

  accountOf(deviceId: string): Promise<string | undefined> {
    return Promise.resolve(this.devices.get(deviceId));
  }

  /** Comptes créés avec les appareils : partagés avec InMemoryAccountRepository. */
  hasAccount(accountId: string): boolean {
    return [...this.devices.values()].includes(accountId);
  }
}
