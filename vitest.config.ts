import { defineConfig } from 'vitest/config';

// One root config. Each workspace has its own vitest.config.ts (name, environment);
// `corepack pnpm vitest run packages/contracts` filters by path from the root.
export default defineConfig({
  test: {
    projects: ['packages/*', 'apps/*'],
    passWithNoTests: true,
    coverage: {
      provider: 'v8',
      include: ['packages/*/src/**', 'apps/*/src/**', 'apps/web/lib/**'],
    },
  },
});
