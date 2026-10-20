import { expect, it } from 'vitest';
import type { OutboxEvent } from '../../events/outbox-event.js';
import type { Outbox, PendingEvent } from '../../events/outbox.js';

/** Chaque test reçoit une outbox vide (base isolée pour PostgreSQL). */
export interface OutboxFixture {
  readonly outbox: Outbox;
  /** Écrit des événements dans l'outbox, comme le ferait l'unité de travail. */
  readonly givenEvents: (events: readonly OutboxEvent[]) => Promise<void>;
}

const event = (name: string): OutboxEvent => ({
  key: `test:${name}`,
  type: 'TestEvent',
  payload: { name },
});
const keys = (events: readonly PendingEvent[]) => events.map(({ key }) => key).sort();

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const waitUntil = async (condition: () => boolean) => {
  while (!condition()) await delay(5);
};

/** Contrat du port Outbox, exécuté contre chaque adapter (en mémoire, PostgreSQL). */
export const outboxContract = (fixture: () => Promise<OutboxFixture>): void => {
  it('publie les événements en attente avec leur contenu, puis ne les republie plus', async () => {
    const { outbox, givenEvents } = await fixture();
    await givenEvents([event('a'), event('b')]);
    const published: PendingEvent[] = [];

    const count = await outbox.publishPending(10, (events) => {
      published.push(...events);
      return Promise.resolve();
    });

    expect(count).toBe(2);
    expect(published.map(({ key, type, payload }) => ({ key, type, payload }))).toEqual(
      expect.arrayContaining([event('a'), event('b')]),
    );
    expect(await outbox.publishPending(10, () => Promise.resolve())).toBe(0);
  });

  it('publie par lots, les plus anciens d’abord', async () => {
    const { outbox, givenEvents } = await fixture();
    await givenEvents([event('ancien')]);
    await delay(5);
    await givenEvents([event('récent')]);
    const batches: string[][] = [];
    const collect = (events: readonly PendingEvent[]) => {
      batches.push(keys(events));
      return Promise.resolve();
    };

    await outbox.publishPending(1, collect);
    await outbox.publishPending(1, collect);

    expect(batches).toEqual([['test:ancien'], ['test:récent']]);
  });

  it('garde les événements à publier quand la publication échoue, et propage l’erreur', async () => {
    const { outbox, givenEvents } = await fixture();
    await givenEvents([event('a')]);

    await expect(
      outbox.publishPending(10, () => Promise.reject(new Error('broker indisponible'))),
    ).rejects.toThrow('broker indisponible');

    const retried: PendingEvent[] = [];
    await outbox.publishPending(10, (events) => {
      retried.push(...events);
      return Promise.resolve();
    });
    expect(keys(retried)).toEqual(['test:a']);
  });

  it('ne donne jamais le même événement à deux relais qui tournent en même temps', async () => {
    const { outbox, givenEvents } = await fixture();
    await givenEvents([event('a'), event('b'), event('c'), event('d')]);
    let release: () => void = () => undefined;
    const barrier = new Promise<void>((resolve) => (release = resolve));
    const first: PendingEvent[] = [];
    const second: PendingEvent[] = [];

    // Le premier relais réserve deux événements et reste bloqué pendant leur publication.
    const firstRelay = outbox.publishPending(2, async (events) => {
      first.push(...events);
      await barrier;
    });
    await waitUntil(() => first.length > 0);
    // Le second ne les attend pas : il prend les suivants.
    await outbox.publishPending(10, (events) => {
      second.push(...events);
      return Promise.resolve();
    });
    release();
    await firstRelay;

    expect(first).toHaveLength(2);
    expect(second).toHaveLength(2);
    expect([...keys(first), ...keys(second)].sort()).toEqual([
      'test:a',
      'test:b',
      'test:c',
      'test:d',
    ]);
    expect(await outbox.publishPending(10, () => Promise.resolve())).toBe(0);
  });
};
