// Date helpers. Slate dates are YYYY-MM-DD in America/New_York.

const DAY_MS = 86_400_000;

const nyFormat = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/New_York',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** The America/New_York calendar date of an instant, as YYYY-MM-DD. */
export function nyDate(at: Date | string): string {
  return nyFormat.format(typeof at === 'string' ? new Date(at) : at);
}

/** `ymd` plus `days` calendar days. */
export function addDays(ymd: string, days: number): string {
  return new Date(Date.parse(`${ymd}T12:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

/** Whole calendar days from `from` to `to` (negative when `to` is earlier). */
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / DAY_MS);
}

/** An ISO instant shifted by whole days, normalized to `YYYY-MM-DDTHH:mm:ss.sssZ`. */
export function shiftInstant(iso: string, days: number): string {
  return new Date(Date.parse(iso) + days * DAY_MS).toISOString();
}

/** 'YYYYMMDD' for ESPN's `dates=` parameter. */
export function compactYmd(ymd: string): string {
  return ymd.replaceAll('-', '');
}
