import { Injectable, Logger } from '@nestjs/common';
import type { EventPublisher } from './event-publisher.js';
import type { OutboxEvent } from './outbox-event.js';

/**
 * Adapter provisoire du port EventPublisher : journalise les événements. Il prouve la chaîne
 * outbox → relais de bout en bout ; un adapter de notification (Firebase) ou de bus de
 * messages le remplacera sans toucher au reste.
 */
@Injectable()
export class LoggingEventPublisher implements EventPublisher {
  private readonly logger = new Logger(LoggingEventPublisher.name);

  publish(events: readonly OutboxEvent[]): Promise<void> {
    for (const { type, key } of events) this.logger.log(`Événement publié : ${type} (${key})`);
    return Promise.resolve();
  }
}
