// Test de mutation du domaine : Stryker introduit de petites erreurs dans le code
// (mutants) et vérifie que les tests les détectent. Voir la roadmap, phase 1 et 7.
/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
export default {
  testRunner: 'vitest',
  plugins: ['@stryker-mutator/vitest-runner', '@stryker-mutator/typescript-checker'],
  // Écarte les mutants qui ne compilent pas en TypeScript strict : ils ne sont pas
  // des erreurs plausibles et fausseraient le score.
  checkers: ['typescript'],
  tsconfigFile: 'tsconfig.json',
  mutate: ['src/**/*.ts', '!src/**/*.test.ts', '!src/testing/**', '!src/index.ts'],
  reporters: ['clear-text', 'progress', 'html'],
  htmlReporter: { fileName: 'reports/mutation/index.html' },
  // Condition de fin de la phase 1 : score > 80 %. `break` fait échouer la commande
  // (et la CI) si le score passe sous ce seuil.
  thresholds: { high: 90, low: 80, break: 80 },
};
