import { defineConfig, devices } from '@playwright/test';

const PORT = process.env.E2E_PORT ?? '3100';
const PROD_PORT = process.env.E2E_PROD_PORT ?? '3101';

// Main suite: `next dev` + AUTH_DEV_BYPASS=1 on a freshly seeded temp PGlite (see e2e/start-server.mjs).
// CSP suite: the production build (`next start`, real sign-in gate) so nonces are checked as shipped.
export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: { trace: 'retain-on-failure' },
  projects: [
    {
      name: 'app',
      testIgnore: /csp\.spec\.ts/,
      use: { ...devices['Desktop Chrome'], baseURL: `http://localhost:${PORT}` },
    },
    {
      name: 'csp',
      testMatch: /csp\.spec\.ts/,
      use: { ...devices['Desktop Chrome'], baseURL: `http://localhost:${PROD_PORT}` },
    },
  ],
  webServer: [
    {
      command: 'node e2e/start-server.mjs',
      url: `http://localhost:${PORT}/api/health`,
      timeout: 240_000,
      reuseExistingServer: !!process.env.E2E_REUSE,
      stdout: 'pipe',
      stderr: 'pipe',
    },
    {
      // Needs `pnpm build` first (the verification command runs it before e2e).
      command: `node node_modules/next/dist/bin/next start -p ${PROD_PORT}`,
      url: `http://localhost:${PROD_PORT}/api/health`,
      timeout: 120_000,
      reuseExistingServer: false,
      env: {
        NODE_ENV: 'production',
        AUTH_SECRET: 'e2e-dummy-secret-at-least-32-characters',
        AUTH_TRUST_HOST: 'true',
        DATABASE_URL: 'pglite:memory://',
      },
    },
  ],
});
