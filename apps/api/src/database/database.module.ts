import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule, type TypeOrmModuleOptions } from '@nestjs/typeorm';
import type { Environment } from '../config/environment.js';
import { dataSourceOptions } from './data-source-options.js';

/** Connexion PostgreSQL, construite à partir de la configuration validée au démarrage. */
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
})
export class DatabaseModule {}
