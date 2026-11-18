'use client';

import { serializeBoardFilter, type BoardFilter } from '@blueline/contracts';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useMemo } from 'react';
import { applyFilterChange, filterFromParams } from './board-filter-url';

/**
 * The board filter, synced with the URL query string.
 * Reads useSearchParams (unknown keys stripped, invalid input -> DEFAULT_BOARD_FILTER, R11);
 * writes with router.replace and no scroll jump.
 */
export function useBoardFilter(): readonly [BoardFilter, (next: BoardFilter) => void] {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const filter = useMemo(
    () => filterFromParams(new URLSearchParams(searchParams.toString())),
    [searchParams],
  );

  const setFilter = useCallback(
    (next: BoardFilter) => {
      const qs = serializeBoardFilter(applyFilterChange(filter, next));
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [filter, pathname, router],
  );

  return [filter, setFilter] as const;
}
