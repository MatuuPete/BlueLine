import { defineProject } from 'vitest/config';

export default defineProject({
  test: {
    name: 'adapters',
    environment: 'node',
    testTimeout: 30_000,
    hookTimeout: 30_000,
    include: ['test/**/*.test.ts'],
    setupFiles: ['test/setup.ts'],
  },
});
