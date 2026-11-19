// Pure connection-string helpers for setup:live. Nothing here prints or logs a secret.

export function parsePostgresUrl(raw: string, label = 'connection string'): URL {
  const value = raw.trim();
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(
      `${label} is not a valid URL. Expected postgresql://user:password@host/db?sslmode=require`,
    );
  }
  if (url.protocol !== 'postgresql:' && url.protocol !== 'postgres:') {
    throw new Error(`${label} must start with postgresql:// (got "${url.protocol}//")`);
  }
  if (!url.hostname) throw new Error(`${label} has no host`);
  if (!url.username || !url.password) {
    throw new Error(`${label} must include a user and password`);
  }
  if (url.pathname.length <= 1) throw new Error(`${label} must name a database (…/dbname)`);
  return url;
}

/**
 * Validate a Postgres URL and make sure TLS is required: a missing sslmode becomes
 * sslmode=require; an explicit weaker one (disable/allow/prefer) is rejected.
 */
export function normalizePostgresUrl(raw: string, label = 'connection string'): string {
  const url = parsePostgresUrl(raw, label);
  const mode = url.searchParams.get('sslmode');
  if (mode === null) {
    url.searchParams.set('sslmode', 'require');
  } else if (['disable', 'allow', 'prefer'].includes(mode)) {
    throw new Error(`${label} uses sslmode=${mode}; Neon requires sslmode=require`);
  }
  return url.toString();
}

/** Neon's pooled endpoint: the `ep-…` label of the host gets `-pooler` appended. */
export function derivePooledUrl(directUrl: string): string {
  const url = new URL(directUrl);
  const [first = '', ...rest] = url.hostname.split('.');
  if (first.startsWith('ep-') && !first.endsWith('-pooler')) {
    url.hostname = [`${first}-pooler`, ...rest].join('.');
  }
  return url.toString();
}

/** The reverse: the direct host of a (mistakenly supplied) pooled URL. */
export function deriveDirectUrl(pooledUrl: string): string {
  const url = new URL(pooledUrl);
  const [first = '', ...rest] = url.hostname.split('.');
  if (first.startsWith('ep-') && first.endsWith('-pooler')) {
    url.hostname = [first.slice(0, -'-pooler'.length), ...rest].join('.');
  }
  return url.toString();
}

export function isPooledHost(url: string): boolean {
  return new URL(url).hostname.split('.')[0]?.endsWith('-pooler') ?? false;
}

/** The same URL (host, database, query params) with different login credentials. */
export function withCredentials(url: string, user: string, password: string): string {
  const out = new URL(url);
  out.username = user;
  out.password = password;
  return out.toString();
}

/** A URL safe to print: the password is masked. */
export function redactUrl(url: string): string {
  try {
    const u = new URL(url);
    if (u.password) u.password = '***';
    return u.toString();
  } catch {
    return '<invalid url>';
  }
}
