import type { OutboxEvent } from '../events/outbox-event.js';
import type { Outbox, PendingEvent } from '../events/outbox.js';

/**
 * Outbox en mémoire : la « table » partagée entre l'unité de travail (écriture) et le relais
 * (lecture), tenue par le même contrat que l'adapter PostgreSQL. Réservation : un événement
 * en cours de publication est invisible des autres relais, comme avec SKIP LOCKED.
 */
export class InMemoryOutbox implements Outbox {
  private readonly events = new Map<string, PendingEvent>();
  private readonly published = new Set<string>();
  private readonly reserved = new Set<string>();
  private nextId = 1;

  /** Ajoute les événements ; une clé déjà connue est ignorée (contrainte unique en base). */
  append(events: readonly OutboxEvent[]): void {
    for (const event of events) {
      if (this.events.has(event.key)) continue;
      this.events.set(event.key, { ...event, id: String(this.nextId++) });
    }
  }

  has(key: string): boolean {
    return this.events.has(key);
  }

  all(): OutboxEvent[] {
    return [...this.events.values()].map(({ key, type, payload }) => ({ key, type, payload }));
  }

  async publishPending(
    limit: number,
    publish: (events: readonly PendingEvent[]) => Promise<void>,
  ): Promise<number> {
    // Map : ordre d'insertion = ordre de création, les plus anciens d'abord.
    const batch = [...this.events.values()]
      .filter(({ key }) => !this.published.has(key) && !this.reserved.has(key))
      .slice(0, limit);
    if (batch.length === 0) return 0;
    for (const { key } of batch) this.reserved.add(key);
    try {
      await publish(batch);
      for (const { key } of batch) this.published.add(key);
      return batch.length;
    } finally {
      for (const { key } of batch) this.reserved.delete(key);
    }
  }
}
