import { defineConfig } from 'vitest/config';

// One root config runs the unit tests in shared/ and the API tests in server/.
export default defineConfig({
  test: {
    include: ['shared/**/*.test.ts', 'server/tests/**/*.test.ts'],
    testTimeout: 15000,
    hookTimeout: 30000,
    coverage: {
      provider: 'v8',
      include: ['shared/src/**/*.ts', 'server/src/**/*.ts'],
      // Entry points and dev-only scripts are exercised by the browser tests, not unit tests.
      exclude: ['**/*.test.ts', 'server/src/index.ts', 'server/src/seed.ts', '**/*.d.ts'],
      reporter: ['text-summary', 'json-summary'],
    },
  },
});
