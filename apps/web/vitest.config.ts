import { defineProject } from 'vitest/config';

export default defineProject({
  test: {
    name: 'web',
    environment: 'node',
    testTimeout: 30_000,
    hookTimeout: 30_000,
    include: ['test/**/*.test.{ts,tsx}'],
    server: {
      deps: {
        // next-auth imports "next/server" without an extension, which Node's ESM resolver
        // rejects; let Vite resolve it instead.
        inline: ['next-auth'],
      },
    },
  },
});
