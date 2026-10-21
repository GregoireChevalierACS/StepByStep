import { Inject, Injectable } from '@nestjs/common';
import { err, ok, type Result } from '@stepbystep/domain';
import type { InvalidCredentials } from '../auth/auth-errors.js';
import { generateDeviceSecret, verifyDeviceSecret } from '../auth/device-secret.js';
import { DeviceTokens, type IssuedToken } from '../auth/device-tokens.js';
import {
  DEVICE_REPOSITORY,
  type DeviceRepository,
  type RegisteredDevice,
} from './device.repository.js';

export interface RegisteredDeviceWithSecret extends RegisteredDevice {
  /** Secret de l'appareil : renvoyé une seule fois, à conserver par l'appareil. */
  readonly secret: string;
}

/**
 * Enregistrement et authentification des appareils. Phase 8a : un compte est créé avec son
 * premier appareil (ADR 0002). L'appareil reçoit un secret, qu'il échange ensuite contre des
 * jetons courts pour appeler l'API.
 */
@Injectable()
export class DevicesService {
  // Empreinte calculée une fois, pour vérifier un secret même quand l'appareil n'en a pas.
  private readonly decoyHash = generateDeviceSecret().then(({ hash }) => hash);

  constructor(
    @Inject(DEVICE_REPOSITORY) private readonly devices: DeviceRepository,
    private readonly tokens: DeviceTokens,
  ) {}

  async register(): Promise<RegisteredDeviceWithSecret> {
    const { secret, hash } = await generateDeviceSecret();
    return { ...(await this.devices.registerWithNewAccount(hash)), secret };
  }

  async issueToken(
    deviceId: string,
    secret: string,
  ): Promise<Result<IssuedToken, InvalidCredentials>> {
    const stored = await this.devices.secretHashOf(deviceId);
    // Toujours une vérification scrypt, même sans empreinte : la durée de la réponse ne dit
    // pas si l'appareil existe.
    const valid = await verifyDeviceSecret(secret, stored ?? (await this.decoyHash));
    const accountId = await this.devices.accountOf(deviceId);
    if (stored === undefined || !valid || accountId === undefined) {
      return err({ kind: 'InvalidCredentials' });
    }
    return ok(await this.tokens.issue({ deviceId, accountId }));
  }
}
