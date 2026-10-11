import { defaultServerConditions } from 'vite';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  // La condition d'export `source` fait résoudre @stepbystep/domain vers ses sources
  // TypeScript : les tests voient toujours le domaine à jour, sans le recompiler.
  resolve: { conditions: ['source', ...defaultServerConditions] },
  ssr: { resolve: { conditions: ['source', ...defaultServerConditions] } },
  test: {
    include: ['src/**/*.test.ts'],
    // Environnement valide pour démarrer l'application dans les tests (aucune base n'est
    // contactée à ce stade : l'URL n'a besoin que d'être bien formée).
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: 'postgres://stepbystep:stepbystep@localhost:5432/stepbystep_test',
    },
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/main.ts'],
    },
  },
});
