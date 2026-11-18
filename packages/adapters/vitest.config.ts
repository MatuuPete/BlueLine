import { defineProject } from 'vitest/config';

export default defineProject({
  test: {
    name: 'adapters',
    environment: 'node',
    include: ['test/**/*.test.ts'],
    setupFiles: ['test/setup.ts'],
  },
});
