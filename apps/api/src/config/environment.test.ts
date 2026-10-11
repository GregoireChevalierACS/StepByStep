import { describe, expect, it } from 'vitest';
import { parseEnvironment } from './environment.js';

const DATABASE_URL = 'postgres://stepbystep:s3cr3t-password@localhost:5432/stepbystep';

const errorMessageOf = (env: Record<string, unknown>): string => {
  try {
    parseEnvironment(env);
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
  throw new Error('parseEnvironment aurait dû lever une erreur');
};

describe('parseEnvironment', () => {
  it('applique les valeurs par défaut quand seule la base est fournie', () => {
    expect(parseEnvironment({ DATABASE_URL })).toEqual({
      NODE_ENV: 'development',
      PORT: 3000,
      DATABASE_URL,
    });
  });

  it('convertit le port, lu comme du texte dans l’environnement, en nombre', () => {
    expect(parseEnvironment({ DATABASE_URL, PORT: '8080', NODE_ENV: 'production' })).toMatchObject({
      NODE_ENV: 'production',
      PORT: 8080,
    });
  });

  it.each(['0', '65536', '80.5', 'abc'])('refuse un port invalide : %s', (PORT) => {
    expect(() => parseEnvironment({ DATABASE_URL, PORT })).toThrow(/PORT/);
  });

  it('refuse un environnement d’exécution inconnu', () => {
    expect(() => parseEnvironment({ DATABASE_URL, NODE_ENV: 'staging' })).toThrow(/NODE_ENV/);
  });

  it('exige l’URL de la base de données', () => {
    expect(() => parseEnvironment({})).toThrow(/DATABASE_URL/);
  });

  it.each(['localhost:5432/stepbystep', 'mysql://user:pass@localhost/db'])(
    'refuse une URL de base qui n’est pas PostgreSQL : %s',
    (url) => {
      expect(() => parseEnvironment({ DATABASE_URL: url })).toThrow(/DATABASE_URL/);
    },
  );

  it('signale toutes les variables invalides en une seule fois', () => {
    expect(() => parseEnvironment({ PORT: 'abc', NODE_ENV: 'staging' })).toThrow(
      /PORT[\s\S]*NODE_ENV|NODE_ENV[\s\S]*PORT/,
    );
    expect(() => parseEnvironment({ PORT: 'abc', NODE_ENV: 'staging' })).toThrow(/DATABASE_URL/);
  });

  it('n’affiche jamais la valeur des variables dans le message d’erreur (secrets)', () => {
    const leaky = 'mysql://user:s3cr3t-password@localhost/db';

    const message = errorMessageOf({ DATABASE_URL: leaky });

    expect(message).toContain('DATABASE_URL');
    expect(message).not.toContain('s3cr3t-password');
  });
});
