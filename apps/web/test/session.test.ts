import { afterEach, describe, expect, it, vi } from 'vitest';

process.env.DATABASE_URL = 'pglite:';
const { getUserId } = await import('../lib/session');

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('getUserId dev bypass', () => {
  it('returns dev-user in development with AUTH_DEV_BYPASS=1', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('AUTH_DEV_BYPASS', '1');
    expect(await getUserId()).toBe('dev-user');
  }, 30_000);

  it('returns null in production even with AUTH_DEV_BYPASS=1', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('AUTH_DEV_BYPASS', '1');
    expect(await getUserId()).toBeNull();
  });

  it('returns null without the bypass flag', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('AUTH_DEV_BYPASS', '0');
    expect(await getUserId()).toBeNull();
  });
});
