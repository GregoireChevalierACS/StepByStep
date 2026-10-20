import type { OutboxEvent } from '../events/outbox-event.js';

/** Outbox en mémoire : la « table » partagée entre l'unité de travail et le relais (tests). */
export class InMemoryOutbox {
  private readonly events = new Map<string, OutboxEvent>();

  /** Ajoute les événements ; une clé déjà connue est ignorée (contrainte unique en base). */
  append(events: readonly OutboxEvent[]): void {
    for (const event of events) if (!this.events.has(event.key)) this.events.set(event.key, event);
  }

  has(key: string): boolean {
    return this.events.has(key);
  }

  all(): OutboxEvent[] {
    return [...this.events.values()];
  }
}
