import { Logger } from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { InMemoryOutbox } from '../testing/in-memory-outbox.js';
import { metricValue, testMetrics } from '../testing/metrics.js';
import type { EventPublisher } from './event-publisher.js';
import type { OutboxEvent } from './outbox-event.js';
import { OutboxRelay } from './outbox-relay.js';

const event = (name: string): OutboxEvent => ({
  key: `test:${name}`,
  type: 'TestEvent',
  payload: { name },
});

/** Publication enregistrée ; pilotable : échec, ou attente d'un feu vert. */
class FakePublisher implements EventPublisher {
  readonly batches: string[][] = [];
  failing = false;
  gate: Promise<void> | undefined;
  inFlight = 0;
  maxInFlight = 0;

  async publish(events: readonly OutboxEvent[]): Promise<void> {
    this.inFlight += 1;
    this.maxInFlight = Math.max(this.maxInFlight, this.inFlight);
    try {
      if (this.gate) await this.gate;
      if (this.failing) throw new Error('broker indisponible');
      this.batches.push(events.map(({ key }) => key));
    } finally {
      this.inFlight -= 1;
    }
  }
}

const setup = (intervalMs = 0) => {
  const outbox = new InMemoryOutbox();
  const publisher = new FakePublisher();
  const metrics = testMetrics();
  const relay = new OutboxRelay(outbox, publisher, { intervalMs, batchSize: 2 }, metrics);
  return { outbox, publisher, relay, metrics };
};

describe('OutboxRelay', () => {
  let loggedErrors: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    loggedErrors = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('publie tous les événements en attente, par lots', async () => {
    const { outbox, publisher, relay } = setup();
    outbox.append(['a', 'b', 'c', 'd', 'e'].map(event));

    expect(await relay.drain()).toBe(5);
    expect(publisher.batches).toEqual([['test:a', 'test:b'], ['test:c', 'test:d'], ['test:e']]);
    expect(await relay.drain()).toBe(0);
  });

  it('garde les événements quand la publication échoue, et les publie au passage suivant', async () => {
    const { outbox, publisher, relay } = setup();
    outbox.append([event('a')]);
    publisher.failing = true;

    await expect(relay.drain()).rejects.toThrow('broker indisponible');

    publisher.failing = false;
    expect(await relay.drain()).toBe(1);
    expect(publisher.batches).toEqual([['test:a']]);
  });

  describe('planification', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    it('publie à intervalle régulier, puis s’arrête avec l’application', async () => {
      const { outbox, publisher, relay } = setup(1000);
      relay.onApplicationBootstrap();

      outbox.append([event('a')]);
      await vi.advanceTimersByTimeAsync(1000);
      outbox.append([event('b')]);
      await vi.advanceTimersByTimeAsync(1000);
      relay.onModuleDestroy();
      outbox.append([event('c')]);
      await vi.advanceTimersByTimeAsync(5000);

      expect(publisher.batches).toEqual([['test:a'], ['test:b']]);
    });

    it('ne lance pas un passage tant que le précédent n’est pas terminé', async () => {
      const { outbox, publisher, relay } = setup(1000);
      let release: () => void = () => undefined;
      publisher.gate = new Promise<void>((resolve) => (release = resolve));
      // Plus d'événements qu'un lot : un passage concurrent trouverait de quoi publier en parallèle.
      outbox.append(['a', 'b', 'c', 'd'].map(event));
      relay.onApplicationBootstrap();

      await vi.advanceTimersByTimeAsync(5000);
      release();
      await vi.advanceTimersByTimeAsync(1000);
      relay.onModuleDestroy();

      expect(publisher.maxInFlight).toBe(1);
      expect(publisher.batches).toEqual([
        ['test:a', 'test:b'],
        ['test:c', 'test:d'],
      ]);
    });

    it('survit à un échec de publication et réessaie au passage suivant', async () => {
      const { outbox, publisher, relay } = setup(1000);
      outbox.append([event('a')]);
      publisher.failing = true;
      relay.onApplicationBootstrap();

      await vi.advanceTimersByTimeAsync(1000);
      publisher.failing = false;
      await vi.advanceTimersByTimeAsync(1000);
      relay.onModuleDestroy();

      expect(publisher.batches).toEqual([['test:a']]);
      expect(loggedErrors).toHaveBeenCalledTimes(1);
    });

    it('mesure les événements publiés et l’heure du dernier passage réussi', async () => {
      vi.setSystemTime(Date.parse('2026-11-09T10:00:00Z'));
      const { outbox, relay, metrics } = setup(1000);
      outbox.append(['a', 'b', 'c'].map(event));
      relay.onApplicationBootstrap();

      await vi.advanceTimersByTimeAsync(1000);
      await vi.advanceTimersByTimeAsync(1000);
      relay.onModuleDestroy();

      expect(await metricValue(metrics, 'stepbystep_outbox_events_published_total')).toBe(3);
      expect(
        await metricValue(metrics, 'stepbystep_outbox_relay_last_success_timestamp_seconds'),
      ).toBe(Date.parse('2026-11-09T10:00:02Z') / 1000);
      expect(await metricValue(metrics, 'stepbystep_outbox_relay_failures_total')).toBe(0);
    });

    it('compte les passages en échec, sans avancer l’heure du dernier succès', async () => {
      vi.setSystemTime(Date.parse('2026-11-09T10:00:00Z'));
      const { outbox, publisher, relay, metrics } = setup(1000);
      outbox.append([event('a')]);
      relay.onApplicationBootstrap();

      await vi.advanceTimersByTimeAsync(1000);
      // Un événement en attente : sans lui, le relais n'appellerait pas l'éditeur en panne.
      outbox.append([event('b')]);
      publisher.failing = true;
      await vi.advanceTimersByTimeAsync(2000);
      relay.onModuleDestroy();

      expect(await metricValue(metrics, 'stepbystep_outbox_relay_failures_total')).toBe(2);
      expect(
        await metricValue(metrics, 'stepbystep_outbox_relay_last_success_timestamp_seconds'),
      ).toBe(Date.parse('2026-11-09T10:00:01Z') / 1000);
    });

    it('ne tourne pas quand l’intervalle vaut 0', async () => {
      const { outbox, publisher, relay } = setup(0);
      outbox.append([event('a')]);
      relay.onApplicationBootstrap();

      await vi.advanceTimersByTimeAsync(60_000);
      relay.onModuleDestroy();

      expect(publisher.batches).toEqual([]);
    });
  });
});
