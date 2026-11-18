// Internal ids. Readable, stable, and free of ':' (propKey joins ids with ':').

/** Team id: the lowercase ESPN abbreviation ('BOS' → 'bos'). */
export const teamIdOf = (abbr: string): string => abbr.toLowerCase();

/** Player id from the ESPN athlete id ('4065648' → 'p4065648'). */
export const playerIdOf = (espnId: string): string => `p${espnId}`;

/** Game id from the ESPN event id ('401910002' → 'g401910002'). */
export const gameIdOf = (espnId: string): string => `g${espnId}`;

const YMD = /^\d{4}-\d{2}-\d{2}$/;

/** Validate a YYYY-MM-DD option. */
export function parseYmd(value: unknown, flag = '--date'): string {
  if (typeof value !== 'string' || !YMD.test(value) || Number.isNaN(Date.parse(value))) {
    throw new Error(`${flag} must be YYYY-MM-DD (got ${String(value)})`);
  }
  return value;
}

/** Validate a positive integer option. */
export function parsePositiveInt(value: unknown, flag: string): number {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1 || n > 400) {
    throw new Error(`${flag} must be an integer between 1 and 400 (got ${String(value)})`);
  }
  return n;
}
