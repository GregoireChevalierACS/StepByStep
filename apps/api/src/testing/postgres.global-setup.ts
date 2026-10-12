import 'reflect-metadata';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { DataSource } from 'typeorm';
import type { TestProject } from 'vitest/node';
import { dataSourceOptions } from '../database/data-source-options.js';

// Une base PostgreSQL neuve et jetable pour toute la suite de tests : même image que
// compose.yaml, isolée de la base de développement, identique en local et en CI.
let container: StartedPostgreSqlContainer | undefined;

export async function setup(project: TestProject): Promise<void> {
  container = await new PostgreSqlContainer('postgres:18-alpine').start();
  const databaseUrl = container.getConnectionUri();
  // Schéma appliqué une fois pour toute la suite, par les mêmes migrations qu'en production.
  const dataSource = await new DataSource(dataSourceOptions(databaseUrl)).initialize();
  await dataSource.runMigrations();
  await dataSource.destroy();
  project.provide('databaseUrl', databaseUrl);
}

export async function teardown(): Promise<void> {
  await container?.stop();
}

declare module 'vitest' {
  export interface ProvidedContext {
    databaseUrl: string;
  }
}
