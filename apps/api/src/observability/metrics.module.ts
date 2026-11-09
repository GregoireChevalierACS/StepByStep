import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Clock } from '@stepbystep/domain';
import { collectDefaultMetrics, Registry } from 'prom-client';
import { CLOCK } from '../clock/clock.js';
import type { Environment } from '../config/environment.js';
import { METRICS_OPTIONS, MetricsController, type MetricsOptions } from './metrics.controller.js';
import { Metrics } from './metrics.js';

/**
 * Métriques Prometheus. Global : le middleware HTTP et les tâches de fond (relais de l'outbox,
 * clôture des défis) les alimentent.
 */
@Global()
@Module({
  controllers: [MetricsController],
  providers: [
    {
      provide: Metrics,
      inject: [CLOCK],
      useFactory: (clock: Clock): Metrics => {
        const registry = new Registry();
        // Métriques du processus Node : CPU, mémoire, tas, retard de la boucle d'événements.
        collectDefaultMetrics({ register: registry });
        return new Metrics(registry, clock);
      },
    },
    {
      provide: METRICS_OPTIONS,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Environment, true>): MetricsOptions => ({
        token: config.get('METRICS_TOKEN', { infer: true }),
      }),
    },
  ],
  exports: [Metrics],
})
export class MetricsModule {}
