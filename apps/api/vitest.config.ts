import { defaultServerConditions } from 'vite';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  // La condition d'export `source` fait résoudre @stepbystep/domain vers ses sources
  // TypeScript : les tests voient toujours le domaine à jour, sans le recompiler.
  resolve: { conditions: ['source', ...defaultServerConditions] },
  ssr: { resolve: { conditions: ['source', ...defaultServerConditions] } },
  test: {
    include: ['src/**/*.test.ts'],
    env: { NODE_ENV: 'test' },
    // PostgreSQL de test démarré une fois pour la suite (Testcontainers), puis son URL est
    // injectée dans DATABASE_URL avant chaque fichier de test.
    globalSetup: ['src/testing/postgres.global-setup.ts'],
    setupFiles: ['src/testing/database-url.setup.ts'],
    // Démarrer un conteneur peut prendre plus que le délai par défaut.
    hookTimeout: 60_000,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/main.ts', 'src/database/migrate.ts', 'src/testing/**'],
    },
  },
});
