import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['**/node_modules/', '**/coverage/', '**/dist/', '**/reports/', '**/.stryker-tmp/'] },
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
              ],
              message:
                'Le domaine ne doit dépendre ni de React, ni d’Expo, ni de l’infrastructure.',
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
  prettier,
);
