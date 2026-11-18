// Display helpers. Slate dates are YYYY-MM-DD in America/New_York; times print in ET.
const TZ = 'America/New_York';

const tipFmt = new Intl.DateTimeFormat('en-US', {
  timeZone: TZ,
  hour: 'numeric',
  minute: '2-digit',
});

/** "7:30 PM ET". */
export function tipTimeET(iso: string): string {
  return `${tipFmt.format(new Date(iso))} ET`;
}

/** A YYYY-MM-DD date at noon UTC, so formatting in UTC never shifts the day. */
function ymdToDate(ymd: string): Date {
  return new Date(`${ymd}T12:00:00Z`);
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
  return shortFmt.format(ymdToDate(ymd));
}

/** "Wednesday, November 18". */
export function slateLabel(ymd: string): string {
  return longFmt.format(ymdToDate(ymd));
}

/** YYYY-MM-DD ± days. */
export function addDaysYmd(ymd: string, days: number): string {
  const d = ymdToDate(ymd);
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

const clockFmt = new Intl.DateTimeFormat('en-US', {
  timeZone: TZ,
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
});

/** "7:30" (Eastern, no AM/PM): the intro's mono slate line. */
export function tipClockET(iso: string): string {
  return clockFmt
    .formatToParts(new Date(iso))
    .filter((p) => p.type === 'hour' || p.type === 'minute' || p.type === 'literal')
    .map((p) => p.value)
    .join('')
    .trim();
}
