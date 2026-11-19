import { describe, expect, it } from 'vitest';
import {
  normalizeEmailList,
  parseEnvText,
  renderGithubSecrets,
  renderVercelEnv,
  resolveSecrets,
  type DeployValues,
} from '../src/setup-live/envfiles';
import {
  inputsFromEnv,
  inputsFromExisting,
  mergeInputs,
  resolveInputs,
} from '../src/setup-live/inputs';
import { loginRoleSql, quoteIdent, quoteLiteral, randomPassword } from '../src/setup-live/sql';
import {
  deriveDirectUrl,
  derivePooledUrl,
  normalizePostgresUrl,
  parsePostgresUrl,
  redactUrl,
  withCredentials,
} from '../src/setup-live/urls';

const OWNER =
  'postgresql://neondb_owner:npg_secret@ep-cool-sky-123456.us-east-2.aws.neon.tech/neondb?sslmode=require&channel_binding=require';

describe('urls', () => {
  it('derives the pooled host by appending -pooler to the ep- label, keeping params', () => {
    const pooled = derivePooledUrl(OWNER);
    const u = new URL(pooled);
    expect(u.hostname).toBe('ep-cool-sky-123456-pooler.us-east-2.aws.neon.tech');
    expect(u.searchParams.get('sslmode')).toBe('require');
    expect(u.searchParams.get('channel_binding')).toBe('require');
    expect(u.username).toBe('neondb_owner');
    expect(derivePooledUrl(pooled)).toBe(pooled);
    expect(deriveDirectUrl(pooled)).toBe(new URL(OWNER).toString());
  });

  it('leaves non-Neon hosts alone', () => {
    const url = 'postgresql://u:p@db.example.com/x?sslmode=require';
    expect(derivePooledUrl(url)).toBe(url);
  });

  it('validates scheme, credentials, database and TLS', () => {
    expect(() => parsePostgresUrl('mysql://u:p@h/db')).toThrow(/postgresql/);
    expect(() => parsePostgresUrl('not a url')).toThrow(/valid URL/);
    expect(() => parsePostgresUrl('postgresql://h/db')).toThrow(/user and password/);
    expect(() => parsePostgresUrl('postgresql://u:p@h')).toThrow(/database/);
    expect(() => normalizePostgresUrl('postgresql://u:p@h/db?sslmode=disable')).toThrow(/sslmode/);
    expect(normalizePostgresUrl('postgresql://u:p@h/db')).toContain('sslmode=require');
    expect(normalizePostgresUrl(OWNER)).toContain('sslmode=require');
  });

  it('swaps credentials, keeps host and params, and redacts passwords', () => {
    const out = withCredentials(OWNER, 'blueline_web', 'abc_DEF-123');
    const u = new URL(out);
    expect(u.username).toBe('blueline_web');
    expect(u.password).toBe('abc_DEF-123');
    expect(u.hostname).toBe('ep-cool-sky-123456.us-east-2.aws.neon.tech');
    expect(u.pathname).toBe('/neondb');
    expect(u.searchParams.get('sslmode')).toBe('require');
    expect(redactUrl(out)).not.toContain('abc_DEF-123');
  });
});

describe('sql quoting', () => {
  it('quotes identifiers', () => {
    expect(quoteIdent('blueline_web')).toBe('"blueline_web"');
    expect(quoteIdent('we"ird')).toBe('"we""ird"');
    expect(() => quoteIdent('')).toThrow();
    expect(() => quoteIdent('a\0b')).toThrow();
  });

  it('quotes literals, doubling quotes and using E-strings for backslashes', () => {
    expect(quoteLiteral("it's")).toBe("'it''s'");
    expect(quoteLiteral('a\\b')).toBe("E'a\\\\b'");
    expect(quoteLiteral("a\\'b")).toBe("E'a\\\\''b'");
    expect(() => quoteLiteral('a\0')).toThrow();
  });

  it('generates long url-safe passwords', () => {
    const a = randomPassword();
    expect(a.length).toBeGreaterThanOrEqual(32);
    expect(a).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(randomPassword()).not.toBe(a);
  });

  it('builds CREATE or ALTER statements', () => {
    const spec = { name: 'blueline_web', group: 'web_role' };
    expect(loginRoleSql(spec, 'pw', false)).toBe(
      `CREATE ROLE "blueline_web" LOGIN PASSWORD 'pw' IN ROLE "web_role";`,
    );
    expect(loginRoleSql(spec, 'pw', true)).toBe(
      `ALTER ROLE "blueline_web" WITH LOGIN PASSWORD 'pw';\nGRANT "web_role" TO "blueline_web";`,
    );
  });
});

const values: DeployValues = {
  webUrl: 'postgresql://blueline_web:w@ep-a-pooler.x/db?sslmode=require',
  workerUrl: 'postgresql://blueline_worker:k@ep-a.x/db?sslmode=require',
  ownerUrl: 'postgresql://owner:o@ep-a.x/db?sslmode=require',
  directUrl: 'postgresql://owner:o@ep-a.x/db?sslmode=require',
  sgoApiKey: 'sgo-key',
  allowedEmails: 'a@x.com,b@y.com',
};
const secrets = { authSecret: 'AUTH', backupPassphrase: 'BACKUP' };

