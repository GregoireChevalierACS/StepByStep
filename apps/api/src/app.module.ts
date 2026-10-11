import { Module } from '@nestjs/common';
import { HealthModule } from './health/health.module.js';

/** Module racine : assemble les modules fonctionnels de l'API. */
@Module({ imports: [HealthModule] })
export class AppModule {}
