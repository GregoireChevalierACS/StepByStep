import { Module } from '@nestjs/common';
import { CLOCK, systemClock } from './clock.js';
import { StreakController } from './streak.controller.js';
import { StreakService } from './streak.service.js';

@Module({
  controllers: [StreakController],
  // Le port Clock : horloge système en production, remplaçable dans les tests.
  providers: [StreakService, { provide: CLOCK, useValue: systemClock }],
})
export class StreakModule {}
