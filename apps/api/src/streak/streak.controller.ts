import {
  Controller,
  Get,
  type HttpException,
  Param,
  UnprocessableEntityException,
} from '@nestjs/common';
import { deviceNotFoundException, missingTimeZoneException } from '../devices/device-errors.js';
import { ApiOkResponse, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { streakResponse } from '../http/contract.js';
import { ApiProblems, openApiSchema } from '../http/openapi.js';
import { uuidSchema } from '../http/schemas.js';
import { ZodValidationPipe } from '../http/zod-validation.pipe.js';
import { type StreakError, type StreakReport, StreakService } from './streak.service.js';

const toHttpException = (error: StreakError): HttpException => {
  switch (error.kind) {
    case 'DeviceNotFound':
      return deviceNotFoundException(error);
    case 'MissingTimeZone':
      return missingTimeZoneException();
    case 'UnknownTimeZone':
      return new UnprocessableEntityException(`Fuseau horaire inconnu : ${error.timeZone}`);
  }
};

@ApiTags('Série et badges')
@Controller({ path: 'devices/:deviceId/streak', version: '1' })
export class StreakController {
  constructor(private readonly streaks: StreakService) {}

  /** Série en cours (jours consécutifs avec l'objectif atteint) et badges débloqués. */
  @Get()
  @ApiOperation({ summary: 'Série en cours et badges débloqués' })
  @ApiParam({ name: 'deviceId', schema: openApiSchema(uuidSchema) })
  @ApiOkResponse({ schema: openApiSchema(streakResponse, 'output') })
  @ApiProblems(400, 404, 422)
  async compute(
    @Param('deviceId', new ZodValidationPipe(uuidSchema)) deviceId: string,
  ): Promise<StreakReport> {
    const result = await this.streaks.compute(deviceId);
    if (!result.ok) throw toHttpException(result.error);
    return result.value;
  }
}
