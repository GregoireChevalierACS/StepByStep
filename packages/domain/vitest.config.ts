import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    passWithNoTests: true,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/index.ts', 'src/testing/**'],
      // Le domaine est entièrement couvert : toute régression fait échouer la commande (et la CI).
      thresholds: { lines: 100, branches: 100, functions: 100, statements: 100 },
    },
  },
});
