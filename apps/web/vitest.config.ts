import { defineProject } from 'vitest/config';

export default defineProject({
  test: {
    name: 'web',
    environment: 'node',
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
