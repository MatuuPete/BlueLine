import { defineProject } from 'vitest/config';

export default defineProject({
  test: {
    name: 'analytics',
    environment: 'node',
    testTimeout: 30_000,
    hookTimeout: 30_000,
    include: ['test/**/*.test.ts'],
  },
});
