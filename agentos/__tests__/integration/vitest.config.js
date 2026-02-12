/**
 * Finault Integration Test — Vitest Configuration
 *
 * Separate config for integration tests that hit real PostgreSQL.
 * Run with: npx vitest run --config agentos/__tests__/integration/vitest.config.js
 */

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    testTimeout: 30000,       // 30s per test (DB operations can be slow)
    hookTimeout: 120000,      // 2min for beforeAll (schema setup + migrations)
    bail: 1,                  // Stop on first failure — integration failures cascade
    reporters: ['verbose'],
    include: [
      'agentos/__tests__/integration/**/*.test.js',
    ],
    exclude: [
      '**/node_modules/**',
      '**/setup/**',
    ],
    // Run test files sequentially (they share a database)
    fileParallelism: false,
    // Pool settings for integration tests
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true,     // All tests in one process (shared DB connection)
      },
    },
  },
});
