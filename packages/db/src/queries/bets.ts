import {
  cashoutError,
  computePayout,
  primaryCurrency,
  profit,
  summarizeBets,
  type BetDTO,
  type BetFilter,
  type BetInput,
  type BetResult,
  type BetSummaryDTO,
  type BetUpdate,
} from '@blueline/contracts';
import {
  and,
  asc,
  bets,
  desc,
  eq,
  gte,
  lte,
  sql,
  type Db,
  type InferSelectModel,
  type SQL,
} from '../index';

// Every function takes the owner's userId and filters by it. A row owned by someone
// else is indistinguishable from a missing row (callers answer 404, never 403).

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A merged bet that breaks a rule (e.g. cash-out above stake x odds). Routes answer 400. */
export class BetValidationError extends Error {
  constructor(public readonly fields: Record<string, string[]>) {
    super('invalid bet');
    this.name = 'BetValidationError';
  }
}

type BetRow = InferSelectModel<typeof bets>;

function toDTO(r: BetRow): BetDTO {
  const stake = Number(r.stake);
  const payout = r.payout === null ? null : Number(r.payout);
  return {
    id: r.id,
    placedOn: r.placedOn,
    book: r.book,
    sport: r.sport,
    event: r.event,
    description: r.description,
    betType: r.betType,
    legs: r.legs,
    oddsDecimal: Number(r.oddsDecimal),
    stake,
    currency: r.currency,
    result: r.result,
    payout,
    profit: profit({ stake, result: r.result, payout }),
    notes: r.notes,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

function conditions(userId: string, f: BetFilter, withCurrency: boolean): SQL {
  const c: SQL[] = [eq(bets.userId, userId)];
  if (f.from) c.push(gte(bets.placedOn, f.from));
  if (f.to) c.push(lte(bets.placedOn, f.to));
  if (f.book) c.push(sql`lower(${bets.book}) = lower(${f.book})`);
  if (f.result) c.push(eq(bets.result, f.result));
  if (withCurrency && f.currency) c.push(eq(bets.currency, f.currency));
  return and(...c)!;
}

const NEWEST_FIRST = [desc(bets.placedOn), desc(bets.createdAt), asc(bets.id)] as const;

/** Resolve payout for a result; throws BetValidationError for an unusable cash-out. */
function resolvePayout(
  result: BetResult,
  stake: number,
  oddsDecimal: number,
  cashout: number | null | undefined,
): number | null {
  if (result === 'cashout') {
    const msg = cashoutError(stake, oddsDecimal, cashout);
    if (msg) throw new BetValidationError({ payout: [msg] });
  }
  return computePayout({ result, stake, oddsDecimal, cashout });
}

const money = (n: number | null) => (n === null ? null : n.toFixed(2));

export async function listBets(db: Db, userId: string, filter: BetFilter = {}): Promise<BetDTO[]> {
  const rows = await db
    .select()
    .from(bets)
    .where(conditions(userId, filter, true))
    .orderBy(...NEWEST_FIRST);
  return rows.map(toDTO);
}

export async function getBet(db: Db, userId: string, id: string): Promise<BetDTO | null> {
  if (!UUID.test(id)) return null;
  const [r] = await db
    .select()
    .from(bets)
    .where(and(eq(bets.id, id), eq(bets.userId, userId)));
  return r ? toDTO(r) : null;
}

/** The server recomputes payout; only a cash-out amount is taken from the client. */
export async function createBet(db: Db, userId: string, input: BetInput): Promise<BetDTO> {
  const payout = resolvePayout(input.result, input.stake, input.oddsDecimal, input.payout);
  const [r] = await db
    .insert(bets)
    .values({
      userId,
      placedOn: input.placedOn,
      book: input.book,
      sport: input.sport,
      event: input.event,
      description: input.description,
      betType: input.betType,
      legs: input.legs,
      oddsDecimal: input.oddsDecimal.toFixed(3),
      stake: input.stake.toFixed(2),
      currency: input.currency,
      result: input.result,
      payout: money(payout),
      notes: input.notes,
    })
    .returning();
  return toDTO(r!);
}

/** Returns null when the bet does not exist or belongs to someone else. */
export async function updateBet(
  db: Db,
  userId: string,
  id: string,
  patch: BetUpdate,
): Promise<BetDTO | null> {
  const cur = await getBet(db, userId, id);
  if (!cur) return null;
  const stake = patch.stake ?? cur.stake;
  const oddsDecimal = patch.oddsDecimal ?? cur.oddsDecimal;
  const result = patch.result ?? cur.result;
  // A cash-out amount comes from the patch, or from the stored one if still a cash-out.
  const cashout =
    patch.payout !== undefined ? patch.payout : cur.result === 'cashout' ? cur.payout : null;
  const payout = resolvePayout(result, stake, oddsDecimal, cashout);
  const [r] = await db
    .update(bets)
    .set({
      ...(patch.placedOn !== undefined && { placedOn: patch.placedOn }),
      ...(patch.book !== undefined && { book: patch.book }),
      ...(patch.sport !== undefined && { sport: patch.sport }),
      ...(patch.event !== undefined && { event: patch.event }),
      ...(patch.description !== undefined && { description: patch.description }),
      ...(patch.betType !== undefined && { betType: patch.betType }),
      ...(patch.legs !== undefined && { legs: patch.legs }),
      ...(patch.currency !== undefined && { currency: patch.currency }),
      ...(patch.notes !== undefined && { notes: patch.notes }),
      oddsDecimal: oddsDecimal.toFixed(3),
      stake: stake.toFixed(2),
      result,
      payout: money(payout),
      updatedAt: new Date(),
    })
    .where(and(eq(bets.id, id), eq(bets.userId, userId)))
    .returning();
  return r ? toDTO(r) : null;
}

/** Returns false when the bet does not exist or belongs to someone else. */
export async function deleteBet(db: Db, userId: string, id: string): Promise<boolean> {
  if (!UUID.test(id)) return false;
  const rows = await db
    .delete(bets)
    .where(and(eq(bets.id, id), eq(bets.userId, userId)))
    .returning({ id: bets.id });
  return rows.length > 0;
}

/**
 * Summary for ONE currency: `filter.currency`, else the user's most-used. `currencies` lists
 * every currency in the date/book/result window so the UI can offer a switcher.
 */
export async function betSummary(
  db: Db,
  userId: string,
  filter: BetFilter = {},
): Promise<BetSummaryDTO> {
  const rows = (
    await db
      .select()
      .from(bets)
      .where(conditions(userId, filter, false))
      .orderBy(...NEWEST_FIRST)
  ).map(toDTO);
  const counts = new Map<string, number>();
  for (const r of rows) counts.set(r.currency, (counts.get(r.currency) ?? 0) + 1);
  const currencies = [...counts]
    .map(([currency, n]) => ({ currency, bets: n }))
    .sort((a, b) => b.bets - a.bets || a.currency.localeCompare(b.currency));
  const currency = filter.currency ?? primaryCurrency(currencies);
  const stats = summarizeBets(rows.filter((r) => r.currency === currency));
  return { ...stats, currency, currencies };
}
