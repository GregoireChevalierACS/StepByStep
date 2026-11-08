import { randomUUID } from 'node:crypto';
import type { DeviceRepository, RegisteredDevice } from '../devices/device.repository.js';

/** Adapter en mémoire de DeviceRepository, pour les tests unitaires (tenu par le contrat). */
export class InMemoryDeviceRepository implements DeviceRepository {
  private readonly devices = new Map<string, { accountId: string; secretHash: string }>();

  registerWithNewAccount(secretHash: string): Promise<RegisteredDevice> {
    const registered = { accountId: randomUUID(), deviceId: randomUUID() };
    this.devices.set(registered.deviceId, { accountId: registered.accountId, secretHash });
    return Promise.resolve(registered);
  }

  exists(deviceId: string): Promise<boolean> {
    return Promise.resolve(this.devices.has(deviceId));
  }

  accountOf(deviceId: string): Promise<string | undefined> {
    return Promise.resolve(this.devices.get(deviceId)?.accountId);
  }

  secretHashOf(deviceId: string): Promise<string | undefined> {
    return Promise.resolve(this.devices.get(deviceId)?.secretHash);
  }

  /** Comptes créés avec les appareils : partagés avec InMemoryAccountRepository. */
  hasAccount(accountId: string): boolean {
    return [...this.devices.values()].some((device) => device.accountId === accountId);
  }

  /** Ajoute un appareil à un compte existant (préparation des tests multi-appareils). */
  givenDevice(accountId: string): string {
    const deviceId = randomUUID();
    this.devices.set(deviceId, { accountId, secretHash: '' });
    return deviceId;
  }

  /** Appareils d'un compte (colonne devices.account_id). */
  devicesOf(accountId: string): string[] {
    return [...this.devices]
      .filter(([, device]) => device.accountId === accountId)
      .map(([deviceId]) => deviceId);
  }

  /** Supprime les appareils d'un compte et renvoie leurs identifiants (pour la cascade). */
  forgetAccount(accountId: string): string[] {
    const forgotten = this.devicesOf(accountId);
    for (const deviceId of forgotten) this.devices.delete(deviceId);
    return forgotten;
  }
}
