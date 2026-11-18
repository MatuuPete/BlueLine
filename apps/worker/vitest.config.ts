import { defineProject } from 'vitest/config';

export default defineProject({
  test: {
    name: 'worker',
    environment: 'node',
    include: ['test/**/*.test.ts'],
    setupFiles: ['test/setup.ts'],
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
