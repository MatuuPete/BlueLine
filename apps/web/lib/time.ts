// Display helpers. Slate dates are YYYY-MM-DD on the NBA's Eastern calendar (a slate is
// "Thursday's games" no matter where you watch from), but clock times and instants print in
// the viewer's zone, Philippine time. None of these throw: bad input comes back unchanged
// (dates) or as '' (timestamps).
import { isCalendarDate } from '@blueline/contracts';

const TZ = 'Asia/Manila';
/** Suffix printed after clock times. */
export const TZ_LABEL = 'PHT';

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

/** "8:30 AM PHT". */
export function tipTime(iso: string): string {
  const d = validInstant(iso);
  return d ? `${tipFmt.format(d)} ${TZ_LABEL}` : '';
}

/** "8:30 AM": tipTime without the zone suffix. */
export function tipTimeBare(iso: string): string {
  const d = validInstant(iso);
  return d ? tipFmt.format(d) : '';
}

const clockFmt = new Intl.DateTimeFormat('en-US', {
  timeZone: TZ,
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
});

/** "8:30" (Philippine time, no AM/PM): the intro's mono slate line. */
export function tipClock(iso: string): string {
  const d = validInstant(iso);
  if (!d) return '';
  return clockFmt
    .formatToParts(d)
    .filter((p) => p.type === 'hour' || p.type === 'minute' || p.type === 'literal')
    .map((p) => p.value)
    .join('')
    .trim();
}

const dayFmt = new Intl.DateTimeFormat('en-US', { timeZone: TZ, month: 'short', day: 'numeric' });

/** "Nov 19": the Philippine calendar day of an instant. */
export function dayOf(iso: string): string {
  const d = validInstant(iso);
  return d ? dayFmt.format(d) : '';
}

/** "Nov 19 9:30 AM": Philippine day and time of an instant (no zone suffix). */
export function dateTime(iso: string): string {
  const d = validInstant(iso);
  return d ? `${dayFmt.format(d)} ${tipFmt.format(d)}` : '';
}

/** A YYYY-MM-DD date at noon UTC, so formatting in UTC never shifts the day. */
function ymdToDate(ymd: string): Date | null {
  return validYmd(ymd) ? new Date(`${ymd}T12:00:00Z`) : null;
}

const shortFmt = new Intl.DateTimeFormat('en-US', {
  timeZone: 'UTC',
  month: 'short',
  day: 'numeric',
});
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
