/** Set by "Enter the board" on /welcome. */
export const SEEN_INTRO_COOKIE = 'seen_intro';
export const ONE_YEAR_SECONDS = 31_536_000;

/** The intro shows on a first visit, unless the user turned on "Skip the intro". */
export function shouldShowIntro(s: { seenIntro: boolean; skipIntro: boolean }): boolean {
  return !s.seenIntro && !s.skipIntro;
}
