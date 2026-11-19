// Bet tracker rules: odds conversion, payout, profit, summaries and money formatting.
// Pure and browser-safe (no I/O, no Node APIs). Used by the db queries, API routes and UI.

export const BET_RESULTS = ['pending', 'win', 'loss', 'push', 'void', 'cashout'] as const;
export type BetResult = (typeof BET_RESULTS)[number];

export const BET_TYPES = ['single', 'parlay'] as const;
export type BetType = (typeof BET_TYPES)[number];

export const ODDS_MIN = 1.01;
export const ODDS_MAX = 1000;
/** Largest stake (so stake x ODDS_MAX stays inside the payout column). */
export const MAX_STAKE = 10_000_000;
/** payout is numeric(13,2). */
export const MAX_PAYOUT = 99_999_999_999.99;

/** Typographic minus, used for every negative number we print. */
const MINUS = '−';

/** Round to cents. Half-cents round away from zero. */
export function round2(x: number): number {
  return Math.round(x * 100 + (x >= 0 ? 1e-9 : -1e-9)) / 100;
}

/** American to decimal odds, three places: +150 gives 2.5, -120 gives 1.833. */
export function americanToDecimal(american: number): number {
  const d = american > 0 ? 1 + american / 100 : 1 + 100 / Math.abs(american);
  return Math.round(d * 1000) / 1000;
}

/** Decimal to American odds (integer): 2.5 gives +150, 1.833 gives -120. */
export function decimalToAmerican(decimal: number): number {
  return decimal >= 2 ? Math.round((decimal - 1) * 100) : Math.round(-100 / (decimal - 1));
}

/** "+150" / "−120" for a decimal price. */
export function formatAmericanFromDecimal(decimal: number): string {
  const a = decimalToAmerican(decimal);
  return a > 0 ? `+${a}` : `${MINUS}${Math.abs(a)}`;
}

/** Stake x decimal odds in cents-exact arithmetic. */
export function winPayout(stake: number, oddsDecimal: number): number {
  const scaled = Math.round(stake * 100) * Math.round(oddsDecimal * 1000);
  return Math.round(scaled / 1000) / 100;
}

export interface PayoutInput {
  result: BetResult;
  stake: number;
  oddsDecimal: number;
  /** The user-entered cash-out amount; read only when result is 'cashout'. */
  cashout?: number | null;
}

/**
 * Payout by result: win = stake x odds, push/void = stake, loss = 0, cashout = the entered
 * amount (null when missing), pending = null. Any other client-sent payout is ignored.
 */
export function computePayout(i: PayoutInput): number | null {
  switch (i.result) {
    case 'win':
      return winPayout(i.stake, i.oddsDecimal);
    case 'push':
    case 'void':
      return round2(i.stake);
    case 'loss':
      return 0;
    case 'cashout':
      return i.cashout === null || i.cashout === undefined ? null : round2(i.cashout);
    case 'pending':
      return null;
  }
}

/** Error text for an unusable cash-out amount, or null when valid (0 <= cashout <= stake x odds). */
export function cashoutError(stake: number, oddsDecimal: number, cashout: unknown): string | null {
  if (typeof cashout !== 'number' || !Number.isFinite(cashout))
    return 'Enter the cash-out amount you received';
  if (cashout < 0) return 'Cash-out cannot be negative';
  if (cashout > MAX_PAYOUT) return 'Cash-out is too large';
  if (cashout > winPayout(stake, oddsDecimal)) return 'Cash-out cannot be more than stake × odds';
  return null;
}

export interface BetLike {
  id?: string;
  placedOn: string;
  createdAt: string;
  book: string;
  oddsDecimal: number;
  stake: number;
  result: BetResult;
  payout: number | null;
  currency?: string;
}

/** payout - stake for a settled bet; null while pending (or if a settled bet has no payout). */
export function profit(b: Pick<BetLike, 'stake' | 'result' | 'payout'>): number | null {
  if (b.result === 'pending' || b.payout === null) return null;
  return round2(b.payout - b.stake);
}

export type Outcome = 'win' | 'loss' | 'push' | 'void' | 'pending';

