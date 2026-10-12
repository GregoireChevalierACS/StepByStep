import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/',
      '**/coverage/',
      '**/dist/',
      '**/reports/',
      '**/.stryker-tmp/',
      // Projets natifs et fichiers générés par Expo (npx expo run:android), hors du dépôt.
      'apps/mobile/android/',
      'apps/mobile/ios/',
      'apps/mobile/.expo/',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: { allowDefaultProject: ['*.mjs'] },
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    files: ['**/*.mjs'],
    ...tseslint.configs.disableTypeChecked,
    // Fichiers de configuration et scripts exécutés par Node : process, fetch… sont des globales.
    // (fusionné avec les options de disableTypeChecked, qu'il ne faut pas écraser).
    languageOptions: {
      ...tseslint.configs.disableTypeChecked.languageOptions,
      globals: globals.node,
    },
  },
  {
    // Règle d'or : le domaine est du TS pur, sans framework ni infrastructure.
    files: ['packages/domain/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                'react',
                'react-*',
                'expo',
                'expo-*',
                '@expo/*',
                'drizzle-orm',
                'drizzle-orm/*',
                '@nestjs/*',
                'typeorm',
                'typeorm/*',
                'pg',
              ],
              message:
                'Le domaine ne doit dépendre ni de React, ni d’Expo, ni de NestJS, ni de l’infrastructure.',
            },
            {
              group: ['**/apps/**'],
              message: 'Le domaine ne doit jamais importer depuis apps/.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['apps/api/**/*.ts'],
    rules: {
      // Un module NestJS est une classe vide décorée par @Module : cas prévu par la règle.
      '@typescript-eslint/no-extraneous-class': ['error', { allowWithDecorator: true }],
    },
  },
  prettier,
);
