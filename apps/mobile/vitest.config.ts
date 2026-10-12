import { defaultServerConditions } from 'vite';
import { defineConfig } from 'vitest/config';

// Tests unitaires du code TypeScript pur de l'app (cas d'usage, mappers), exécutés par Node :
// ce qui dépend de React Native ou du module natif est validé sur le S22.
export default defineConfig({
  // La condition d'export `source` fait résoudre @stepbystep/domain vers ses sources
  // TypeScript : les tests voient toujours le domaine à jour, sans le recompiler.
  resolve: { conditions: ['source', ...defaultServerConditions] },
  ssr: { resolve: { conditions: ['source', ...defaultServerConditions] } },
  test: {
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/application/**/*.ts', 'src/presentation/**/*.ts'],
      exclude: ['src/**/*.test.ts'],
      // Cas d'usage et mise en forme de l'app entièrement couverts : une régression fait échouer
      // la CI. Les écrans (.tsx) et les adapters natifs ou HTTP sont validés sur le S22.
      thresholds: { lines: 100, branches: 100, functions: 100, statements: 100 },
    },
  },
});
