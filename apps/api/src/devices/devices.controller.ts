import { Body, Controller, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import {
  ApiBody,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { invalidCredentialsException } from '../auth/auth-errors.js';
import { deviceTokenResponse, registeredDeviceResponse } from '../http/contract.js';
import { ApiProblems, openApiSchema } from '../http/openapi.js';
import { ZodValidationPipe } from '../http/zod-validation.pipe.js';
import { deviceIdParam } from '../readings/record-readings.dto.js';
import { type DeviceTokenBody, deviceTokenBody } from './device-token.dto.js';
import { DevicesService, type RegisteredDeviceWithSecret } from './devices.service.js';

export interface DeviceTokenResponse {
  readonly token: string;
  readonly tokenType: 'Bearer';
  readonly expiresIn: number;
}

@ApiTags('Appareils')
@Controller({ path: 'devices', version: '1' })
export class DevicesController {
  constructor(private readonly devices: DevicesService) {}

  /** Crée un compte et son appareil ; renvoie ses identifiants et son secret (une seule fois). */
  @Post()
  @ApiOperation({ summary: 'Enregistrer un appareil (crée aussi son compte et son secret)' })
  @ApiCreatedResponse({ schema: openApiSchema(registeredDeviceResponse, 'output') })
  @HttpCode(HttpStatus.CREATED)
  register(): Promise<RegisteredDeviceWithSecret> {
    return this.devices.register();
  }

  /** Échange le secret de l'appareil contre un jeton court, à joindre aux autres requêtes. */
  @Post(':deviceId/tokens')
  @ApiOperation({ summary: 'Obtenir un jeton d’appareil (15 minutes) contre son secret' })
  @ApiParam({ name: 'deviceId', schema: openApiSchema(deviceIdParam) })
  @ApiBody({ schema: openApiSchema(deviceTokenBody) })
  @ApiOkResponse({ schema: openApiSchema(deviceTokenResponse, 'output') })
  @ApiProblems(400, 401)
  @HttpCode(HttpStatus.OK)
  async issueToken(
    @Param('deviceId', new ZodValidationPipe(deviceIdParam)) deviceId: string,
    @Body(new ZodValidationPipe(deviceTokenBody)) { secret }: DeviceTokenBody,
  ): Promise<DeviceTokenResponse> {
    const result = await this.devices.issueToken(deviceId, secret);
    if (!result.ok) throw invalidCredentialsException();
    return { ...result.value, tokenType: 'Bearer' };
  }
}
