import { Controller, Get, Param, Query } from '@nestjs/common';
import { deviceNotFoundException } from '../devices/device-errors.js';
import { ZodValidationPipe } from '../http/zod-validation.pipe.js';
import { deviceIdParam } from '../readings/record-readings.dto.js';
import { type DayTotal, DailyStepsService } from './daily-steps.service.js';
import { type PeriodQuery, periodQuery } from './period.query.js';

@Controller({ path: 'devices/:deviceId/daily-steps', version: '1' })
export class DailyStepsController {
  constructor(private readonly dailySteps: DailyStepsService) {}

  /** Pas par jour local enregistrés sur la période (bornes incluses), triés par jour. */
  @Get()
  async read(
    @Param('deviceId', new ZodValidationPipe(deviceIdParam)) deviceId: string,
    @Query(new ZodValidationPipe(periodQuery)) period: PeriodQuery,
  ): Promise<DayTotal[]> {
    const result = await this.dailySteps.read(deviceId, period);
    if (!result.ok) throw deviceNotFoundException(result.error);
    return result.value;
  }
}
