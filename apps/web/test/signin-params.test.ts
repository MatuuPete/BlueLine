import { describe, expect, it } from 'vitest';
import { safeCallback } from '../lib/safe-callback';
import { signInErrorMessage } from '../lib/signin-errors';

/** The value the page receives: Next decodes searchParams like URLSearchParams does. */
const received = (encoded: string) =>
  new URLSearchParams(`callbackUrl=${encoded}`).get('callbackUrl')!;

describe('safeCallback', () => {
  it.each([
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
  ])('%s -> /', (input) => {
    expect(safeCallback(received(input))).toBe('/');
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

  it.each([
    ['/board?x=1', '/board?x=1'],
    ['/props/p1/PTS#a', '/props/p1/PTS#a'],
    ['/slips', '/slips'],
    ['/signinx', '/signinx'],
    ['/a/../b', '/b'],
  ])('%s is kept as %s', (input, out) => {
    expect(safeCallback(input)).toBe(out);
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
