import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule, type TypeOrmModuleOptions } from '@nestjs/typeorm';
import type { Environment } from '../config/environment.js';

/** Connexion PostgreSQL, construite à partir de la configuration validée au démarrage. */
@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Environment, true>): TypeOrmModuleOptions => ({
        type: 'postgres',
        url: config.get('DATABASE_URL', { infer: true }),
        autoLoadEntities: true,
        // Le schéma n'évolue que par des migrations versionnées, jamais automatiquement.
        synchronize: false,
        // Base momentanément indisponible au démarrage : quelques essais, puis échec explicite.
        retryAttempts: 3,
        retryDelay: 1000,
      }),
    }),
  ],
})
export class DatabaseModule {}
