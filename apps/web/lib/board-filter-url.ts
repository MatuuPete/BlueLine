// Pure helpers behind use-board-filter (kept free of React/Next so they unit-test in node).
import {
  BoardFilterSchema,
  DEFAULT_BOARD_FILTER,
  parseBoardFilter,
  type BoardFilter,
} from '@blueline/contracts';

const KNOWN_KEYS = new Set<string>(Object.keys(BoardFilterSchema.shape));

/** R11: remove query keys that are not board filter fields (utm_*, tab, etc.). */
export function stripUnknownKeys(params: URLSearchParams): URLSearchParams {
  const out = new URLSearchParams();
  params.forEach((value, key) => {
    if (KNOWN_KEYS.has(key)) out.append(key, value);
  });
  return out;
}

/** Parse the URL into a filter. Invalid input falls back to the default; never throws. */
export function filterFromParams(params: URLSearchParams): BoardFilter {
  try {
    return parseBoardFilter(stripUnknownKeys(params));
  } catch {
    return DEFAULT_BOARD_FILTER;
  }
}

/** Changing any filter other than `page` sends the user back to page 1. */
export function applyFilterChange(prev: BoardFilter, next: BoardFilter): BoardFilter {
  if (next.page !== prev.page) return next;
  const changed = (Object.keys(next) as (keyof BoardFilter)[]).some(
    (k) => k !== 'page' && JSON.stringify(next[k]) !== JSON.stringify(prev[k]),
  );
  return changed && next.page !== 1 ? { ...next, page: 1 } : next;
}

/** Fields that are view state rather than filters; they never count as "active". */
const NOT_FILTERS = new Set<string>(['sort', 'dir', 'page', 'date']);

/** Number of non-default filter fields (the badge on the phone "Filters" button). */
export function activeFilterCount(f: BoardFilter): number {
  let n = 0;
  for (const key of KNOWN_KEYS) {
    if (NOT_FILTERS.has(key)) continue;
    const k = key as keyof BoardFilter;
    if (JSON.stringify(f[k] ?? null) !== JSON.stringify(DEFAULT_BOARD_FILTER[k] ?? null)) n += 1;
  }
  return n;
}
