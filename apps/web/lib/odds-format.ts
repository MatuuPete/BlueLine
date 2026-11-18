import { americanToDecimal } from '@blueline/analytics';
import { formatAmerican } from '@blueline/ui';

export type OddsFormat = 'american' | 'decimal';

/** A price in the user's chosen format (settings: American or decimal). */
export function formatOdds(price: number, format: OddsFormat): string {
  return format === 'decimal' ? americanToDecimal(price).toFixed(2) : formatAmerican(price);
}
