import { ESPN_TEAMS, type EspnTeamInfo } from './espn/teams';

/**
 * Normalize a person's name for cross-provider matching: lowercase, strip
 * accents, punctuation and generational suffixes ("Jr.", "III").
 * "Wendell Carter Jr." and "WENDELL CARTER" both become "wendell carter".
 */
export function normalizeName(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[.'’`]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .filter((w) => !['jr', 'sr', 'ii', 'iii', 'iv', 'v'].includes(w))
    .join(' ');
}

/**
 * Find the ESPN team for a provider's team name or abbreviation. Matches on the
 * nickname ("Los Angeles Clippers" and "LA Clippers" both end in "clippers"),
 * the full name, or the ESPN abbreviation.
 */
export function findEspnTeam(nameOrAbbr: string): EspnTeamInfo | undefined {
  const n = normalizeName(nameOrAbbr);
  return ESPN_TEAMS.find((t) => {
    const nick = normalizeName(t.nickname);
    // Whole-word suffix: "charlotte hornets" must not match "nets".
    return (
      n === normalizeName(t.name) ||
      n === nick ||
      n.endsWith(` ${nick}`) ||
      n === t.abbr.toLowerCase()
    );
  });
}

export function espnTeamById(id: string): EspnTeamInfo | undefined {
  return ESPN_TEAMS.find((t) => t.id === id);
}
