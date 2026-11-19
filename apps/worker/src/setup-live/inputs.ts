// Collecting and validating the setup:live inputs: flags > SETUP_* env > legacy env names >
// values from a previous run's files > interactive prompt.
import { normalizeEmailList, type OAuthPair } from './envfiles';
import { deriveDirectUrl, derivePooledUrl, isPooledHost, normalizePostgresUrl } from './urls';

export interface RawInputs {
  ownerUrl?: string;
  pooledUrl?: string;
  sgoApiKey?: string;
  allowedEmails?: string;
  githubId?: string;
  githubSecret?: string;
  googleId?: string;
  googleSecret?: string;
}

export interface SetupInputs {
  /** Owner URL on the direct (non-pooled) host. */
  directUrl: string;
  /** The same owner credentials; the secret `DATABASE_URL_OWNER` (direct host). */
  ownerUrl: string;
  /** Pooled host (as the owner; credentials are swapped later). */
  pooledUrl: string;
  sgoApiKey: string;
  allowedEmails: string;
  github?: OAuthPair;
  google?: OAuthPair;
  notes: string[];
}

export type Ask = (question: string, opts?: { secret?: boolean; hint?: string }) => Promise<string>;

const FLAG_ENV: Record<keyof RawInputs, string[]> = {
  ownerUrl: ['SETUP_OWNER_URL'],
  pooledUrl: ['SETUP_POOLED_URL'],
  sgoApiKey: ['SETUP_SGO_API_KEY', 'SGO_API_KEY'],
  allowedEmails: ['SETUP_ALLOWED_EMAILS', 'ALLOWED_EMAILS'],
  githubId: ['SETUP_GITHUB_ID', 'AUTH_GITHUB_ID'],
  githubSecret: ['SETUP_GITHUB_SECRET', 'AUTH_GITHUB_SECRET'],
  googleId: ['SETUP_GOOGLE_ID', 'AUTH_GOOGLE_ID'],
  googleSecret: ['SETUP_GOOGLE_SECRET', 'AUTH_GOOGLE_SECRET'],
};

/** Values from the environment (SETUP_* first, then the app's own variable names). */
export function inputsFromEnv(env: NodeJS.ProcessEnv): RawInputs {
  const out: RawInputs = {};
  for (const [key, names] of Object.entries(FLAG_ENV) as [keyof RawInputs, string[]][]) {
    for (const n of names) {
      const v = env[n]?.trim();
      if (v) {
        out[key] = v;
        break;
      }
    }
  }
  return out;
}

/** Values recoverable from a previous run's deploy/ files. */
export function inputsFromExisting(
  vercel: Record<string, string>,
  github: Record<string, string>,
): RawInputs {
  const clean = (v: string | undefined) => (v && v.length > 0 ? v : undefined);
  return {
    ownerUrl: clean(github.DATABASE_URL_OWNER),
    sgoApiKey: clean(github.SGO_API_KEY),
    allowedEmails: clean(vercel.ALLOWED_EMAILS),
    githubId: clean(vercel.AUTH_GITHUB_ID),
    githubSecret: clean(vercel.AUTH_GITHUB_SECRET),
    googleId: clean(vercel.AUTH_GOOGLE_ID),
    googleSecret: clean(vercel.AUTH_GOOGLE_SECRET),
  };
}

/** Earlier sources win; only defined values count. */
export function mergeInputs(...layers: RawInputs[]): RawInputs {
  const out: RawInputs = {};
  for (const layer of layers) {
    for (const [k, v] of Object.entries(layer) as [keyof RawInputs, string | undefined][]) {
      if (out[k] === undefined && v !== undefined && v !== '') out[k] = v;
    }
  }
  return out;
}

function validateEmails(raw: string): string {
  const list = normalizeEmailList(raw);
  if (!list) throw new Error('ALLOWED_EMAILS needs at least one email address');
  for (const e of list.split(',')) {
    if (!/^[^\s@,]+@[^\s@,]+\.[^\s@,]+$/.test(e)) throw new Error(`"${e}" is not an email address`);
  }
  return list;
}

function pair(label: string, id?: string, secret?: string): OAuthPair | undefined {
  if (!id && !secret) return undefined;
  if (!id || !secret)
    throw new Error(`${label}: give both the client ID and the client secret, or neither`);
  return { id, secret };
}

/**
 * Fill the gaps by prompting (when `ask` is given), then validate. Without `ask`
 * (non-interactive) a missing required input is an error naming the variable to set.
 */
export async function resolveInputs(raw: RawInputs, ask?: Ask): Promise<SetupInputs> {
  const r = { ...raw };
  if (ask) {
    r.ownerUrl ??= await ask('Neon OWNER connection string (direct, not pooled)', { secret: true });
    r.pooledUrl ??=
      (await ask('Neon pooled connection string (Enter = derive it)', { secret: true })) ||
      undefined;
    r.sgoApiKey ??= await ask('SportsGameOdds API key', { secret: true });
    r.allowedEmails ??= await ask('ALLOWED_EMAILS (comma list of who may sign in)');
    if (!r.githubId && !r.githubSecret) {
      r.githubId = (await ask('GitHub OAuth client ID (Enter = add later)')) || undefined;
      if (r.githubId) r.githubSecret ??= await ask('GitHub OAuth client secret', { secret: true });
    }
    if (!r.googleId && !r.googleSecret) {
      r.googleId = (await ask('Google OAuth client ID (Enter = add later)')) || undefined;
      if (r.googleId) r.googleSecret ??= await ask('Google OAuth client secret', { secret: true });
    }
  }
  const missing: string[] = [];
  if (!r.ownerUrl) missing.push('SETUP_OWNER_URL (--owner-url)');
  if (!r.sgoApiKey) missing.push('SETUP_SGO_API_KEY (--sgo-key)');
  if (!r.allowedEmails) missing.push('SETUP_ALLOWED_EMAILS (--allowed-emails)');
  if (missing.length) throw new Error(`Missing required input: ${missing.join(', ')}`);

  const notes: string[] = [];
  let ownerUrl = normalizePostgresUrl(r.ownerUrl!, 'Owner connection string');
  if (isPooledHost(ownerUrl)) {
    ownerUrl = deriveDirectUrl(ownerUrl);
    notes.push(
      'The owner connection string used the pooled host; using the direct host for migrations and backups.',
    );
  }
  let pooledUrl: string;
  if (r.pooledUrl) {
    pooledUrl = normalizePostgresUrl(r.pooledUrl, 'Pooled connection string');
    if (!isPooledHost(pooledUrl)) {
      notes.push('The pooled connection string host does not end in -pooler; using it as given.');
    }
  } else {
    pooledUrl = derivePooledUrl(ownerUrl);
    if (pooledUrl === ownerUrl) {
      notes.push(
        'Could not derive a pooled host (the host is not an ep-… Neon host); the web app will use the direct host.',
      );
    }
  }
  const sgoApiKey = r.sgoApiKey!.trim();
  if (/\s/.test(sgoApiKey)) throw new Error('SGO API key must not contain whitespace');
  return {
    directUrl: ownerUrl,
    ownerUrl,
    pooledUrl,
    sgoApiKey,
    allowedEmails: validateEmails(r.allowedEmails!),
    github: pair('GitHub OAuth', r.githubId, r.githubSecret),
    google: pair('Google OAuth', r.googleId, r.googleSecret),
    notes,
  };
}
