import type { Book, DvpTier, InjuryStatus, Side, Window } from '@blueline/contracts';

/** Typographic minus, used for every negative number we print. */
export const MINUS = '−';

export function cx(...names: Array<string | false | null | undefined>): string {
  return names.filter(Boolean).join(' ');
}

/** American odds: +102, −115. */
export function formatAmerican(price: number): string {
  return price > 0 ? `+${price}` : `${MINUS}${Math.abs(price)}`;
}

/** A signed number with a typographic minus: +2.3, −1.0. */
export function formatSigned(value: number, digits = 1): string {
  return `${value >= 0 ? '+' : MINUS}${Math.abs(value).toFixed(digits)}`;
}

export function formatLine(line: number): string {
  return line.toFixed(1);
}

export function ordinal(n: number): string {
  const suffixes = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (suffixes[(v - 20) % 10] ?? suffixes[v] ?? suffixes[0]!);
}

export const TIER_LABELS: Readonly<Record<DvpTier, string>> = {
  best: 'Best',
  good: 'Good',
  bad: 'Bad',
  worst: 'Worst',
};

export const SIDE_LETTER: Readonly<Record<Side, string>> = { over: 'O', under: 'U' };

/** Compact sportsbook text badges (never logos). Full names live in BOOK_LABELS. */
export const BOOK_SHORT: Readonly<Record<Book, string>> = {
  draftkings: 'DK',
  fanduel: 'FD',
  betmgm: 'MGM',
  caesars: 'CZR',
  espnbet: 'ESPN',
  fanatics: 'FAN',
  betrivers: 'BR',
  bet365: '365',
  hardrock: 'HR',
};

/** The five windows shown as heat cells, in board order. */
export const HEAT_WINDOWS: ReadonlyArray<{ key: Window; label: string; short: string }> = [
  { key: 'l5', label: 'L5', short: 'L5' },
  { key: 'l10', label: 'L10', short: 'L10' },
  { key: 'l20', label: 'L20', short: 'L20' },
  { key: 'season', label: 'Season', short: 'SZN' },
  { key: 'h2h', label: 'H2H', short: 'H2H' },
];

/** Injury badge text and tone. Probable players get no badge. */
export function injuryBadge(
  status: InjuryStatus | null,
): { tone: 'out' | 'questionable'; text: string; title: string } | null {
  switch (status) {
    case 'out':
      return { tone: 'out', text: 'Out', title: 'Out' };
    case 'doubtful':
      return { tone: 'questionable', text: 'D', title: 'Doubtful' };
    case 'questionable':
      return { tone: 'questionable', text: 'Q', title: 'Questionable' };
    case 'day-to-day':
      return { tone: 'questionable', text: 'GTD', title: 'Day-to-day' };
    default:
      return null;
  }
}

/** "Jalen Rios" → "J. Rios". */
export function shortName(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length < 2) return name;
  return `${parts[0]!.charAt(0)}. ${parts.slice(1).join(' ')}`;
}
