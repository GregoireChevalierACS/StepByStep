import { Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { DevicesService, type RegisteredDevice } from './devices.service.js';

@Controller({ path: 'devices', version: '1' })
export class DevicesController {
  constructor(private readonly devices: DevicesService) {}

  /** Crée un compte et son appareil ; renvoie les identifiants à conserver sur l'appareil. */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  register(): Promise<RegisteredDevice> {
    return this.devices.register();
  }
}
