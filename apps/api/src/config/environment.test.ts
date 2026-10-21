import { describe, expect, it } from 'vitest';
import { parseDatabaseEnvironment, parseEnvironment } from './environment.js';

const DATABASE_URL = 'postgres://stepbystep:s3cr3t-password@localhost:5432/stepbystep';
const JWT_SECRET = 'cle-de-signature-de-test-de-32-caracteres-au-moins';

const errorMessageOf = (env: Record<string, unknown>): string => {
  try {
    parseEnvironment(env);
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
  throw new Error('parseEnvironment aurait dû lever une erreur');
};

describe('parseEnvironment', () => {
  it('applique les valeurs par défaut quand seules les variables obligatoires sont fournies', () => {
    expect(parseEnvironment({ DATABASE_URL, JWT_SECRET })).toEqual({
      NODE_ENV: 'development',
      PORT: 3000,
      DATABASE_URL,
      JWT_SECRET,
      OUTBOX_RELAY_INTERVAL_MS: 5000,
    });
  });

  it('accepte 0 pour désactiver le relais de l’outbox, et refuse un intervalle invalide', () => {
    expect(
      parseEnvironment({ DATABASE_URL, JWT_SECRET, OUTBOX_RELAY_INTERVAL_MS: '0' }),
    ).toMatchObject({
      OUTBOX_RELAY_INTERVAL_MS: 0,
    });
    expect(() =>
      parseEnvironment({ DATABASE_URL, JWT_SECRET, OUTBOX_RELAY_INTERVAL_MS: '-1' }),
    ).toThrow(/OUTBOX_RELAY_INTERVAL_MS/);
  });

  it('convertit le port, lu comme du texte dans l’environnement, en nombre', () => {
    expect(
      parseEnvironment({ DATABASE_URL, JWT_SECRET, PORT: '8080', NODE_ENV: 'production' }),
    ).toMatchObject({
      NODE_ENV: 'production',
      PORT: 8080,
    });
  });

  it.each(['0', '65536', '80.5', 'abc'])('refuse un port invalide : %s', (PORT) => {
    expect(() => parseEnvironment({ DATABASE_URL, JWT_SECRET, PORT })).toThrow(/PORT/);
  });

  it('refuse un environnement d’exécution inconnu', () => {
    expect(() => parseEnvironment({ DATABASE_URL, JWT_SECRET, NODE_ENV: 'staging' })).toThrow(
      /NODE_ENV/,
    );
  });

  it('exige l’URL de la base de données', () => {
    expect(() => parseEnvironment({})).toThrow(/DATABASE_URL/);
  });

  it.each(['localhost:5432/stepbystep', 'mysql://user:pass@localhost/db'])(
    'refuse une URL de base qui n’est pas PostgreSQL : %s',
    (url) => {
      expect(() => parseEnvironment({ DATABASE_URL: url, JWT_SECRET })).toThrow(/DATABASE_URL/);
    },
  );

  it('signale toutes les variables invalides en une seule fois', () => {
    expect(() => parseEnvironment({ PORT: 'abc', NODE_ENV: 'staging' })).toThrow(
      /PORT[\s\S]*NODE_ENV|NODE_ENV[\s\S]*PORT/,
    );
    expect(() => parseEnvironment({ PORT: 'abc', NODE_ENV: 'staging' })).toThrow(/DATABASE_URL/);
  });

  it('exige une clé de signature des jetons d’au moins 32 caractères', () => {
    expect(() => parseEnvironment({ DATABASE_URL })).toThrow(/JWT_SECRET/);
    expect(() => parseEnvironment({ DATABASE_URL, JWT_SECRET: 'trop-courte' })).toThrow(
      /JWT_SECRET/,
    );
    expect(errorMessageOf({ DATABASE_URL, JWT_SECRET: 'trop-courte' })).not.toContain(
      'trop-courte',
    );
  });

  it('n’affiche jamais la valeur des variables dans le message d’erreur (secrets)', () => {
    const leaky = 'mysql://user:s3cr3t-password@localhost/db';

    const message = errorMessageOf({ DATABASE_URL: leaky });

    expect(message).toContain('DATABASE_URL');
    expect(message).not.toContain('s3cr3t-password');
  });
});

describe('parseDatabaseEnvironment', () => {
  it('n’exige que la base : une migration n’a pas besoin de la clé des jetons', () => {
    expect(parseDatabaseEnvironment({ DATABASE_URL })).toEqual({ DATABASE_URL });
  });

  it('valide la base comme au démarrage de l’API, sans afficher sa valeur', () => {
    const leaky = 'mysql://user:s3cr3t-password@localhost/db';

    expect(() => parseDatabaseEnvironment({ DATABASE_URL: leaky })).toThrow(/DATABASE_URL/);
    expect(() => parseDatabaseEnvironment({ DATABASE_URL: leaky })).not.toThrow(/s3cr3t/);
  });
});
