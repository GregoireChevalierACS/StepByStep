import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { parseEnvironment } from './config/environment.js';
import { DailyStepsModule } from './daily-steps/daily-steps.module.js';
import { DatabaseModule } from './database/database.module.js';
import { DevicesModule } from './devices/devices.module.js';
import { GoalsModule } from './goals/goals.module.js';
import { HealthModule } from './health/health.module.js';
import { ReadingsModule } from './readings/readings.module.js';

/** Module racine : assemble les modules fonctionnels de l'API. */
@Module({
  imports: [
    // Validation de l'environnement au démarrage : une variable absente ou invalide
    // arrête l'application avec un message explicite (« fail fast »).
    ConfigModule.forRoot({ isGlobal: true, validate: parseEnvironment }),
    DatabaseModule,
    HealthModule,
    DevicesModule,
    ReadingsModule,
    DailyStepsModule,
    GoalsModule,
  ],
})
export class AppModule {}
