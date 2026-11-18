import { describe, expect, it } from 'vitest';
import { safeCallback } from '../lib/safe-callback';
import { signInErrorMessage } from '../lib/signin-errors';

/** The value the page receives: Next decodes searchParams like URLSearchParams does. */
const received = (encoded: string) =>
  new URLSearchParams(`callbackUrl=${encoded}`).get('callbackUrl')!;

/** Query-string values (percent-encoded) that must all fall back to "/". */
const REJECTED_ENCODED = [
  '/%09/evil.com',
  '/%09%5Cevil.com',
  '/%0a/evil.com',
  '/%0d/evil.com',
  '/%20/evil.com',
  '//evil.com',
  '/%5Cevil.com',
  '%2F%2Fevil.com',
  'https://evil.com',
  'https:evil.com',
  'javascript:alert(1)',
  'evil.com',
  '/signin',
  '/signin?callbackUrl=/x',
  '/signin/',
  '/api/x',
  '/api',
  '',
];

/**
 * Raw strings (as safeCallback sees them) whose dot segments normalize to a protocol-relative
 * path: new URL() keeps the base origin but the pathname becomes "//evil.com".
 */
const REJECTED_RAW = [
  '/.//evil.com',
  '/..//evil.com',
  '/a/..//evil.com',
  '/%2e%2e//evil.com',
  '/.%2e//evil.com',
  '/a/%2e%2e//evil.com',
  '/.///evil.com',
  '/%2E%2E//evil.com',
  '/a/b/../..//evil.com',
  '/./\\evil.com',
  '/\\/evil.com',
];

const KEPT: [string, string][] = [
  ['/board?x=1', '/board?x=1'],
  ['/props/p1/PTS#a', '/props/p1/PTS#a'],
  ['/slips', '/slips'],
  ['/signinx', '/signinx'],
  ['/a/../b', '/b'],
  ['/./board', '/board'],
];

describe('safeCallback', () => {
  it.each(REJECTED_ENCODED)('%s -> /', (input) => {
    expect(safeCallback(received(input))).toBe('/');
  });

  it.each(REJECTED_RAW)('dot-segment bypass %s -> /', (input) => {
    expect(safeCallback(input)).toBe('/');
  });

  it.each(REJECTED_RAW)('dot-segment bypass %s, as a decoded query value -> /', (input) => {
    expect(safeCallback(received(encodeURIComponent(input)))).toBe('/');
  });

  it('rejects raw backslashes and control characters', () => {
    expect(safeCallback('/\\evil.com')).toBe('/');
    expect(safeCallback('/\t/evil.com')).toBe('/');
    expect(safeCallback('/\u0000x')).toBe('/');
  });

  it('missing or repeated values', () => {
    expect(safeCallback(undefined)).toBe('/');
    expect(safeCallback(['/board', '//evil.com'])).toBe('/board');
  });

  it.each(KEPT)('%s is kept as %s', (input, out) => {
    expect(safeCallback(input)).toBe(out);
  });

  it('property: every output is a same-origin path with exactly one leading slash', () => {
    const inputs = [
      ...REJECTED_ENCODED.map(received),
      ...REJECTED_RAW,
      ...REJECTED_RAW.map((r) => received(encodeURIComponent(r))),
      ...KEPT.map(([i]) => i),
    ];
    for (const input of inputs) {
      const out = safeCallback(input);
      expect(new URL(out, 'https://app.test').origin, input).toBe('https://app.test');
      expect(out.startsWith('//'), input).toBe(false);
      expect(out, input).toMatch(/^\/(?![/\\])/);
      expect(out, input).not.toMatch(/[\x00-\x20\x7f\\]/);
    }
  });
});

describe('signInErrorMessage', () => {
  it('AccessDenied names the allowlist', () => {
    expect(signInErrorMessage('AccessDenied')).toBe("This email isn't on the BlueLine allowlist.");
  });

  it('anything else is the generic message, including prototype keys', () => {
    for (const code of [
      'Configuration',
      '__proto__',
      'constructor',
      'toString',
      'hasOwnProperty',
    ]) {
      expect(signInErrorMessage(code)).toBe('Sign-in failed. Please try again.');
    }
  });

  it('no error, no message', () => {
    expect(signInErrorMessage(undefined)).toBeNull();
    expect(signInErrorMessage('')).toBeNull();
    expect(signInErrorMessage(['AccessDenied', 'x'])).toBe(
      "This email isn't on the BlueLine allowlist.",
    );
  });
});
