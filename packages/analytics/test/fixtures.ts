import type { LogLine } from '../src/stats';

let seq = 0;

/** Build a played line; pass overrides for anything else. */
export function line(over: Partial<LogLine> = {}): LogLine {
  seq++;
  return {
    gameId: `g${seq}`,
    date: '2026-11-01',
    season: 2026,
    oppTeamId: 'BOS',
    isHome: true,
    started: true,
    dnp: false,
    minutes: 30,
    pts: 0,
    reb: 0,
    ast: 0,
    fg3m: 0,
    stl: 0,
    blk: 0,
    tov: 0,
    ...over,
  };
}

export function ptsLines(vals: number[], over: Partial<LogLine> = {}): LogLine[] {
  return vals.map((pts) => line({ pts, ...over }));
}

export function dnp(over: Partial<LogLine> = {}): LogLine {
  return line({ dnp: true, minutes: 0, pts: 0, ...over });
}
