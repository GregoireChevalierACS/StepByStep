import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiParam, ApiQuery, ApiTags } from '@nestjs/swagger';
import { deviceNotFoundException } from '../devices/device-errors.js';
import { dailyStepsResponse } from '../http/contract.js';
import { ApiProblems, openApiSchema } from '../http/openapi.js';
import { localDateSchema } from '../http/schemas.js';
import { ZodValidationPipe } from '../http/zod-validation.pipe.js';
import { deviceIdParam } from '../readings/record-readings.dto.js';
import { type DayTotal, DailyStepsService } from './daily-steps.service.js';
import { type PeriodQuery, periodQuery } from './period.query.js';

@ApiTags('Pas par jour')
@Controller({ path: 'devices/:deviceId/daily-steps', version: '1' })
export class DailyStepsController {
  constructor(private readonly dailySteps: DailyStepsService) {}

  /** Pas par jour local enregistrés sur la période (bornes incluses), triés par jour. */
  @Get()
  @ApiOperation({ summary: 'Pas par jour local sur une période (366 jours au plus)' })
  @ApiParam({ name: 'deviceId', schema: openApiSchema(deviceIdParam) })
  @ApiQuery({ name: 'from', schema: openApiSchema(localDateSchema) })
  @ApiQuery({ name: 'to', schema: openApiSchema(localDateSchema) })
  @ApiOkResponse({ schema: openApiSchema(dailyStepsResponse, 'output') })
  @ApiProblems(400, 404)
  async read(
    @Param('deviceId', new ZodValidationPipe(deviceIdParam)) deviceId: string,
    @Query(new ZodValidationPipe(periodQuery)) period: PeriodQuery,
  ): Promise<DayTotal[]> {
    const result = await this.dailySteps.read(deviceId, period);
    if (!result.ok) throw deviceNotFoundException(result.error);
    return result.value;
  }
}
