import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';

const SIZES = [
  { name: '1440', width: 1440, height: 900 },
  { name: '390', width: 390, height: 844 },
] as const;
const THEMES = ['light', 'dark'] as const;

async function scan(page: Page) {
  // Dev mode can reload once after first compile; scan only once the page is quiet.
  await page.waitForLoadState('networkidle');
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  return results.violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => ({
      id: v.id,
      impact: v.impact,
      nodes: v.nodes.slice(0, 5).map((n) => ({ target: n.target, summary: n.failureSummary })),
    }));
}

for (const size of SIZES) {
  for (const theme of THEMES) {
    test.describe(`axe ${size.name}px ${theme}`, () => {
      test.use({ viewport: { width: size.width, height: size.height }, colorScheme: theme });

      test.beforeEach(async ({ context, baseURL }) => {
        await context.addCookies([{ name: 'theme', value: theme, url: baseURL! }]);
      });

      test('board', async ({ page }) => {
        await page.goto('/');
        await expect(page.getByRole('heading', { name: 'Prop board', level: 1 })).toBeVisible();
        await expect(page.getByRole('link', { name: /.+/ }).nth(8)).toBeVisible();
        expect(await scan(page)).toEqual([]);
      });

      test('detail', async ({ page }) => {
        await page.goto('/');
        // Phone shows cards; desktop shows the table. Take the first visible prop link.
        const link = page.locator('a[href^="/props/"]:visible').first();
        await expect(link).toBeVisible();
        await page.goto((await link.getAttribute('href'))!);
        await expect(page.getByRole('region', { name: /^Hit rates/ })).toBeVisible();
        expect(await scan(page)).toEqual([]);
      });

      test('welcome', async ({ page }) => {
        await page.goto('/welcome');
        await expect(page.getByRole('link', { name: /Enter the board/ })).toBeVisible();
        await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
        // Let the finite intro animations finish (infinite ones never settle).
        await page.evaluate(() =>
          Promise.all(
            document
              .getAnimations()
              .filter((a) => a.effect?.getComputedTiming().iterations !== Infinity)
              .map((a) => a.finished.catch(() => undefined)),
          ),
        );
        expect(await scan(page)).toEqual([]);
      });
    });
  }
}
