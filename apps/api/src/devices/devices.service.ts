import { Inject, Injectable } from '@nestjs/common';
import {
  DEVICE_REPOSITORY,
  type DeviceRepository,
  type RegisteredDevice,
} from './device.repository.js';

/**
 * Enregistrement d'un appareil. Phase 8a : pas encore d'authentification, un compte est
 * créé avec son premier appareil (ADR 0002).
 */
@Injectable()
export class DevicesService {
  constructor(@Inject(DEVICE_REPOSITORY) private readonly devices: DeviceRepository) {}

  register(): Promise<RegisteredDevice> {
    return this.devices.registerWithNewAccount();
  }
}