describe('env files', () => {
  it('renders vercel.env with commented OAuth placeholders when not given', () => {
    const text = renderVercelEnv(values, secrets);
    const parsed = parseEnvText(text);
    expect(parsed).toMatchObject({
      DATABASE_URL: values.webUrl,
      AUTH_SECRET: 'AUTH',
      ALLOWED_EMAILS: 'a@x.com,b@y.com',
      ODDS_PROVIDER: 'sgo',
      ODDS_MONTHLY_BUDGET: '2500',
      ENABLE_EXPERIMENTAL_COREPACK: '1',
    });
    expect(parsed.AUTH_GITHUB_ID).toBeUndefined();
    expect(text).toContain('# AUTH_GITHUB_ID=');
    expect(text).toContain('# AUTH_GOOGLE_SECRET=');
  });

  it('renders OAuth values uncommented when given', () => {
    const text = renderVercelEnv(
      { ...values, github: { id: 'gid', secret: 'gs' }, google: { id: 'oid', secret: 'os' } },
      secrets,
    );
    expect(parseEnvText(text)).toMatchObject({
      AUTH_GITHUB_ID: 'gid',
      AUTH_GITHUB_SECRET: 'gs',
      AUTH_GOOGLE_ID: 'oid',
      AUTH_GOOGLE_SECRET: 'os',
    });
  });

  it('renders every secret the workflows read', () => {
    expect(parseEnvText(renderGithubSecrets(values, secrets))).toEqual({
      DATABASE_URL: values.workerUrl,
      DATABASE_URL_OWNER: values.ownerUrl,
      DATABASE_URL_DIRECT: values.directUrl,
      ODDS_PROVIDER: 'sgo',
      SGO_API_KEY: 'sgo-key',
      ODDS_MONTHLY_BUDGET: '2500',
      BACKUP_PASSPHRASE: 'BACKUP',
    });
  });

  it('reuses secrets from a previous run unless --rotate', () => {
    const make = { authSecret: () => 'NEW-AUTH', backupPassphrase: () => 'NEW-BACKUP' };
    const oldV = { AUTH_SECRET: 'OLD-AUTH' };
    const oldG = { BACKUP_PASSPHRASE: 'OLD-BACKUP' };
    expect(resolveSecrets(oldV, oldG, false, make)).toMatchObject({
      authSecret: 'OLD-AUTH',
      backupPassphrase: 'OLD-BACKUP',
      reused: { authSecret: true, backupPassphrase: true },
    });
    expect(resolveSecrets(oldV, oldG, true, make)).toMatchObject({
      authSecret: 'NEW-AUTH',
      backupPassphrase: 'NEW-BACKUP',
      reused: { authSecret: false, backupPassphrase: false },
    });
    expect(resolveSecrets({}, {}, false, make).authSecret).toBe('NEW-AUTH');
  });

  it('normalises the email list', () => {
    expect(normalizeEmailList(' A@X.com, ,b@y.com ')).toBe('a@x.com,b@y.com');
  });
});

describe('inputs', () => {
  it('reads SETUP_* env first, then the app names, and merges with earlier layers winning', () => {
    const env = inputsFromEnv({
      SETUP_OWNER_URL: OWNER,
      SGO_API_KEY: 'k1',
      SETUP_SGO_API_KEY: 'k2',
      AUTH_GITHUB_ID: 'gid',
    });
    expect(env).toMatchObject({ ownerUrl: OWNER, sgoApiKey: 'k2', githubId: 'gid' });
    const existing = inputsFromExisting(
      { ALLOWED_EMAILS: 'a@x.com', AUTH_GITHUB_ID: 'old' },
      { SGO_API_KEY: 'older' },
    );
    expect(mergeInputs(env, existing)).toMatchObject({
      sgoApiKey: 'k2',
      githubId: 'gid',
      allowedEmails: 'a@x.com',
    });
  });

  it('validates and derives (non-interactive)', async () => {
    const r = await resolveInputs({
      ownerUrl: OWNER,
      sgoApiKey: 'k',
      allowedEmails: 'A@x.com, b@y.com',
      githubId: 'i',
      githubSecret: 's',
    });
    expect(new URL(r.pooledUrl).hostname).toContain('-pooler');
    expect(r.allowedEmails).toBe('a@x.com,b@y.com');
    expect(r.github).toEqual({ id: 'i', secret: 's' });
    expect(r.google).toBeUndefined();
  });

  it('turns a pooled owner URL into the direct host', async () => {
    const r = await resolveInputs({
      ownerUrl: derivePooledUrl(OWNER),
      sgoApiKey: 'k',
      allowedEmails: 'a@x.com',
    });
    expect(new URL(r.directUrl).hostname).toBe('ep-cool-sky-123456.us-east-2.aws.neon.tech');
    expect(r.notes.length).toBeGreaterThan(0);
  });

  it('rejects missing, half-given and malformed inputs', async () => {
    await expect(resolveInputs({})).rejects.toThrow(/SETUP_OWNER_URL/);
    await expect(
      resolveInputs({ ownerUrl: OWNER, sgoApiKey: 'k', allowedEmails: 'nope' }),
    ).rejects.toThrow(/not an email/);
    await expect(
      resolveInputs({ ownerUrl: OWNER, sgoApiKey: 'k', allowedEmails: 'a@x.com', googleId: 'g' }),
    ).rejects.toThrow(/both/);
  });

  it('prompts for what is missing when interactive', async () => {
    const answers: Record<string, string> = {
      'Neon OWNER': OWNER,
      'Neon pooled': '',
      SportsGameOdds: 'k',
      ALLOWED_EMAILS: 'a@x.com',
      'GitHub OAuth client ID': '',
      'Google OAuth client ID': '',
    };
    const ask = async (q: string) => answers[Object.keys(answers).find((k) => q.startsWith(k))!]!;
    const r = await resolveInputs({}, ask);
    expect(r.sgoApiKey).toBe('k');
    expect(r.github).toBeUndefined();
  });
});
