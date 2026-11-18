import { test as base, expect, type Page } from '@playwright/test';

/** Every test starts with a fresh browser context; this marks the intro as already seen. */
export const test = base.extend<{ seenIntro: void }>({
  seenIntro: [
    async ({ context, baseURL }, use) => {
      await context.addCookies([{ name: 'seen_intro', value: '1', url: baseURL ?? 'http://localhost:3100' }]);
      await use();
    },
    { auto: true },
  ],
});

export { expect };

export const BOARD_TABLE = 'NBA player props matching your filters';

/** The board's visible result count line, e.g. "Thu, Nov 19 · 12 games · 340 props". */
export async function boardSubtitle(page: Page): Promise<string> {
  const heading = page.getByRole('heading', { name: 'Prop board', level: 1 });
  await expect(heading).toBeVisible();
  return (await heading.locator('xpath=following-sibling::p').innerText()).trim();
}

/** href of the n-th prop detail link on the desktop board table. */
export async function propLinks(page: Page, n: number): Promise<string[]> {
  const links = page.getByRole('table', { name: BOARD_TABLE }).getByRole('link');
  await expect(links.first()).toBeVisible();
  const hrefs: string[] = [];
  for (let i = 0; i < n; i++) hrefs.push((await links.nth(i).getAttribute('href')) ?? '');
  return hrefs;
}
