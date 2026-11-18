import { closeDb } from '@blueline/db';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';

process.env.DATABASE_URL = 'pglite:';

// Auth.js `auth()` reads request headers, which only exist inside a Next request; stub it.
let currentSession: { user?: { id?: string; email?: string } } | null = null;
vi.mock('../auth', () => ({ auth: async () => currentSession }));

const { getUserId } = await import('../lib/session');
const { getDb } = await import('../lib/db');

afterAll(async () => {
  await closeDb(await getDb());
});

afterEach(() => {
  vi.unstubAllEnvs();
  currentSession = null;
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

describe('getUserId with Auth.js', () => {
  it('returns session.user.id', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    currentSession = { user: { id: 'u_abc', email: 'matt@example.com' } };
    expect(await getUserId()).toBe('u_abc');
  });

  it('returns null for a session without a user id', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    currentSession = { user: { email: 'matt@example.com' } };
    expect(await getUserId()).toBeNull();
  });
});
