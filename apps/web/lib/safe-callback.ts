// Post-sign-in redirect targets come from the query string (?callbackUrl=), so they are
// attacker-controlled. Only same-origin paths survive; everything else becomes "/".

const BASE = 'http://x';
/**
 * Control characters, spaces and DEL (browsers strip tabs/newlines, turning "/<TAB>/evil.com"
 * into "//evil.com"), and backslashes (browsers treat a backslash like "/").
 */
const UNSAFE_CHARS = /[\x00-\x20\x7f\\]/;
/** Exactly one leading slash: "//host" and "/\host" are protocol-relative to a browser. */
const SINGLE_SLASH_PATH = /^\/(?![/\\])/;

/** A same-origin path (with query and hash) to redirect to, or "/". */
export function safeCallback(raw: string | string[] | undefined | null): string {
  const v = Array.isArray(raw) ? raw[0] : raw;
  if (!v || !SINGLE_SLASH_PATH.test(v) || UNSAFE_CHARS.test(v)) return '/';
  let u: URL;
  try {
    u = new URL(v, BASE);
  } catch {
    return '/';
  }
  if (u.origin !== BASE) return '/';
  const p = u.pathname;
  // Dot segments are resolved by the parser, so "/.//evil.com" or "/a/%2e%2e//evil.com"
  // keep the base origin yet normalize to the path "//evil.com". Check the FINAL path.
  if (!SINGLE_SLASH_PATH.test(p)) return '/';
  // Never bounce back to the sign-in page (loop) or into a JSON endpoint.
  if (p === '/signin' || p.startsWith('/signin/') || p === '/api' || p.startsWith('/api/')) {
    return '/';
  }
  const out = `${p}${u.search}${u.hash}`;
  // Belt and braces: the exact string that becomes the Location header must pass too.
  if (!SINGLE_SLASH_PATH.test(out) || UNSAFE_CHARS.test(out)) return '/';
  return out;
}
