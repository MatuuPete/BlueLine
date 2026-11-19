// Auth.js v5 configuration shared by the route handlers (auth.ts) and the proxy (proxy.ts).
// No database access here: the proxy only needs to verify and refresh the JWT.
import type { NextAuthConfig } from 'next-auth';
import type { Provider } from 'next-auth/providers';
import GitHub from 'next-auth/providers/github';
import Google from 'next-auth/providers/google';
import { configuredProviders } from './lib/auth-providers';
import { isEmailAllowed, normalizeEmail, pickGithubEmail, userIdForEmail } from './lib/auth-rules';

const GITHUB_API = 'https://api.github.com';

type GithubProfile = Record<string, unknown>;

async function githubJson(path: string, accessToken: string | undefined): Promise<unknown> {
  const res = await fetch(`${GITHUB_API}${path}`, {
    headers: {
      Authorization: `Bearer ${accessToken ?? ''}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'blueline-auth',
    },
  });
  if (!res.ok) throw new Error(`GitHub ${path} answered ${res.status}`);
  return res.json();
}

/**
 * The OAuth providers whose AUTH_*_ID and AUTH_*_SECRET are both set. Google and GitHub read
 * their credentials from the environment; GitHub keeps the verified-email hardening.
 */
export function buildProviders(env: Record<string, string | undefined> = process.env): Provider[] {
  const on = configuredProviders(env);
  const providers: Provider[] = [];
  if (on.google) providers.push(Google);
  if (on.github) {
    providers.push(
      GitHub({
        // The stock provider takes the public profile email, or the first address when there is
        // no primary one, without checking it is verified. The allowlist keys on the email, so
        // only ever use a verified address.
        userinfo: {
          url: `${GITHUB_API}/user`,
          async request({ tokens }: { tokens: { access_token?: string } }) {
            const profile = (await githubJson('/user', tokens.access_token)) as GithubProfile;
            const emails = await githubJson('/user/emails', tokens.access_token);
            return { ...profile, email: pickGithubEmail(emails) };
          },
        },
      }),
    );
  }
  return providers;
}

export const authConfig = {
  providers: buildProviders(),
  session: { strategy: 'jwt', maxAge: 7 * 24 * 60 * 60 },
  pages: { signIn: '/signin', error: '/signin' },
  callbacks: {
    /** Carries the BlueLine user id; drops the session once the email leaves ALLOWED_EMAILS. */
    jwt({ token, user }) {
      if (user?.email) {
        token.email = normalizeEmail(user.email);
        token.uid = userIdForEmail(user.email);
      }
      const email = typeof token.email === 'string' ? token.email : null;
      if (!email || !isEmailAllowed(email, process.env.ALLOWED_EMAILS)) return null;
      if (typeof token.uid !== 'string') token.uid = userIdForEmail(email);
      return token;
    },
    session({ session, token }) {
      if (typeof token.uid === 'string') session.user.id = token.uid;
      return session;
    },
  },
} satisfies NextAuthConfig;
