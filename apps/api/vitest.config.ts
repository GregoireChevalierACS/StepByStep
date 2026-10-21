import { defaultServerConditions } from 'vite';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  // La condition d'export `source` fait résoudre @stepbystep/domain vers ses sources
  // TypeScript : les tests voient toujours le domaine à jour, sans le recompiler.
  resolve: { conditions: ['source', ...defaultServerConditions] },
  ssr: { resolve: { conditions: ['source', ...defaultServerConditions] } },
  test: {
    // Relais de l'outbox désactivé : sinon, chaque test qui démarre l'application publierait en
    // arrière-plan des événements écrits par d'autres tests, au hasard du calendrier.
    env: {
      NODE_ENV: 'test',
      OUTBOX_RELAY_INTERVAL_MS: '0',
      JWT_SECRET: 'cle-de-signature-reservee-aux-tests-de-l-api',
    },
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/main.ts', 'src/database/migrate.ts', 'src/testing/**'],
    },
    // Pyramide de tests : `pnpm test` lance les deux projets, `--project unit` les seuls
    // tests unitaires (instantanés, sans Docker), pratique pour la boucle TDD.
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          include: ['src/**/*.test.ts'],
          exclude: ['src/**/*.int.test.ts'],
        },
      },
      {
        extends: true,
        test: {
          name: 'integration',
          include: ['src/**/*.int.test.ts'],
          // PostgreSQL de test démarré une fois pour ce projet (Testcontainers), puis son URL
          // est injectée dans DATABASE_URL avant chaque fichier de test.
          globalSetup: ['src/testing/postgres.global-setup.ts'],
          setupFiles: ['src/testing/database-url.setup.ts'],
          // Démarrer un conteneur peut prendre plus que le délai par défaut.
          hookTimeout: 60_000,
        },
      },
    ],
  },
});
