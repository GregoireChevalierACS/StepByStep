import { Module } from '@nestjs/common';
import { DailyStepsController } from './daily-steps.controller.js';
import { DailyStepsService } from './daily-steps.service.js';

@Module({ controllers: [DailyStepsController], providers: [DailyStepsService] })
export class DailyStepsModule {}
