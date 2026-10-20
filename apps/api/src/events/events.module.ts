import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Environment } from '../config/environment.js';
import { EVENT_PUBLISHER } from './event-publisher.js';
import { LoggingEventPublisher } from './logging-event-publisher.js';
import { OUTBOX_RELAY_OPTIONS, OutboxRelay, type OutboxRelayOptions } from './outbox-relay.js';

/** Publication des événements de l'outbox (le port Outbox est fourni par le DatabaseModule). */
@Module({
  providers: [
    OutboxRelay,
    { provide: EVENT_PUBLISHER, useClass: LoggingEventPublisher },
    {
      provide: OUTBOX_RELAY_OPTIONS,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Environment, true>): OutboxRelayOptions => ({
        intervalMs: config.get('OUTBOX_RELAY_INTERVAL_MS', { infer: true }),
        batchSize: 100,
      }),
    },
  ],
})
export class EventsModule {}
