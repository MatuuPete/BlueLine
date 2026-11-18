import { closeDb } from '@blueline/db';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';

process.env.DATABASE_URL = 'pglite:';
process.env.AUTH_SECRET ??= 'test-secret-test-secret-test-secret-00';

const {
  canSignIn,
  isEmailAllowed,
  normalizeEmail,
  parseAllowlist,
  pickGithubEmail,
  userIdForEmail,
} = await import('../lib/auth-rules');
const { authConfig } = await import('../auth.config');
const { signInCallback } = await import('../auth');
const { getDb } = await import('../lib/db');
const { eq, users } = await import('@blueline/db');

afterEach(() => {
  vi.unstubAllEnvs();
});

afterAll(async () => {
  await closeDb(await getDb());
});

describe('allowlist', () => {
  it('parses a comma list: trimmed, lowercased, blanks dropped', () => {
    expect([...parseAllowlist(' A@x.com, b@Y.com ,,')]).toEqual(['a@x.com', 'b@y.com']);
  });

  it('an empty or missing list allows nobody', () => {
    expect(isEmailAllowed('a@x.com', '')).toBe(false);
    expect(isEmailAllowed('a@x.com', undefined)).toBe(false);
    expect(isEmailAllowed('', ' , ')).toBe(false);
  });

  it('matches case-insensitively and rejects everyone else', () => {
    expect(isEmailAllowed('  Matt@Example.COM ', 'matt@example.com')).toBe(true);
    expect(isEmailAllowed('mallory@example.com', 'matt@example.com')).toBe(false);
    expect(isEmailAllowed('matt@example.com.evil', 'matt@example.com')).toBe(false);
  });

  it('normalizeEmail trims and lowercases', () => {
    expect(normalizeEmail('  A@B.Co ')).toBe('a@b.co');
  });
});

describe('userIdForEmail', () => {
  it('is u_ + 24 hex chars of sha256(lowercased email)', () => {
    // sha256("a@b.co") starts 80305c9bb1bb2480e0389435…
    expect(userIdForEmail('a@b.co')).toBe('u_80305c9bb1bb2480e0389435');
  });

  it('is stable across case and whitespace, so Google and GitHub map to one user', () => {
    expect(userIdForEmail(' Matt@Example.com')).toBe(userIdForEmail('matt@example.com'));
    expect(userIdForEmail('matt@example.com')).not.toBe(userIdForEmail('other@example.com'));
  });
});

describe('canSignIn', () => {
  const list = 'matt@example.com';

  it('accepts an allowlisted, verified Google email', () => {
    expect(
      canSignIn(
        { provider: 'google', email: 'Matt@example.com', profile: { email_verified: true } },
        list,
      ),
    ).toBe(true);
  });

  it('rejects a non-allowlisted email', () => {
    expect(
      canSignIn(
        { provider: 'google', email: 'eve@example.com', profile: { email_verified: true } },
        list,
      ),
    ).toBe(false);
    expect(canSignIn({ provider: 'github', email: 'eve@example.com' }, list)).toBe(false);
  });

  it('rejects an unverified Google email even when allowlisted', () => {
    expect(
      canSignIn(
        { provider: 'google', email: 'matt@example.com', profile: { email_verified: false } },
        list,
      ),
    ).toBe(false);
    expect(canSignIn({ provider: 'google', email: 'matt@example.com', profile: {} }, list)).toBe(
      false,
    );
  });

  it('rejects a missing email and unknown providers', () => {
    expect(canSignIn({ provider: 'github', email: null }, list)).toBe(false);
    expect(canSignIn({ provider: 'credentials', email: 'matt@example.com' }, list)).toBe(false);
  });

  it('accepts an allowlisted GitHub email (verification is enforced when it is picked)', () => {
    expect(canSignIn({ provider: 'github', email: 'MATT@example.com' }, list)).toBe(true);
  });
});

describe('pickGithubEmail', () => {
  it('prefers the verified primary email', () => {
    expect(
      pickGithubEmail([
        { email: 'x@example.com', primary: false, verified: true },
        { email: 'p@example.com', primary: true, verified: true },
      ]),
    ).toBe('p@example.com');
  });

  it('falls back to any verified email and never returns an unverified one', () => {
    expect(
      pickGithubEmail([
        { email: 'p@example.com', primary: true, verified: false },
        { email: 'v@example.com', primary: false, verified: true },
      ]),
    ).toBe('v@example.com');
    expect(
      pickGithubEmail([{ email: 'p@example.com', primary: true, verified: false }]),
    ).toBeNull();
    expect(pickGithubEmail('nope')).toBeNull();
  });
});

describe('jwt and session callbacks', () => {
  const jwt = authConfig.callbacks!.jwt!;
  const session = authConfig.callbacks!.session!;
  type JwtArgs = Parameters<typeof jwt>[0];
  type SessionArgs = Parameters<typeof session>[0];

  it('on sign-in, the token carries the derived user id', async () => {
    vi.stubEnv('ALLOWED_EMAILS', 'matt@example.com');
    const token = await jwt({
      token: { email: 'Matt@example.com' },
      user: { id: 'google-123', email: 'Matt@example.com' },
      account: null,
    } as unknown as JwtArgs);
    expect(token).toMatchObject({
      uid: userIdForEmail('matt@example.com'),
      email: 'matt@example.com',
    });
  });

  it('drops the session once the email leaves the allowlist', async () => {
    vi.stubEnv('ALLOWED_EMAILS', 'someone-else@example.com');
    const token = await jwt({
      token: { email: 'matt@example.com', uid: userIdForEmail('matt@example.com') },
    } as unknown as JwtArgs);
    expect(token).toBeNull();
  });

  it('session.user.id comes from the token', async () => {
    const uid = userIdForEmail('matt@example.com');
    const s = await session({
      session: { user: { email: 'matt@example.com' }, expires: '2099-01-01T00:00:00.000Z' },
      token: { uid, email: 'matt@example.com' },
    } as unknown as SessionArgs);
    expect(s.user?.id).toBe(uid);
  });
});

describe('signIn callback', () => {
  it('rejects a non-allowlisted email without creating a user', async () => {
    vi.stubEnv('ALLOWED_EMAILS', 'matt@example.com');
    const ok = await signInCallback({
      user: { email: 'eve@example.com', name: 'Eve' },
      account: { provider: 'github' },
    });
    expect(ok).toBe(false);
    const db = await getDb();
    expect(await db.select().from(users).where(eq(users.email, 'eve@example.com'))).toHaveLength(0);
  }, 30_000);

  it('accepts an allowlisted email and upserts the users row', async () => {
    vi.stubEnv('ALLOWED_EMAILS', 'matt@example.com');
    const args = {
      user: { email: 'Matt@Example.com', name: 'Matt' },
      account: { provider: 'google' },
      profile: { email_verified: true },
    };
    expect(await signInCallback(args)).toBe(true);
    // Second sign-in (e.g. via GitHub) updates the name, same row.
    expect(
      await signInCallback({
        user: { email: 'matt@example.com', name: 'Matt L' },
        account: { provider: 'github' },
      }),
    ).toBe(true);
    const db = await getDb();
    const rows = await db.select().from(users).where(eq(users.email, 'matt@example.com'));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: userIdForEmail('matt@example.com'), name: 'Matt L' });
  });
});