/** Cash-out is a win when it returns more than the stake, a loss when less, a push when equal. */
export function outcome(b: Pick<BetLike, 'stake' | 'result' | 'payout'>): Outcome {
  if (b.result === 'cashout') {
    const p = profit(b);
    if (p === null) return 'pending';
    return p > 0 ? 'win' : p < 0 ? 'loss' : 'push';
  }
  return b.result === 'win' || b.result === 'loss' || b.result === 'push' || b.result === 'void'
    ? b.result
    : 'pending';
}

export interface GroupStats {
  key: string;
  /** Settled bets (everything but pending); these are the only ones in staked/net/roi. */
  settled: number;
  /** Bets still open: counted here but never in staked, PnL or ROI. */
  pending: number;
  staked: number;
  net: number;
  roi: number | null;
}

export interface SeriesPoint {
  id: string | null;
  date: string;
  pnl: number;
  cumulative: number;
}

export interface Extreme {
  id: string | null;
  amount: number;
}

export interface BetStats {
  /** Bets with a result (everything but pending). */
  settled: number;
  pending: number;
  wins: number;
  losses: number;
  pushes: number;
  voids: number;
  staked: number;
  returned: number;
  net: number;
  /** net / staked, or null when nothing was staked. */
  roi: number | null;
  /** wins / (wins + losses), or null with no decisions. Push and void are excluded. */
  winRate: number | null;
  /** Mean decimal odds over settled bets (void excluded). */
  avgOdds: number | null;
  biggestWin: Extreme | null;
  biggestLoss: Extreme | null;
  /** Latest run of wins or losses; pushes and voids are skipped. */
  streak: { type: 'win' | 'loss'; count: number } | null;
  series: SeriesPoint[];
  byBook: GroupStats[];
  byMonth: GroupStats[];
}

function chrono(a: BetLike, b: BetLike): number {
  if (a.placedOn !== b.placedOn) return a.placedOn < b.placedOn ? -1 : 1;
  if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? -1 : 1;
  return 0;
}

function group(
  rows: { key: string; staked: number; net: number }[],
  open: { key: string }[],
): GroupStats[] {
  const m = new Map<string, GroupStats>();
  const slot = (key: string) => {
    const g = m.get(key) ?? { key, settled: 0, pending: 0, staked: 0, net: 0, roi: null };
    m.set(key, g);
    return g;
  };
  for (const r of open) slot(r.key).pending += 1;
  for (const r of rows) {
    const g = slot(r.key);
    g.settled += 1;
    g.staked = round2(g.staked + r.staked);
    g.net = round2(g.net + r.net);
  }
  return [...m.values()].map((g) => ({ ...g, roi: g.staked > 0 ? g.net / g.staked : null }));
}

/**
 * Summary of ONE currency's bets. Never mix currencies: use summarizeByCurrency for a mixed
 * list. Pending bets are excluded from PnL, staked and returned.
 */
