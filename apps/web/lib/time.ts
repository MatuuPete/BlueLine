// Display helpers. Slate dates are YYYY-MM-DD in America/New_York; times print in ET.
// None of these throw: bad input comes back unchanged (dates) or as '' (timestamps).
import { isCalendarDate } from '@blueline/contracts';

const TZ = 'America/New_York';

/** A real calendar date in YYYY-MM-DD form (rejects 2026-02-30). */
export function validYmd(ymd: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(ymd) && isCalendarDate(ymd);
}

function validInstant(iso: string): Date | null {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

const tipFmt = new Intl.DateTimeFormat('en-US', {
  timeZone: TZ,
  hour: 'numeric',
  minute: '2-digit',
});

/** "7:30 PM ET". */
export function tipTimeET(iso: string): string {
  const d = validInstant(iso);
  return d ? `${tipFmt.format(d)} ET` : '';
}

const clockFmt = new Intl.DateTimeFormat('en-US', {
  timeZone: TZ,
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
});

/** "7:30" (Eastern, no AM/PM): the intro's mono slate line. */
export function tipClockET(iso: string): string {
  const d = validInstant(iso);
  if (!d) return '';
  return clockFmt
    .formatToParts(d)
    .filter((p) => p.type === 'hour' || p.type === 'minute' || p.type === 'literal')
    .map((p) => p.value)
    .join('')
    .trim();
}

const dayEtFmt = new Intl.DateTimeFormat('en-US', { timeZone: TZ, month: 'short', day: 'numeric' });

/** "Nov 18": the Eastern calendar day of an instant. */
export function dayET(iso: string): string {
  const d = validInstant(iso);
  return d ? dayEtFmt.format(d) : '';
}

/** "Nov 18 8:30 PM": Eastern day and time of an instant (no zone suffix). */
export function dateTimeET(iso: string): string {
  const d = validInstant(iso);
  return d ? `${dayEtFmt.format(d)} ${tipFmt.format(d)}` : '';
}

/** A YYYY-MM-DD date at noon UTC, so formatting in UTC never shifts the day. */
function ymdToDate(ymd: string): Date | null {
  return validYmd(ymd) ? new Date(`${ymd}T12:00:00Z`) : null;
}

const shortFmt = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric' });
const longFmt = new Intl.DateTimeFormat('en-US', {
  timeZone: 'UTC',
  weekday: 'long',
  month: 'long',
  day: 'numeric',
});

/** "Nov 16". */
export function shortDate(ymd: string): string {
  const d = ymdToDate(ymd);
  return d ? shortFmt.format(d) : ymd;
}

/** "Wednesday, November 18". */
export function slateLabel(ymd: string): string {
  const d = ymdToDate(ymd);
  return d ? longFmt.format(d) : ymd;
}

/** YYYY-MM-DD ± days. */
export function addDaysYmd(ymd: string, days: number): string {
  const d = ymdToDate(ymd);
  if (!d) return ymd;
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

const SUFFIXES = new Set(['jr', 'jr.', 'sr', 'sr.', 'ii', 'iii', 'iv', 'v']);

/** Generated monogram (spec §7: player icons are monograms): first and last name initials. */
export function monogram(name: string): string {
  const words = name
    .trim()
    .split(/[\s-]+/)
    .filter((w) => w && !SUFFIXES.has(w.toLowerCase()));
  if (words.length === 0) return '?';
  if (words.length === 1) return words[0]!.slice(0, 2).toUpperCase();
  return (words[0]!.charAt(0) + words[words.length - 1]!.charAt(0)).toUpperCase();
}
