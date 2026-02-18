/**
 * ESLint Configuration (Flat Config format — ESLint 10+)
 *
 * This file uses the "flat config" format introduced in ESLint 9 and made default
 * in ESLint 10. Instead of cascading .eslintrc files, everything is a single
 * exported array of config objects — simpler and more explicit.
 *
 * Why .mjs extension?
 *   Our package.json sets "type": "commonjs", which means .js files use
 *   require() syntax. But ESLint's flat config needs ES module `import` syntax.
 *   Using .mjs tells Node.js "treat this one file as an ES module" regardless
 *   of the project's default module system.
 *
 * Why scope TypeScript rules to src/**\/*.ts?
 *   Without scoping, TypeScript-aware rules would also try to parse this config
 *   file and other root-level JS files through the TypeScript parser, which
 *   would fail because those files aren't in tsconfig.json's "include".
 *
 * eslint-config-prettier is loaded to disable any ESLint formatting rules that
 * would conflict with Prettier — they each stay in their lane.
 */
import { defineConfig } from 'eslint/config';
import tseslint from 'typescript-eslint';
import eslintConfigPrettier from 'eslint-config-prettier';
import simpleImportSort from 'eslint-plugin-simple-import-sort';

export default defineConfig(
  {
    ignores: ['dist/', 'node_modules/', 'temp/'],
  },
  eslintConfigPrettier,
  {
    files: ['src/**/*.ts'],
    extends: [...tseslint.configs.recommended],
    plugins: {
      'simple-import-sort': simpleImportSort,
    },
    languageOptions: {
      parserOptions: {
        project: './tsconfig.json',
      },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/no-explicit-any': 'warn',
      'no-console': 'warn',
      'simple-import-sort/imports': 'error',
      'simple-import-sort/exports': 'error',
    },
  },
);
