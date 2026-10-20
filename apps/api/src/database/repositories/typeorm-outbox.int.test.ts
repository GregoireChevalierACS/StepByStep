import { DataSource } from 'typeorm';
import { afterAll, beforeAll, describe, inject } from 'vitest';
import { outboxContract } from '../../testing/contracts/outbox.contract.js';
import { createIsolatedDatabase } from '../../testing/isolated-database.js';
import { dataSourceOptions } from '../data-source-options.js';
import { OutboxEventEntity } from '../entities/outbox-event.entity.js';
import { TypeOrmOutbox } from './typeorm-outbox.js';

// Base isolée : d'autres tests écrivent des événements dans l'outbox de la base partagée, et le
// contrat « tout ce qui est en attente est publié » exige une outbox vide au départ.
describe('TypeOrmOutbox', () => {
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

  outboxContract(async () => {
    await dataSource.getRepository(OutboxEventEntity).clear();
    return {
      outbox: new TypeOrmOutbox(dataSource),
      givenEvents: async (events) => {
        await dataSource.getRepository(OutboxEventEntity).insert(
          events.map(({ key, type, payload }) => ({
            eventKey: key,
            type,
            payload: { ...payload },
          })),
        );
      },
    };
  });
});
