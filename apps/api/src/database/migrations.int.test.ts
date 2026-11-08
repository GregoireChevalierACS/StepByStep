import { DataSource } from 'typeorm';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { createIsolatedDatabase } from '../testing/isolated-database.js';
import { dataSourceOptions, MIGRATIONS } from './data-source-options.js';
import { OutboxEventDevice1793972772855 } from './migrations/1793972772855-outbox-event-device.js';

const TABLES = [
  'accounts',
  'daily_goals',
  'daily_steps',
  'device_time_zones',
  'devices',
  'group_members',
  'groups',
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

describe('migration OutboxEventDevice : reprise des événements existants', () => {
  let database: Awaited<ReturnType<typeof createIsolatedDatabase>>;

  // Source de données arrêtée à une liste de migrations donnée (schéma d'une version passée).
  const dataSourceUpTo = (migrations: typeof MIGRATIONS) =>
    new DataSource({ ...dataSourceOptions(database.url), entities: [], migrations }).initialize();

  beforeAll(async () => {
    database = await createIsolatedDatabase(inject('databaseUrl'));
  });

  afterAll(async () => {
    await database.drop();
  });

  it('rattache chaque GoalReached déjà écrit à l’appareil de son payload', async () => {
    const before = await dataSourceUpTo(
      MIGRATIONS.filter((migration) => migration !== OutboxEventDevice1793972772855),
    );
    await before.runMigrations();
    const [{ id: accountId }]: [{ id: string }] = await before.query(
      'INSERT INTO accounts DEFAULT VALUES RETURNING id',
    );
    const [{ id: deviceId }]: [{ id: string }] = await before.query(
      'INSERT INTO devices (account_id) VALUES ($1) RETURNING id',
      [accountId],
    );
    await before.query(
      `INSERT INTO outbox_events (event_key, type, payload) VALUES
         ('goal-reached:a', 'GoalReached', $1), ('autre:b', 'Autre', $1),
         ('goal-reached:c', 'GoalReached', '{"deviceId":"pas-un-uuid"}')`,
      [JSON.stringify({ deviceId, day: '2026-10-12', steps: 10_500, goal: 10_000 })],
    );
    await before.destroy();

    const after = await dataSourceUpTo(MIGRATIONS);
    await after.runMigrations();
    const rows: { event_key: string; device_id: string | null }[] = await after.query(
      'SELECT event_key, device_id FROM outbox_events ORDER BY event_key',
    );
    await after.destroy();

    // Seuls les GoalReached sont repris, et une valeur mal formée ne bloque pas la migration.
    expect(rows).toEqual([
      { event_key: 'autre:b', device_id: null },
      { event_key: 'goal-reached:a', device_id: deviceId },
      { event_key: 'goal-reached:c', device_id: null },
    ]);
  });
});
