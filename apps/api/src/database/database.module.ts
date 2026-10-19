import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule, type TypeOrmModuleOptions } from '@nestjs/typeorm';
import type { Environment } from '../config/environment.js';
import { DAILY_STEPS_REPOSITORY } from '../daily-steps/daily-steps.repository.js';
import { DEVICE_REPOSITORY } from '../devices/device.repository.js';
import { dataSourceOptions } from './data-source-options.js';
import { TypeOrmDailyStepsRepository } from './repositories/typeorm-daily-steps.repository.js';
import { TypeOrmDeviceRepository } from './repositories/typeorm-device.repository.js';

// Chaque port de persistance est lié à son adapter PostgreSQL. Les modules fonctionnels ne
// connaissent que les jetons : changer d'adapter ne touche qu'à cette liste.
const repositories = [
  { provide: DEVICE_REPOSITORY, useClass: TypeOrmDeviceRepository },
  { provide: DAILY_STEPS_REPOSITORY, useClass: TypeOrmDailyStepsRepository },
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
