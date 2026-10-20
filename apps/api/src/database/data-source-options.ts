import type { DataSourceOptions } from 'typeorm';
import { AccountEntity } from './entities/account.entity.js';
import { DailyGoalEntity } from './entities/daily-goal.entity.js';
import { DailyStepsEntity } from './entities/daily-steps.entity.js';
import { DeviceTimeZoneEntity } from './entities/device-time-zone.entity.js';
import { DeviceEntity } from './entities/device.entity.js';
import { OutboxEventEntity } from './entities/outbox-event.entity.js';
import { StepCounterReadingEntity } from './entities/step-counter-reading.entity.js';
import { InitialSchema1791743484726 } from './migrations/1791743484726-initial-schema.js';
import { OutboxEvents1792520157801 } from './migrations/1792520157801-outbox-events.js';

// Listes explicites (pas de motifs de fichiers) : vérifiées par TypeScript, insensibles
// à la différence entre sources .ts et fichiers compilés .js.
export const ENTITIES = [
  AccountEntity,
  DeviceEntity,
  StepCounterReadingEntity,
  DeviceTimeZoneEntity,
  DailyGoalEntity,
  DailyStepsEntity,
  OutboxEventEntity,
];

// Dans l'ordre d'application.
export const MIGRATIONS = [InitialSchema1791743484726, OutboxEvents1792520157801];

/**
 * Source unique de la configuration TypeORM : utilisée par l'API, par le script de
 * migration et par les tests, qui ne peuvent donc pas diverger.
 */
export const dataSourceOptions = (url: string): DataSourceOptions => ({
  type: 'postgres',
  url,
  entities: ENTITIES,
  migrations: MIGRATIONS,
  migrationsTableName: 'migrations',
  // gen_random_uuid() : intégré à PostgreSQL depuis la v13, sans extension à installer
  // (le défaut de TypeORM, uuid_generate_v4(), exige l'extension uuid-ossp).
  uuidExtension: 'pgcrypto',
  // Le schéma n'évolue que par des migrations versionnées, jamais automatiquement.
  synchronize: false,
});
