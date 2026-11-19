import { z } from 'zod';
import {
  americanToDecimal,
  BET_RESULTS,
  BET_TYPES,
  cashoutError,
  MAX_PAYOUT,
  MAX_STAKE,
  ODDS_MAX,
  ODDS_MIN,
  round2,
  type BetResult,
  type BetStats,
  type BetType,
} from './bet-rules';
import { AmericanOddsSchema } from './enums';
import { isCalendarDate } from './filters';

export const BetResultSchema = z.enum(BET_RESULTS);
export const BetTypeSchema = z.enum(BET_TYPES);

export const BOOK_SUGGESTIONS = [
  'Stake',
  'DraftKings',
  'FanDuel',
  'BetMGM',
  'Caesars',
  'ESPN BET',
  'bet365',
  'Other',
] as const;
export const CURRENCIES = ['PHP', 'USD', 'EUR', 'GBP', 'AUD', 'CAD'] as const;

const ymd = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD')
  .refine(isCalendarDate, 'Not a real calendar date');

/** Optional text: trimmed, empty becomes null. */
const optText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .transform((s) => (s === null || s === '' ? null : s));

const odds = z.union([
  z.strictObject({ decimal: z.number().min(ODDS_MIN).max(ODDS_MAX) }),
  z.strictObject({ american: AmericanOddsSchema }),
]);

const currency = z
  .string()
  .trim()
  .transform((s) => s.toUpperCase())
  .pipe(z.string().regex(/^[A-Z]{3}$/, 'Use a 3-letter currency code'));

const shape = {
  placedOn: ymd,
  book: z.string().trim().min(1).max(40),
  sport: z.string().trim().min(1).max(40),
  event: optText(120),
  description: z.string().trim().min(1).max(160),
  betType: BetTypeSchema,
  legs: z.number().int().min(1).max(20),
  odds,
  stake: z.number().positive().max(MAX_STAKE),
  currency,
  result: BetResultSchema,
  /** Only read for cash-out; the server recomputes payout for every other result. */
  payout: z.number().min(0).max(MAX_PAYOUT).nullable(),
  notes: optText(500),
};

type OddsIn = z.infer<typeof odds>;
function toDecimal(o: OddsIn): number {
  return 'decimal' in o ? Math.round(o.decimal * 1000) / 1000 : americanToDecimal(o.american);
}

/** The decimal price must stay inside 1.01-1000 whichever way it was typed. */
function oddsInRange(d: number, ctx: z.RefinementCtx) {
  if (d < ODDS_MIN || d > ODDS_MAX)
    ctx.addIssue({
      code: 'custom',
      path: ['odds'],
      message: `Odds must be between ${ODDS_MIN} and ${ODDS_MAX}`,
    });
}

export const BetInputSchema = z
  .strictObject({
    ...shape,
    sport: shape.sport.default('NBA'),
    event: shape.event.default(null),
    betType: shape.betType.default('single'),
    legs: shape.legs.default(1),
    currency: shape.currency.default('PHP'),
    result: shape.result.default('pending'),
    payout: shape.payout.default(null),
    notes: shape.notes.default(null),
  })
  .transform(({ odds: o, ...rest }, ctx) => {
    const oddsDecimal = toDecimal(o);
    oddsInRange(oddsDecimal, ctx);
    const stake = round2(rest.stake);
    if (rest.result === 'cashout') {
      const msg = cashoutError(stake, oddsDecimal, rest.payout);
      if (msg) ctx.addIssue({ code: 'custom', path: ['payout'], message: msg });
    }
    return { ...rest, stake, oddsDecimal };
  });
/** Parsed bet input: `odds` has become `oddsDecimal`. */
export type BetInput = z.infer<typeof BetInputSchema>;

export const BetUpdateSchema = z
  .strictObject(shape)
  .partial()
  .refine((p) => Object.keys(p).length > 0, 'Send at least one field')
  .transform(({ odds: o, stake, ...rest }, ctx) => {
    const out: typeof rest & { stake?: number; oddsDecimal?: number } = { ...rest };
    if (stake !== undefined) out.stake = round2(stake);
    if (o) {
      out.oddsDecimal = toDecimal(o);
      oddsInRange(out.oddsDecimal, ctx);
    }
    return out;
  });
export type BetUpdate = z.infer<typeof BetUpdateSchema>;

export const BetFilterSchema = z.strictObject({
  from: ymd.optional(),
  to: ymd.optional(),
  book: z.string().trim().min(1).max(40).optional(),
  result: BetResultSchema.optional(),
  currency: z
    .string()
    .regex(/^[A-Z]{3}$/)
    .optional(),
});
export type BetFilter = z.infer<typeof BetFilterSchema>;

export interface BetDTO {
  id: string;
  placedOn: string;
  book: string;
  sport: string;
  event: string | null;
  description: string;
  betType: BetType;
  legs: number;
  oddsDecimal: number;
  stake: number;
  currency: string;
  result: BetResult;
  payout: number | null;
  /** payout - stake; null while pending. */
  profit: number | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface BetSummaryDTO extends BetStats {
  /** The currency these numbers are in. */
  currency: string;
  /** Every currency the user has bets in (before the currency filter), most used first. */
  currencies: { currency: string; bets: number }[];
}
