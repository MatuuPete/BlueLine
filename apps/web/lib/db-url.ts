import { existsSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';

export const DEFAULT_DATABASE_URL = 'pglite:.data/pglite';

/** Walk up from `start` to the directory holding pnpm-workspace.yaml (falls back to `start`). */
export function findRepoRoot(
  start: string = process.cwd(),
  exists: (p: string) => boolean = existsSync,
): string {
  let dir = resolve(start);
  for (;;) {
    if (exists(join(dir, 'pnpm-workspace.yaml'))) return dir;
    const parent = dirname(dir);
    if (parent === dir) return resolve(start);
    dir = parent;
  }
}

/**
 * Relative on-disk PGlite paths resolve against the repo root, exactly like the worker,
 * so web and worker share one database whichever directory runs them.
 */
export function resolveDatabaseUrl(url: string, repoRoot: string = findRepoRoot()): string {
  if (!url.startsWith('pglite:')) return url;
  const dir = url.slice('pglite:'.length);
  if (!dir || dir.startsWith('memory:') || isAbsolute(dir)) return url;
  return `pglite:${resolve(repoRoot, dir)}`;
}
