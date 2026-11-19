import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { ProviderButtons } from '../app/signin/ProviderButtons';
import { configuredProviders } from '../lib/auth-providers';

process.env.DATABASE_URL = 'pglite:';
process.env.AUTH_SECRET ??= 'test-secret-test-secret-test-secret-00';
const { buildProviders } = await import('../auth.config');

const ids = (env: Record<string, string | undefined>) =>
  buildProviders(env).map((p) => (typeof p === 'function' ? p({}).id : p.id));

describe('configuredProviders', () => {
  it('needs both the id and the secret', () => {
    expect(configuredProviders({})).toEqual({ github: false, google: false });
    expect(configuredProviders({ AUTH_GITHUB_ID: 'a' })).toEqual({ github: false, google: false });
    expect(configuredProviders({ AUTH_GITHUB_ID: 'a', AUTH_GITHUB_SECRET: ' ' }).github).toBe(
      false,
    );
    expect(
      configuredProviders({
        AUTH_GITHUB_ID: 'a',
        AUTH_GITHUB_SECRET: 'b',
        AUTH_GOOGLE_ID: 'c',
        AUTH_GOOGLE_SECRET: 'd',
      }),
    ).toEqual({ github: true, google: true });
  });
});

describe('buildProviders', () => {
  it('includes only the configured providers', () => {
    expect(ids({})).toEqual([]);
    expect(ids({ AUTH_GITHUB_ID: 'a', AUTH_GITHUB_SECRET: 'b' })).toEqual(['github']);
    expect(ids({ AUTH_GOOGLE_ID: 'a', AUTH_GOOGLE_SECRET: 'b' })).toEqual(['google']);
    expect(
      ids({
        AUTH_GITHUB_ID: 'a',
        AUTH_GITHUB_SECRET: 'b',
        AUTH_GOOGLE_ID: 'c',
        AUTH_GOOGLE_SECRET: 'd',
      }),
    ).toEqual(['google', 'github']);
  });

  it('keeps the verified-email userinfo override on GitHub', () => {
    const [p] = buildProviders({ AUTH_GITHUB_ID: 'a', AUTH_GITHUB_SECRET: 'b' });
    const github = (typeof p === 'function' ? p({}) : p) as unknown as {
      userinfo?: { request?: unknown };
    };
    expect(typeof github.userinfo?.request).toBe('function');
  });
});

describe('ProviderButtons', () => {
  const noop = vi.fn();
  const render = (providers: { google: boolean; github: boolean }) =>
    renderToStaticMarkup(<ProviderButtons providers={providers} google={noop} github={noop} />);

  it('shows only the configured providers', () => {
    const both = render({ google: true, github: true });
    expect(both).toContain('Continue with Google');
    expect(both).toContain('Continue with GitHub');
    const gh = render({ google: false, github: true });
    expect(gh).toContain('Continue with GitHub');
    expect(gh).not.toContain('Continue with Google');
    const go = render({ google: true, github: false });
    expect(go).toContain('Continue with Google');
    expect(go).not.toContain('Continue with GitHub');
  });

  it('explains when nothing is configured', () => {
    const none = render({ google: false, github: false });
    expect(none).toContain('Sign-in isn&#x27;t configured yet');
    expect(none).toContain('docs/DEPLOY.md');
    expect(none).not.toContain('Continue with');
  });
});
