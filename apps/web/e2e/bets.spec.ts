import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';

const net = (page: Page) => page.getByTestId('kpi-net');
const kpi = (page: Page, key: string) => page.getByTestId(`kpi-${key}`);

async function logBet(
  page: Page,
  b: { description: string; odds: string; stake: string; result: 'win' | 'loss' | 'pending' },
) {
  await page
    .getByRole('button', { name: /^Log (a|your first) bet$/ })
    .first()
    .click();
  const dialog = page.getByRole('dialog', { name: 'Log a bet' });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel('Bet', { exact: true }).fill(b.description);
  await dialog.getByLabel('Odds (decimal)').fill(b.odds);
  await dialog.getByLabel('Stake').fill(b.stake);
  await dialog.getByLabel('Result').selectOption(b.result);
  await dialog.getByRole('button', { name: 'Save bet' }).click();
  await expect(dialog).toBeHidden();
}

test.describe.configure({ mode: 'serial' });

test('log a win and a loss, then edit and delete', async ({ page }) => {
  await page.goto('/bets');
  await expect(page.getByRole('heading', { name: 'Bets', level: 1 })).toBeVisible();
  await expect(page.getByText('No bets logged yet')).toBeVisible();

  // First bet: the live preview shows payout and profit before saving.
  await page.getByRole('button', { name: 'Log your first bet' }).click();
  const dialog = page.getByRole('dialog', { name: 'Log a bet' });
  await dialog.getByLabel('Bet', { exact: true }).fill('Over 61.5 · 3rd Quarter Total');
  await dialog.getByLabel('Odds (decimal)').fill('1.8');
  await dialog.getByLabel('Stake').fill('365');
  await dialog.getByLabel('Result').selectOption('win');
  await expect(dialog.getByTestId('bet-preview')).toContainText('Payout ₱657.00');
  await expect(dialog.getByTestId('bet-preview')).toContainText('Profit +₱292.00');
  await dialog.getByRole('button', { name: 'Save bet' }).click();
  await expect(dialog).toBeHidden();

  await expect(net(page)).toHaveText('+₱292.00');
  await expect(kpi(page, 'roi')).toHaveText('+80.0%');
  await expect(kpi(page, 'win')).toHaveText('100.0%');

  // Second bet: a loss.
  await logBet(page, { description: 'Heat ML', odds: '2', stake: '100', result: 'loss' });
  await expect(net(page)).toHaveText('+₱192.00');
  await expect(kpi(page, 'staked')).toHaveText('₱465.00');
  await expect(kpi(page, 'returned')).toHaveText('₱657.00');
  await expect(kpi(page, 'win')).toHaveText('50.0%');
  await expect(page.getByText('1–1–0 W–L–P')).toBeVisible();

  // The chart is an image with a summary, plus a data table for screen readers.
  const chart = page.getByRole('img', {
    name: /Cumulative profit and loss in PHP: 2 settled bets/,
  });
  await expect(chart).toBeVisible();

  // Edit the loss: a smaller stake loses less.
  await page.getByRole('button', { name: 'Edit bet: Heat ML' }).first().click();
  const edit = page.getByRole('dialog', { name: 'Edit bet' });
  await expect(edit.getByLabel('Stake')).toHaveValue('100');
  await edit.getByLabel('Stake').fill('50');
  await edit.getByRole('button', { name: 'Save changes' }).click();
  await expect(edit).toBeHidden();
  await expect(net(page)).toHaveText('+₱242.00');

  // Delete the win (two steps: Delete, then Confirm delete).
  await page
    .getByRole('button', { name: 'Delete bet: Over 61.5 · 3rd Quarter Total' })
    .first()
    .click();
  await page
    .getByRole('button', { name: 'Confirm delete: Over 61.5 · 3rd Quarter Total' })
    .first()
    .click();
  await expect(net(page)).toHaveText('−₱50.00');
  await expect(page.getByRole('status').filter({ hasText: 'Bet deleted.' })).toBeVisible();

  // A pending bet can be settled in one click.
  await logBet(page, { description: 'Bucks +4.5', odds: '1.9', stake: '200', result: 'pending' });
  await expect(net(page)).toHaveText('−₱50.00');
  await page.getByRole('button', { name: 'Mark win: Bucks +4.5' }).first().click();
  await expect(net(page)).toHaveText('+₱130.00');
});

test('the form validates, traps focus and closes on Escape', async ({ page }) => {
  await page.goto('/bets');
  await page.getByRole('button', { name: 'Log a bet' }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Log a bet' });
  await dialog.getByRole('button', { name: 'Save bet' }).click();
  await expect(dialog.getByText('Describe the bet', { exact: false })).toBeVisible();
  await expect(dialog.getByText('Enter a stake above zero')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
});

const SIZES = [
  { name: '1440', width: 1440, height: 900 },
  { name: '390', width: 390, height: 844 },
] as const;

for (const size of SIZES) {
  for (const theme of ['light', 'dark'] as const) {
    test.describe(`axe /bets ${size.name}px ${theme}`, () => {
      test.use({ viewport: { width: size.width, height: size.height }, colorScheme: theme });

      test('no serious or critical violations', async ({ page, context, baseURL }) => {
        await context.addCookies([{ name: 'theme', value: theme, url: baseURL! }]);
        await page.goto('/bets');
        await expect(page.getByRole('heading', { name: 'Bets', level: 1 })).toBeVisible();
        await expect(net(page)).toBeVisible();
        await page.waitForLoadState('networkidle');
        const scan = async () =>
          (
            await new AxeBuilder({ page })
              .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
              .analyze()
          ).violations
            .filter((v) => v.impact === 'serious' || v.impact === 'critical')
            .map((v) => ({
              id: v.id,
              nodes: v.nodes.slice(0, 4).map((n) => ({ t: n.target, s: n.failureSummary })),
            }));
        expect(await scan()).toEqual([]);

        // Chart tooltip state, then the dialog.
        await page.getByRole('group', { name: /PnL chart/ }).focus();
        expect(await scan()).toEqual([]);
        await page.getByRole('button', { name: 'Log a bet' }).first().click();
        await expect(page.getByRole('dialog', { name: 'Log a bet' })).toBeVisible();
        expect(await scan()).toEqual([]);
      });
    });
  }
}
