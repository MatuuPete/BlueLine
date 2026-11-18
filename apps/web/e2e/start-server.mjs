// Starts the web app for the main e2e suite: a freshly seeded PGlite directory in the OS temp
// dir (never the developer's .data), then `next dev` with the dev auth bypass on.
// Playwright starts webServers before globalSetup, so seeding lives here rather than there.
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const port = process.env.E2E_PORT ?? '3100';
const dir = mkdtempSync(join(tmpdir(), 'blueline-e2e-'));
const env = {
  ...process.env,
  DATABASE_URL: `pglite:${dir}`,
  STATS_PROVIDER: 'fixtures',
  ODDS_PROVIDER: 'fixtures',
  AUTH_DEV_BYPASS: '1',
  AUTH_SECRET: 'e2e-dummy-secret-at-least-32-characters',
  AUTH_TRUST_HOST: 'true',
  NODE_ENV: 'development',
};

const seed = spawnSync('corepack pnpm worker seed', {
  cwd: root,
  env,
  stdio: 'inherit',
  shell: true,
});
if (seed.status !== 0) {
  rmSync(dir, { recursive: true, force: true });
  process.exit(seed.status ?? 1);
}

const nextBin = join(root, 'apps/web/node_modules/next/dist/bin/next');
const child = spawn(process.execPath, [nextBin, 'dev', '-p', port], {
  cwd: join(root, 'apps/web'),
  env,
  stdio: 'inherit',
});
const stop = () => {
  child.kill();
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {}
};
process.on('SIGTERM', () => {
  stop();
  process.exit(0);
});
process.on('SIGINT', () => {
  stop();
  process.exit(0);
});
child.on('exit', (code) => {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {}
  process.exit(code ?? 0);
});
