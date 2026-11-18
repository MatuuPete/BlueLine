// Pure sign-in rules (spec §8): the email allowlist and the stable user id.
import { createHash } from 'node:crypto';

/** OAuth providers BlueLine accepts. */
export const PROVIDERS = ['google', 'github'] as const;
export type ProviderName = (typeof PROVIDERS)[number];

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** `ALLOWED_EMAILS` as a set: comma list, trimmed, case-insensitive, blanks dropped. */
export function parseAllowlist(raw: string | undefined): Set<string> {
  return new Set(
    (raw ?? '')
      .split(',')
      .map(normalizeEmail)
      .filter((e) => e.length > 0),
  );
}

/** True only for an email on the list. An empty or missing list allows nobody. */
export function isEmailAllowed(email: string | null | undefined, raw: string | undefined): boolean {
  if (!email) return false;
  const e = normalizeEmail(email);
  return e.length > 0 && parseAllowlist(raw).has(e);
}

/**
 * The users.id for an email: `u_` + the first 24 hex chars of sha256(lowercased email).
 * Derived from the email, not the provider account, so the same person signing in with
 * Google or GitHub is one user.
 */
export function userIdForEmail(email: string): string {
  return `u_${createHash('sha256').update(normalizeEmail(email)).digest('hex').slice(0, 24)}`;
}

export interface SignInAttempt {
  provider: string;
  email: string | null | undefined;
  /** The provider's raw profile (Google: OIDC claims). */
  profile?: Record<string, unknown> | null;
}

/**
 * Allowlisted email, from a known provider, that the provider says is verified.
 * Google: the `email_verified` claim must be true. GitHub: the provider is configured
 * (see auth.config.ts) to only ever return a verified address.
 */
export function canSignIn(attempt: SignInAttempt, allowlistRaw: string | undefined): boolean {
  if (!(PROVIDERS as readonly string[]).includes(attempt.provider)) return false;
  if (attempt.provider === 'google' && attempt.profile?.email_verified !== true) return false;
  return isEmailAllowed(attempt.email, allowlistRaw);
}

interface GithubEmail {
  email: string;
  primary: boolean;
  verified: boolean;
}

/** From GitHub's GET /user/emails: the verified primary address, else any verified one. */
export function pickGithubEmail(emails: unknown): string | null {
  if (!Array.isArray(emails)) return null;
  const verified = emails.filter(
    (e): e is GithubEmail =>
      typeof e === 'object' && e !== null && typeof e.email === 'string' && e.verified === true,
  );
  return (verified.find((e) => e.primary) ?? verified[0])?.email ?? null;
}
