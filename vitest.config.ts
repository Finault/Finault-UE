import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['**/*.test.{js,ts}', '**/__tests__/**/*.{js,ts}'],
    exclude: [
      '**/node_modules/**',
      '**/out/**',
      '**/.next/**',
      'agentos/__tests__/integration/**',
      'apps/modules/**',
      'apps/platform/**',
    ],
    coverage: {
      provider: 'v8',
      include: ['platform/**/*.js', 'modules/**/*.js', 'agentos/**/*.js'],
      exclude: ['**/*.test.js', '**/__tests__/**']
    }
  }
});
