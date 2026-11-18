// Kept dependency-free: the proxy imports it, and must not pull in the database.

/** AUTH_DEV_BYPASS=1 skips sign-in with a fixed dev user, never in production. */
export function isDevBypass(): boolean {
  return process.env.AUTH_DEV_BYPASS === '1' && process.env.NODE_ENV !== 'production';
}
