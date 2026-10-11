// Règles d'architecture vérifiées sur le graphe complet des dépendances du dépôt
// (complément d'ESLint, qui ne voit qu'un fichier à la fois). Lancement : `pnpm lint:architecture`.

const DOMAIN_SOURCES = '^packages/domain/src/';
const TEST_FILES = '\\.test\\.ts$|/testing/';

/** @type {import('dependency-cruiser').IConfiguration} */
export default {
  forbidden: [
    {
      name: 'domaine-sans-dependance-externe',
      comment:
        'Le domaine (hors tests) ne dépend que de lui-même : ni package npm, ni module Node. ' +
        'Architecture hexagonale : le cœur métier ne connaît aucune technologie.',
      severity: 'error',
      from: { path: DOMAIN_SOURCES, pathNot: TEST_FILES },
      to: {
        dependencyTypes: [
          'npm',
          'npm-dev',
          'npm-optional',
          'npm-peer',
          'npm-bundled',
          'npm-no-pkg',
          'npm-unknown',
          'core',
        ],
      },
    },
    {
      name: 'domaine-independant-des-apps',
      comment: 'Les dépendances pointent vers le domaine, jamais l’inverse.',
      severity: 'error',
      from: { path: '^packages/domain/' },
      to: { path: '^apps/' },
    },
    {
      name: 'domaine-par-son-api-publique',
      comment:
        'Les apps n’utilisent le domaine que par son point d’entrée (index.ts), jamais ses fichiers internes.',
      severity: 'error',
      from: { path: '^apps/' },
      to: { path: DOMAIN_SOURCES, pathNot: `${DOMAIN_SOURCES}index\\.ts$` },
    },
    {
      name: 'pas-de-cycle',
      comment:
        'Un cycle rend les modules indissociables : impossibles à comprendre et à tester seuls.',
      severity: 'error',
      from: {},
      to: { circular: true },
    },
    {
      name: 'production-independante-des-tests',
      comment: 'Le code de production n’importe ni fichiers de test ni helpers de test.',
      severity: 'error',
      from: { pathNot: TEST_FILES },
      to: { path: TEST_FILES },
    },
    {
      name: 'production-sans-dependance-de-dev',
      comment:
        'Une dépendance de développement (vitest, supertest…) n’est pas installée en production : ' +
        'l’importer depuis le code de production le ferait planter au démarrage.',
      severity: 'error',
      from: { path: '^(apps|packages)/[^/]+/src/', pathNot: TEST_FILES },
      to: { dependencyTypes: ['npm-dev'], dependencyTypesNot: ['type-only'] },
    },
    {
      name: 'imports-resolus',
      comment:
        'Tout import doit se résoudre : une faute de frappe ou un package non déclaré dans le ' +
        'package.json du module (pnpm est strict) planterait à l’exécution.',
      severity: 'error',
      from: {},
      to: { couldNotResolve: true },
    },
  ],
  options: {
    // Lit le package.json le plus proche de chaque fichier (et ceux des dossiers parents) :
    // sans cela, seules les dépendances du package.json racine seraient connues.
    combinedDependencies: true,
    // Les packages npm restent visibles (la flèche vers eux est vérifiée) sans être explorés.
    // Ne pas les exclure : exclure un dossier supprime aussi toutes les flèches qui y mènent.
    doNotFollow: { path: 'node_modules' },
    exclude: { path: '(^|/)(dist|coverage|reports|\\.stryker-tmp)/' },
    tsPreCompilationDeps: true,
    enhancedResolveOptions: {
      // Le domaine est résolu vers ses sources (condition `source`), comme dans les tests.
      exportsFields: ['exports'],
      conditionNames: ['source', 'import', 'types', 'default'],
      extensions: ['.ts', '.js', '.mjs'],
    },
  },
};
