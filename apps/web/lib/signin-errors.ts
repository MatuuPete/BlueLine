// Messages for Auth.js's ?error=<code> on /signin. The code is user input: look it up as an
// own property only, so "__proto__" or "constructor" fall through to the generic message.

const ERRORS: Readonly<Record<string, string>> = {
  AccessDenied: "This email isn't on the BlueLine allowlist.",
};
const GENERIC_ERROR = 'Sign-in failed. Please try again.';

export function signInErrorMessage(raw: string | string[] | undefined): string | null {
  const code = Array.isArray(raw) ? raw[0] : raw;
  if (!code) return null;
  return Object.hasOwn(ERRORS, code) ? ERRORS[code]! : GENERIC_ERROR;
}
