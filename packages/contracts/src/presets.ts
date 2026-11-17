import type { BoardFilter } from './filters';

export interface BuiltInPreset {
  id: string;
  name: string;
  /** Merged over DEFAULT_BOARD_FILTER when applied. */
  filter: Partial<BoardFilter>;
}

/** Built-in board presets (spec §6a). User presets live in `filter_presets`. */
export const BUILT_IN_PRESETS: BuiltInPreset[] = [
  { id: 'l10-locks', name: 'L10 Locks', filter: { window: 'l10', minHitRate: 80, minGames: 8 } },
  { id: 'soft-matchups', name: 'Soft Matchups', filter: { dvpTiers: ['worst'], minHitRate: 60 } },
  {
    id: 'teammate-out',
    name: 'Teammate Out Boost',
    filter: { teammateOutOnly: true, minHitRate: 60 },
  },
  { id: 'plus-money', name: 'Plus-money Value', filter: { oddsMin: 100, minHitRate: 60 } },
];
