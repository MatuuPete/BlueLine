// Bet tracker UI helpers: date presets, filter <-> URL, labels. Pure and browser-safe.
import { BetFilterSchema, type BetFilter, type BetResult } from '@blueline/contracts';
import { addDaysYmd } from './time';

export const RESULT_LABEL: Record<BetResult, string> = {
  pending: 'Pending',
  win: 'Win',
  loss: 'Loss',
  push: 'Push',
  void: 'Void',
  cashout: 'Cash-out',
};

/** The browser's local calendar date, YYYY-MM-DD (the owner bets from the Philippines, not ET). */
export function todayLocal(now: Date = new Date()): string {
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${m}-${d}`;
}

export type RangePreset = '7d' | '30d' | 'month' | 'all';

export const PRESET_LABEL: Record<RangePreset, string> = {
  '7d': '7 days',
  '30d': '30 days',
  month: 'This month',
  all: 'All time',
};

/** from/to for a preset, ending today (inclusive). */
export function presetRange(preset: RangePreset, today: string): { from?: string; to?: string } {
  switch (preset) {
    case '7d':
      return { from: addDaysYmd(today, -6), to: today };
    case '30d':
      return { from: addDaysYmd(today, -29), to: today };
    case 'month':
      return { from: `${today.slice(0, 7)}-01`, to: today };
    case 'all':
      return {};
  }
}

/** Which preset the filter's range equals, or null for a custom range. */
export function activePreset(f: Pick<BetFilter, 'from' | 'to'>, today: string): RangePreset | null {
  for (const p of ['all', '7d', '30d', 'month'] as const) {
    const r = presetRange(p, today);
    if (r.from === f.from && r.to === f.to) return p;
  }
  return null;
}

/** "?from=…&book=…" (empty string when nothing is set). Keys are stable-ordered. */
export function filterToQuery(f: BetFilter): string {
  const p = new URLSearchParams();
  for (const k of ['from', 'to', 'book', 'result', 'currency'] as const) {
    const v = f[k];
    if (v) p.set(k, v);
  }
  const s = p.toString();
  return s ? `?${s}` : '';
}

/** Parse page searchParams; anything invalid is dropped rather than failing the page. */
export function parseBetFilter(sp: Record<string, string | string[] | undefined>): BetFilter {
  const raw: Record<string, string> = {};
  for (const k of ['from', 'to', 'book', 'result', 'currency'] as const) {
    const v = Array.isArray(sp[k]) ? sp[k][0] : sp[k];
    if (typeof v === 'string' && v !== '') raw[k] = v;
  }
  const whole = BetFilterSchema.safeParse(raw);
  if (whole.success) return whole.data;
  const ok: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw)) {
    const one = BetFilterSchema.safeParse({ [k]: v });
    if (one.success) ok[k] = v;
  }
  return BetFilterSchema.parse(ok);
}

/** "Nov 18, 2026" for a YYYY-MM-DD date; with `currentYear`, that year is left off ("Nov 18"). */
export function formatDay(ymd: string, currentYear?: string): string {
  const d = new Date(`${ymd}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return ymd;
  const sameYear = currentYear !== undefined && ymd.startsWith(`${currentYear}-`);
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC',
    month: 'short',
    day: 'numeric',
    ...(sameYear ? {} : { year: 'numeric' }),
  }).format(d);
}

export interface BetTitle {
  /** Headline: "4-leg SGM", or the whole description for a single bet. */
  title: string;
  /** One entry per leg; empty when the bet is not a multi-leg description. */
  legs: string[];
}

/**
 * Splits a parlay description into a headline and legs. Imported slips read
 * "4-leg SGM: Leg A · Leg B · …"; other parlays only split on " · ". Singles are untouched.
 */
export function parseBetTitle(description: string, betType: string, legCount: number): BetTitle {
  const imported = /^(\d+-leg[^:]*):\s*(.+)$/i.exec(description);
  if (imported) {
    const legs = imported[2]!
      .split(' · ')
      .map((l) => l.trim())
      .filter(Boolean);
    if (legs.length > 1) return { title: imported[1]!.trim(), legs };
  }
  if (betType === 'parlay') {
    const legs = description
      .split(' · ')
      .map((l) => l.trim())
      .filter(Boolean);
    if (legs.length > 1)
      return { title: `${legCount > 1 ? legCount : legs.length}-leg parlay`, legs };
  }
  return { title: description, legs: [] };
}

/** "2026-11" gives "Nov 2026". */
export function formatMonth(ym: string): string {
  const d = new Date(`${ym}-01T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return ym;
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC',
    month: 'short',
    year: 'numeric',
  }).format(d);
}

/** The known filter params of a request URL; unknown params are ignored, not rejected. */
export function filterParams(url: string): Record<string, string> {
  const sp = new URL(url).searchParams;
  const out: Record<string, string> = {};
  for (const k of ['from', 'to', 'book', 'result', 'currency'] as const) {
    const v = sp.get(k);
    if (v !== null) out[k] = v;
  }
  return out;
}