export function summarizeBets(bets: readonly BetLike[]): BetStats {
  const sorted = [...bets].sort(chrono);
  let wins = 0;
  let losses = 0;
  let pushes = 0;
  let voids = 0;
  let pending = 0;
  let staked = 0;
  let returned = 0;
  let oddsSum = 0;
  let oddsN = 0;
  let biggestWin: Extreme | null = null;
  let biggestLoss: Extreme | null = null;
  const series: SeriesPoint[] = [];
  const rows: { book: string; month: string; staked: number; net: number }[] = [];
  const open: { book: string; month: string }[] = [];
  const decided: Array<'win' | 'loss'> = [];
  let cumulative = 0;

  for (const b of sorted) {
    const o = outcome(b);
    const p = profit(b);
    if (o === 'pending' || p === null) {
      pending += 1;
      open.push({ book: b.book, month: b.placedOn.slice(0, 7) });
      continue;
    }
    // Void bets stay in the counts but are not money at risk: no staked/returned, so ROI ignores them.
    const atRisk = o === 'void' ? 0 : b.stake;
    staked = round2(staked + atRisk);
    returned = round2(returned + (o === 'void' ? 0 : (b.payout ?? 0)));
    cumulative = round2(cumulative + p);
    series.push({ id: b.id ?? null, date: b.placedOn, pnl: p, cumulative });
    rows.push({ book: b.book, month: b.placedOn.slice(0, 7), staked: atRisk, net: p });
    if (o === 'win') wins += 1;
    else if (o === 'loss') losses += 1;
    else if (o === 'push') pushes += 1;
    else voids += 1;
    if (o === 'win' || o === 'loss') decided.push(o);
    if (o !== 'void') {
      oddsSum += b.oddsDecimal;
      oddsN += 1;
    }
    if (p > 0 && (!biggestWin || p > biggestWin.amount))
      biggestWin = { id: b.id ?? null, amount: p };
    if (p < 0 && (!biggestLoss || p < biggestLoss.amount))
      biggestLoss = { id: b.id ?? null, amount: p };
  }

  let streak: BetStats['streak'] = null;
  const last = decided[decided.length - 1];
  if (last) {
    let count = 0;
    for (let i = decided.length - 1; i >= 0 && decided[i] === last; i--) count += 1;
    streak = { type: last, count };
  }

  const net = round2(returned - staked);
  const byBook = group(
    rows.map((r) => ({ key: r.book, staked: r.staked, net: r.net })),
    open.map((r) => ({ key: r.book })),
  );
  const byMonth = group(
    rows.map((r) => ({ key: r.month, staked: r.staked, net: r.net })),
    open.map((r) => ({ key: r.month })),
  );
  return {
    settled: rows.length,
    pending,
    wins,
    losses,
    pushes,
    voids,
    staked,
    returned,
    net,
    roi: staked > 0 ? net / staked : null,
    winRate: wins + losses > 0 ? wins / (wins + losses) : null,
    avgOdds: oddsN > 0 ? oddsSum / oddsN : null,
    biggestWin,
    biggestLoss,
    streak,
    series,
    byBook: byBook.sort((a, b) => b.net - a.net || a.key.localeCompare(b.key)),
    byMonth: byMonth.sort((a, b) => a.key.localeCompare(b.key)),
  };
}

/** One summary per currency (currencies are never added together). */
export function summarizeByCurrency(bets: readonly BetLike[]): Record<string, BetStats> {
  const by = new Map<string, BetLike[]>();
  for (const b of bets) {
    const c = b.currency ?? 'PHP';
    by.set(c, [...(by.get(c) ?? []), b]);
  }
  return Object.fromEntries([...by].map(([c, list]) => [c, summarizeBets(list)]));
}

/** Most-used currency (ties: PHP first, then alphabetical); PHP when there are no bets. */
export function primaryCurrency(counts: ReadonlyArray<{ currency: string; bets: number }>): string {
  const sorted = [...counts].sort(
    (a, b) =>
      b.bets - a.bets ||
      (a.currency === 'PHP' ? -1 : b.currency === 'PHP' ? 1 : a.currency.localeCompare(b.currency)),
  );
  return sorted[0]?.currency ?? 'PHP';
}

// --- money formatting ------------------------------------------------------

const fmtCache = new Map<string, Intl.NumberFormat>();
function nf(currency: string): Intl.NumberFormat {
  let f = fmtCache.get(currency);
  if (!f) {
    f = new Intl.NumberFormat(currency === 'PHP' ? 'en-PH' : 'en-US', {
      style: 'currency',
      currency,
    });
    fmtCache.set(currency, f);
  }
  return f;
}

/** "₱657.00"; negatives use the typographic minus: "−₱12.50". */
export function formatMoney(amount: number, currency = 'PHP'): string {
  const s = nf(currency).format(Math.abs(amount));
  return amount < 0 && round2(amount) !== 0 ? `${MINUS}${s}` : s;
}

/** "+₱292.00" / "−₱292.00" / "₱0.00": the sign is always part of the text. */
export function formatSignedMoney(amount: number, currency = 'PHP'): string {
  const r = round2(amount);
  if (r === 0) return nf(currency).format(0);
  return `${r > 0 ? '+' : MINUS}${nf(currency).format(Math.abs(r))}`;
}

export function formatPercent(x: number | null, digits = 1): string {
  if (x === null) return '—';
  const v = Math.abs(x * 100).toFixed(digits);
  return x < 0 && Number(v) !== 0 ? `${MINUS}${v}%` : `${v}%`;
}

export function formatSignedPercent(x: number | null, digits = 1): string {
  if (x === null) return '—';
  const v = Math.abs(x * 100).toFixed(digits);
  return Number(v) === 0 ? `${v}%` : `${x > 0 ? '+' : MINUS}${v}%`;
}

/** 1.833 gives "1.83". */
export function formatDecimalOdds(d: number): string {
  return d.toFixed(2);
}
