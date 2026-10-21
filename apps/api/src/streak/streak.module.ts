import { Module } from '@nestjs/common';
import { StreakController } from './streak.controller.js';
import { StreakService } from './streak.service.js';

// Le port Clock vient du ClockModule global.
@Module({ controllers: [StreakController], providers: [StreakService] })
export class StreakModule {}
