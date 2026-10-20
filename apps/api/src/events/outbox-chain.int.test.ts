import { StepCounterReading, TimeZonePeriod } from '@stepbystep/domain';
import { DataSource } from 'typeorm';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { dataSourceOptions } from '../database/data-source-options.js';
import { OutboxEventEntity } from '../database/entities/outbox-event.entity.js';
import { TypeOrmDeviceRepository } from '../database/repositories/typeorm-device.repository.js';
import { TypeOrmOutbox } from '../database/repositories/typeorm-outbox.js';
import { TypeOrmReadingsUnitOfWork } from '../database/repositories/typeorm-readings-unit-of-work.js';
import { RecordReadingsService } from '../readings/record-readings.service.js';
import { createIsolatedDatabase } from '../testing/isolated-database.js';
import { unwrap } from '../testing/unwrap.js';
import type { EventPublisher } from './event-publisher.js';
import type { OutboxEvent } from './outbox-event.js';
import { OutboxRelay } from './outbox-relay.js';

const reading = (instant: string, stepsSinceBoot: number) =>
  unwrap(StepCounterReading.create({ stepsSinceBoot, bootCount: 7, takenAt: Date.parse(instant) }));
const PARIS = unwrap(
  TimeZonePeriod.create({ timeZone: 'Europe/Paris', since: Date.parse('2026-01-01T00:00:00Z') }),
);

// Chaîne complète contre PostgreSQL : envoi des relevés → outbox → relais → publication.
// Base isolée : le relais publie tout ce qui est en attente, y compris ce qu'écriraient
// d'autres tests dans la base partagée.
describe('outbox de bout en bout : de l’envoi des relevés à la publication', () => {
  let database: Awaited<ReturnType<typeof createIsolatedDatabase>>;
  let dataSource: DataSource;

  beforeAll(async () => {
    database = await createIsolatedDatabase(inject('databaseUrl'));
    dataSource = await new DataSource(dataSourceOptions(database.url)).initialize();
    await dataSource.runMigrations();
  });

  afterAll(async () => {
    await dataSource.destroy();
    await database.drop();
  });

  it('publie une seule fois GoalReached, puis le marque publié', async () => {
    const published: OutboxEvent[] = [];
    const publisher: EventPublisher = {
      publish: (events) => {
        published.push(...events);
        return Promise.resolve();
      },
    };
    const service = new RecordReadingsService(new TypeOrmReadingsUnitOfWork(dataSource));
    const relay = new OutboxRelay(new TypeOrmOutbox(dataSource), publisher, {
      intervalMs: 0,
      batchSize: 100,
    });
    const { deviceId } = await new TypeOrmDeviceRepository(dataSource).registerWithNewAccount();

    unwrap(
      await service.record({
        deviceId,
        readings: [reading('2026-10-12T06:00:00Z', 1000), reading('2026-10-12T10:00:00Z', 11_500)],
        timeZoneChanges: [PARIS],
      }),
    );
    await relay.drain();
    await relay.drain();

    expect(published.map(({ key, type, payload }) => ({ key, type, payload }))).toEqual([
      {
        key: `goal-reached:${deviceId}:2026-10-12`,
        type: 'GoalReached',
        payload: { deviceId, day: '2026-10-12', steps: 10_500, goal: 10_000 },
      },
    ]);
    const [stored] = await dataSource.getRepository(OutboxEventEntity).find();
    expect(stored?.publishedAt).toBeInstanceOf(Date);
  });
});
