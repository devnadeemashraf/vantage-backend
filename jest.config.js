/**
 * Jest Configuration
 *
 * Uses ts-jest to compile TypeScript test files on the fly, so there is no
 * separate build step before running tests. The `moduleNameMapper` mirrors
 * the path aliases defined in tsconfig.json — without this, Jest would not
 * know how to resolve imports like `@domain/entities/Business`.
 *
 * Test discovery:
 *   Tests live under `src/__tests__/` and follow a naming convention:
 *     *.unit.test.ts        — fast, isolated, no external services
 *     *.integration.test.ts — require a running database (Docker Compose)
 *
 *   The npm scripts `test:unit` and `test:integration` use `--testPathPattern`
 *   to run each group independently; `npm test` runs everything.
 */

/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',

  rootDir: '.',
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.test.ts'],

  moduleNameMapper: {
    '^@core/(.*)$': '<rootDir>/src/core/$1',
    '^@domain/(.*)$': '<rootDir>/src/domain/$1',
    '^@infrastructure/(.*)$': '<rootDir>/src/infrastructure/$1',
    '^@application/(.*)$': '<rootDir>/src/application/$1',
    '^@interfaces/(.*)$': '<rootDir>/src/interfaces/$1',
    '^@workers/(.*)$': '<rootDir>/src/workers/$1',
    '^@shared/(.*)$': '<rootDir>/src/shared/$1',
  },

  /**
   * Collect coverage from source files only (excludes tests, scripts, and
   * the worker entry point which is hard to unit-test in-process).
   */
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/__tests__/**',
    '!src/scripts/**',
    '!src/server.ts',
  ],

  /**
   * Force Jest to exit after all tests complete — prevents hanging on
   * open handles (DB connections, timers) that may not be cleaned up.
   */
  forceExit: true,
  detectOpenHandles: true,
};
