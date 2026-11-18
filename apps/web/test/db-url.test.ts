import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { findRepoRoot, resolveDatabaseUrl } from '../lib/db-url';

const root = resolve('/repo');

describe('resolveDatabaseUrl', () => {
  it('resolves relative pglite paths against the repo root', () => {
    expect(resolveDatabaseUrl('pglite:.data/pglite', root)).toBe(
      `pglite:${resolve(root, '.data/pglite')}`,
    );
    expect(resolveDatabaseUrl('pglite:./.data/pglite', root)).toBe(
      `pglite:${resolve(root, '.data/pglite')}`,
    );
  });

  it('leaves absolute, in-memory and Postgres URLs alone', () => {
    const abs = `pglite:${resolve('/abs/db')}`;
    expect(resolveDatabaseUrl(abs, root)).toBe(abs);
    expect(resolveDatabaseUrl('pglite:', root)).toBe('pglite:');
    expect(resolveDatabaseUrl('pglite:memory://x', root)).toBe('pglite:memory://x');
    expect(resolveDatabaseUrl('postgres://u:p@h/db', root)).toBe('postgres://u:p@h/db');
  });
});

describe('findRepoRoot', () => {
  it('walks up to the directory containing pnpm-workspace.yaml', () => {
    const marker = resolve('/repo/pnpm-workspace.yaml');
    const exists = (p: string) => resolve(p) === marker;
    expect(findRepoRoot(resolve('/repo/apps/web'), exists)).toBe(resolve('/repo'));
  });

  it('falls back to the start directory when none is found', () => {
    expect(findRepoRoot(resolve('/x/y'), () => false)).toBe(resolve('/x/y'));
  });
});
