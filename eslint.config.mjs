import { defineConfig, globalIgnores } from 'eslint/config';
import typescriptEslint from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import js from '@eslint/js';
import { FlatCompat } from '@eslint/eslintrc';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const compat = new FlatCompat({
  baseDirectory: __dirname,
  recommendedConfig: js.configs.recommended,
  allConfig: js.configs.all,
});

export default defineConfig([
  globalIgnores([
    'docs/',
    '**/.dfx/',
    '**/lib/',
    '**/dist/',
    '**/__certificates__/',
    '**/declarations/',
    '**/types/',
  ]),
  {
    files: ['**/*.{ts,tsx,js,jsx}'],

    extends: compat.extends(
      'eslint:recommended',
      'plugin:@typescript-eslint/recommended',
      'plugin:jsdoc/recommended',
    ),

    plugins: { '@typescript-eslint': typescriptEslint },

    languageOptions: { parser: tsParser },

    rules: {
      // JSDoc
      'jsdoc/newline-after-description': 'off',
      'jsdoc/require-returns-type': 'off',
      'jsdoc/require-param-type': 'off',
      'jsdoc/require-jsdoc': ['error', { publicOnly: true }],
      'jsdoc/check-tag-names': ['warn', { definedTags: ['jest-environment'] }],
      'jsdoc/require-returns': 'off',
      'jsdoc/require-returns-description': 'warn',

      // TypeScript
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/consistent-type-definitions': 'error',
      '@typescript-eslint/no-import-type-side-effects': 'error',
      '@typescript-eslint/no-non-null-assertion': 'warn',
      '@typescript-eslint/no-non-null-asserted-nullish-coalescing': 'error',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],

      // Code style
      'curly': 'error',
      'no-console': ['error', { allow: ['error', 'warn'] }],
      'no-else-return': ['warn', { allowElseIf: false }],
      'no-useless-rename': 'error',
      'no-useless-return': 'error',
      'object-shorthand': 'error',
      'prefer-arrow-callback': 'error',
      'prefer-template': 'error',
      'require-await': 'warn',
    },
  },

  // CLI tools — console.log is the user-facing output
  {
    files: ['packages/migrate/**/*.ts', 'bin/**/*.ts'],
    rules: {
      'no-console': 'off',
    },
  },
]);
