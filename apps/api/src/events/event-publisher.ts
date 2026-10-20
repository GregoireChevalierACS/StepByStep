import type { OutboxEvent } from './outbox-event.js';

/**
 * Port de publication des événements vers l'extérieur (notifications, bus de messages…).
 * Doit lever une exception si la publication échoue : les événements seront republiés.
 */
export interface EventPublisher {
  publish(events: readonly OutboxEvent[]): Promise<void>;
}

export const EVENT_PUBLISHER = Symbol('EVENT_PUBLISHER');
