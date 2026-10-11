// Applique ou annule les migrations sur la base de DATABASE_URL (validée comme au démarrage
// de l'API). Compilé avec l'API : aucune dépendance supplémentaire en production.
// Usage : node dist/database/migrate.js <run | revert | status>
import 'reflect-metadata';
import { existsSync } from 'node:fs';
import { DataSource } from 'typeorm';
import { parseEnvironment } from '../config/environment.js';
import { dataSourceOptions } from './data-source-options.js';

// En local, la configuration est dans .env (en production, dans l'environnement).
if (existsSync('.env')) process.loadEnvFile('.env');

const { DATABASE_URL } = parseEnvironment(process.env);
const command = process.argv[2];
const dataSource = await new DataSource(dataSourceOptions(DATABASE_URL)).initialize();

try {
  switch (command) {
    case 'run': {
      // Une transaction par migration : un échec annule la migration entière.
      const applied = await dataSource.runMigrations({ transaction: 'each' });
      console.log(
        applied.length === 0
          ? 'Base à jour : aucune migration à appliquer.'
          : `Migrations appliquées : ${applied.map(({ name }) => name).join(', ')}`,
      );
      break;
    }
    case 'revert': {
      await dataSource.undoLastMigration({ transaction: 'each' });
      console.log('Dernière migration annulée.');
      break;
    }
    case 'status': {
      const pending = await dataSource.showMigrations();
      console.log(pending ? 'Des migrations sont en attente.' : 'Base à jour.');
      break;
    }
    default:
      throw new Error(`Commande inconnue « ${String(command)} » : attendu run, revert ou status.`);
  }
} finally {
  await dataSource.destroy();
}
