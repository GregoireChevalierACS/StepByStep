import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule, type TypeOrmModuleOptions } from '@nestjs/typeorm';
import type { Environment } from '../config/environment.js';
import { ACCOUNT_REPOSITORY } from '../accounts/account.repository.js';
import { DAILY_STEPS_REPOSITORY } from '../daily-steps/daily-steps.repository.js';
import { DEVICE_REPOSITORY } from '../devices/device.repository.js';
import { OUTBOX } from '../events/outbox.js';
import { GOAL_REPOSITORY } from '../goals/goal.repository.js';
import { READINGS_UNIT_OF_WORK } from '../readings/readings-unit-of-work.js';
import { TIME_ZONE_REPOSITORY } from '../time/time-zone.repository.js';
import { dataSourceOptions } from './data-source-options.js';
import { TypeOrmAccountRepository } from './repositories/typeorm-account.repository.js';
import { TypeOrmDailyStepsRepository } from './repositories/typeorm-daily-steps.repository.js';
import { TypeOrmDeviceRepository } from './repositories/typeorm-device.repository.js';
import { TypeOrmGoalRepository } from './repositories/typeorm-goal.repository.js';
import { TypeOrmOutbox } from './repositories/typeorm-outbox.js';
import { TypeOrmReadingsUnitOfWork } from './repositories/typeorm-readings-unit-of-work.js';
import { TypeOrmTimeZoneRepository } from './repositories/typeorm-time-zone.repository.js';

// Chaque port de persistance est lié à son adapter PostgreSQL. Les modules fonctionnels ne
// connaissent que les jetons : changer d'adapter ne touche qu'à cette liste.
const repositories = [
  { provide: ACCOUNT_REPOSITORY, useClass: TypeOrmAccountRepository },
  { provide: DEVICE_REPOSITORY, useClass: TypeOrmDeviceRepository },
  { provide: DAILY_STEPS_REPOSITORY, useClass: TypeOrmDailyStepsRepository },
  { provide: GOAL_REPOSITORY, useClass: TypeOrmGoalRepository },
  { provide: TIME_ZONE_REPOSITORY, useClass: TypeOrmTimeZoneRepository },
  { provide: READINGS_UNIT_OF_WORK, useClass: TypeOrmReadingsUnitOfWork },
  { provide: OUTBOX, useClass: TypeOrmOutbox },
];

/**
 * Connexion PostgreSQL, construite à partir de la configuration validée au démarrage, et
 * adapters des ports de persistance. Global : tout module fonctionnel peut injecter un port.
 */
@Global()
@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Environment, true>): TypeOrmModuleOptions => ({
        ...dataSourceOptions(config.get('DATABASE_URL', { infer: true })),
        // Base momentanément indisponible au démarrage : quelques essais, puis échec explicite.
        retryAttempts: 3,
        retryDelay: 1000,
      }),
    }),
  ],
  providers: repositories,
  exports: repositories.map(({ provide }) => provide),
})
export class DatabaseModule {}
