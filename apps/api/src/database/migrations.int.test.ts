import { DataSource } from 'typeorm';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { createIsolatedDatabase } from '../testing/isolated-database.js';
import { dataSourceOptions } from './data-source-options.js';

const TABLES = [
  'accounts',
  'daily_goals',
  'daily_steps',
  'device_time_zones',
  'devices',
  'outbox_events',
  'step_counter_readings',
];

describe('migrations', () => {
  let database: Awaited<ReturnType<typeof createIsolatedDatabase>>;
  let dataSource: DataSource;

  const tables = async (): Promise<string[]> => {
    const rows: { table_name: string }[] = await dataSource.query(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name <> 'migrations' ORDER BY table_name`,
    );
    return rows.map(({ table_name }) => table_name);
  };

  const appliedMigrations = async (): Promise<number> => {
    const rows: unknown[] = await dataSource.query(`SELECT 1 FROM migrations`);
    return rows.length;
  };

  // Différences entre le schéma réel et les entités TypeORM : vide si elles concordent.
  const schemaDrift = async (): Promise<string[]> =>
    (await dataSource.driver.createSchemaBuilder().log()).upQueries.map(({ query }) => query);

  beforeAll(async () => {
    database = await createIsolatedDatabase(inject('databaseUrl'));
    dataSource = await new DataSource(dataSourceOptions(database.url)).initialize();
  });

  afterAll(async () => {
    await dataSource.destroy();
    await database.drop();
  });

  it('crée sur une base neuve exactement le schéma décrit par les entités', async () => {
    await dataSource.runMigrations();

    expect(await tables()).toEqual(TABLES);
    expect(await schemaDrift()).toEqual([]);
  });

  it('sait annuler toutes les migrations, puis les réappliquer (aller-retour)', async () => {
    while (await dataSource.showMigrations()) await dataSource.runMigrations();
    while ((await appliedMigrations()) > 0) await dataSource.undoLastMigration();
    expect(await tables()).toEqual([]);

    await dataSource.runMigrations();
    expect(await tables()).toEqual(TABLES);
    expect(await schemaDrift()).toEqual([]);
  });
});
