import { BOOKS, type Book } from '@blueline/contracts';

/** Map a vendor's bookmaker key to our Book enum; unknown books → null (dropped). */
export function mapBook(key: string, aliases: Readonly<Record<string, Book>> = {}): Book | null {
  const k = key.toLowerCase();
  const alias = aliases[k];
  if (alias) return alias;
  return (BOOKS as readonly string[]).includes(k) ? (k as Book) : null;
}

/** Parse American odds ("+130", "-110", 105); invalid or |x| outside 100..10000 → null. */
export function parseAmerican(v: unknown): number | null {
  const n = typeof v === 'number' ? v : parseInt(String(v ?? ''), 10);
  if (!Number.isFinite(n) || Math.abs(n) < 100 || Math.abs(n) > 10000) return null;
  return Math.round(n);
}

export function parseLine(v: unknown): number | null {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? ''));
  return Number.isFinite(n) ? n : null;
}
