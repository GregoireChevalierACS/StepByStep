import type { AccountRepository } from '../accounts/account.repository.js';
import type { InMemoryDeviceRepository } from './in-memory-device.repository.js';

/**
 * Adapter en mémoire d'AccountRepository. En 8a, un compte naît avec son premier appareil :
 * les comptes connus sont ceux des appareils enregistrés, comme dans la vraie base.
 */
export class InMemoryAccountRepository implements AccountRepository {
  constructor(private readonly devices: InMemoryDeviceRepository) {}

  exists(accountId: string): Promise<boolean> {
    return Promise.resolve(this.devices.hasAccount(accountId));
  }
}
