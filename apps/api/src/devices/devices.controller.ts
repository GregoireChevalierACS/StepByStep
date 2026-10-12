import { Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiCreatedResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { registeredDeviceResponse } from '../http/contract.js';
import { openApiSchema } from '../http/openapi.js';
import { DevicesService, type RegisteredDevice } from './devices.service.js';

@ApiTags('Appareils')
@Controller({ path: 'devices', version: '1' })
export class DevicesController {
  constructor(private readonly devices: DevicesService) {}

  /** Crée un compte et son appareil ; renvoie les identifiants à conserver sur l'appareil. */
  @Post()
  @ApiOperation({ summary: 'Enregistrer un appareil (crée aussi son compte)' })
  @ApiCreatedResponse({ schema: openApiSchema(registeredDeviceResponse, 'output') })
  @HttpCode(HttpStatus.CREATED)
  register(): Promise<RegisteredDevice> {
    return this.devices.register();
  }
}
