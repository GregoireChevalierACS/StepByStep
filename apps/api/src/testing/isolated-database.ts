import { randomUUID } from 'node:crypto';
import pg from 'pg';

/**
 * Crée une base vide et dédiée sur le PostgreSQL de test, pour un fichier de test qui
 * modifie le schéma (migrations) sans gêner les autres tests exécutés en parallèle.
 */
export const createIsolatedDatabase = async (
  serverUrl: string,
): Promise<{ url: string; drop: () => Promise<void> }> => {
  const name = `test_${randomUUID().replaceAll('-', '')}`;
  const admin = new pg.Client({ connectionString: serverUrl });
  await admin.connect();
  await admin.query(`CREATE DATABASE "${name}"`);
  await admin.end();

  const url = new URL(serverUrl);
  url.pathname = `/${name}`;

  return {
    url: url.toString(),
    drop: async () => {
      const client = new pg.Client({ connectionString: serverUrl });
      await client.connect();
      await client.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
      await client.end();
    },
  };
};
