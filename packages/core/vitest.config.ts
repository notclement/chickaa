import { defineConfig } from 'vitest/config';

// The financial engine is the riskiest code in the app: CI fails if coverage drops.
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/index.ts'],
      thresholds: { lines: 100, functions: 100, statements: 100, branches: 95 },
      reporter: ['text-summary'],
    },
  },
});
