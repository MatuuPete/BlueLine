import type { BoardFilter } from '@blueline/contracts';
import { filterFromParams } from './board-filter-url';

export type SearchParamsRecord = Record<string, string | string[] | undefined>;

export function toSearchParams(record: SearchParamsRecord): URLSearchParams {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(record)) {
    if (v === undefined) continue;
    for (const s of Array.isArray(v) ? v : [v]) params.append(k, s);
  }
  return params;
}

/** R11 for server pages: unknown keys stripped, invalid input → DEFAULT_BOARD_FILTER. */
export function filterFromRecord(record: SearchParamsRecord): BoardFilter {
  return filterFromParams(toSearchParams(record));
}
