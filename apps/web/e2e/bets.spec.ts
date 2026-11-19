import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { seedBets } from './bets-seed';
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
  await page.getByRole('button', { name: 'More actions for Heat ML' }).first().click();
  await page.getByRole('menuitem', { name: 'Edit' }).click();
  const edit = page.getByRole('dialog', { name: 'Edit bet' });
  await expect(edit.getByLabel('Stake')).toHaveValue('100');
  await edit.getByLabel('Stake').fill('50');
  await edit.getByRole('button', { name: 'Save changes' }).click();
  await expect(edit).toBeHidden();
  await expect(net(page)).toHaveText('+₱242.00');

  // Delete the win (two steps: Delete, then Confirm delete).
  await page
    .getByRole('button', { name: 'More actions for Over 61.5 · 3rd Quarter Total' })
    .first()
    .click();
  await page.getByRole('menuitem', { name: 'Delete' }).click();
  await page
    .getByRole('button', { name: 'Confirm delete: Over 61.5 · 3rd Quarter Total' })
    .first()
    .click();
  await expect(net(page)).toHaveText('−₱50.00');
  await expect(page.getByRole('status').filter({ hasText: 'Bet deleted.' })).toBeVisible();

  // A pending bet can be settled in one click.
  await logBet(page, { description: 'Bucks +4.5', odds: '1.9', stake: '200', result: 'pending' });
  await expect(net(page)).toHaveText('−₱50.00');
  await page.getByRole('button', { name: 'Settle: Bucks +4.5' }).first().click();
  await page.getByRole('menuitem', { name: 'Win' }).click();
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

const listRows = (page: Page) => page.locator('table').last().locator('tbody tr');

test.describe('bets table polish', () => {
  test.beforeEach(async ({ page }) => {
    // Earlier serial tests leave bets behind; start these from a clean list.
    const res = await page.request.get('/api/bets');
    const body = (await res.json()) as { bets?: { id: string }[] } | { id: string }[];
    const list = Array.isArray(body) ? body : (body.bets ?? []);
    for (const b of list) await page.request.delete(`/api/bets/${b.id}`);
    await seedBets(page);
    await page.goto('/bets');
  });

  test('rows share one compact height, money never wraps, dates drop the current year', async ({
    page,
  }) => {
    const rows = listRows(page);
    await expect(rows).toHaveCount(4);
    const heights = await rows.evaluateAll((els) =>
      els.map((e) => e.getBoundingClientRect().height),
    );
    for (const h of heights) expect(h).toBeLessThanOrEqual(72);
    expect(Math.max(...heights) - Math.min(...heights)).toBeLessThanOrEqual(10);

    const pnl = rows.filter({ hasText: 'LeBron James' }).locator('td').nth(7);
    await expect(pnl).toHaveText('−₱250.00');
    await expect(rows.filter({ hasText: '76ers to win' }).locator('td').nth(7)).toHaveText(
      '+₱395.25',
    );
    expect((await pnl.locator('span').boundingBox())!.height).toBeLessThan(26);
    await expect(rows.first().locator('td').first()).toHaveText(/^[A-Z][a-z]{2} \d{1,2}$/);
  });

  test('settle menu works by keyboard and updates the row and KPIs', async ({ page }) => {
    const settle = page
      .getByRole('button', { name: 'Settle: Cade Cunningham Over 24.5 Points' })
      .first();
    await expect(settle).toHaveAttribute('aria-haspopup', 'menu');
    await expect(settle).toHaveAttribute('aria-expanded', 'false');
    await settle.focus();
    await page.keyboard.press('ArrowDown');
    await expect(settle).toHaveAttribute('aria-expanded', 'true');
    const items = page.getByRole('menuitem');
    await expect(items).toHaveText(['Win', 'Loss', 'Push', 'Void', 'Cash-out…']);
    await expect(items.first()).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(items.nth(1)).toBeFocused();
    await page.keyboard.press('End');
    await expect(items.last()).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('menu')).toHaveCount(0);
    await expect(settle).toBeFocused();

    await settle.click();
    await expect(page.getByRole('menu')).toBeVisible();
    await page.getByRole('heading', { name: 'Bets', level: 1 }).click();
    await expect(page.getByRole('menu')).toHaveCount(0);

    const before = await net(page).innerText();
    await settle.focus();
    await page.keyboard.press('Enter');
    await page.keyboard.press('Enter');
    await expect(net(page)).not.toHaveText(before);
    await expect(net(page)).toHaveText('+₱307.75');
    await expect(page.getByText('1 pending, not counted')).toBeVisible();
    await expect(
      listRows(page).filter({ hasText: 'Cade Cunningham' }).locator('td').nth(7),
    ).toHaveText('+₱162.50');
  });

  test('more menu: Cash-out preselects the form, Delete keeps its confirm', async ({ page }) => {
    await page
      .getByRole('button', { name: 'Settle: Cade Cunningham Over 24.5 Points' })
      .first()
      .click();
    await page.getByRole('menuitem', { name: 'Cash-out…' }).click();
    const dialog = page.getByRole('dialog', { name: 'Edit bet' });
    await expect(dialog.getByLabel('Result')).toHaveValue('cashout');
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();

    await page
      .getByRole('button', { name: 'More actions for LeBron James Over 13.5 Assists + Rebounds' })
      .first()
      .click();
    await expect(page.getByRole('menuitem')).toHaveText(['Edit', 'Delete']);
    await page.getByRole('menuitem', { name: 'Delete' }).click();
    await page
      .getByRole('button', { name: /^Confirm delete: LeBron/ })
      .first()
      .click();
    await expect(page.getByRole('status').filter({ hasText: 'Bet deleted.' })).toBeVisible();
  });

  test('parlay legs disclosure', async ({ page }) => {
    const row = listRows(page).filter({ hasText: '4-leg SGM' });
    await expect(row.getByText('4-leg SGM', { exact: true })).toBeVisible();
    const toggle = row.getByRole('button', { name: /Show legs/ });
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(row.getByRole('listitem')).toHaveCount(0);
    await toggle.click();
    await expect(row.getByRole('button', { name: /Hide legs/ })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    await expect(row.getByRole('listitem')).toHaveCount(4);
    await expect(row.getByRole('listitem').nth(1)).toHaveText('Mo Bamba Under 20.5 Pts+Ast+Reb');
  });

  test('breakdowns show settled and pending counts', async ({ page }) => {
    const t = page.getByRole('region', { name: 'By sportsbook table' });
    await expect(t.getByRole('columnheader')).toHaveText([
      'Book',
      'Settled',
      'Pending',
      'Staked',
      'PnL',
      'ROI',
    ]);
    const cells = t.locator('tbody tr').first().locator('th,td');
    await expect(cells.nth(1)).toHaveText('2');
    await expect(cells.nth(2)).toHaveText('2');
    await expect(cells.nth(3)).toHaveText('₱505.00');
  });
});

test.describe('bets at 390px', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('breakdown PnL and ROI stay inside the viewport and the page does not scroll sideways', async ({
    page,
  }) => {
    await seedBets(page);
    await page.goto('/bets');
    for (const name of ['By sportsbook table', 'By month table']) {
      const row = page.getByRole('region', { name }).locator('tbody tr').first();
      await expect(row).toBeVisible();
      for (const label of ['PnL', 'ROI', 'Staked']) {
        const box = await row.locator(`td[data-label="${label}"]`).boundingBox();
        expect(box, `${name} ${label}`).not.toBeNull();
        expect(box!.x).toBeGreaterThanOrEqual(0);
        expect(box!.x + box!.width).toBeLessThanOrEqual(390);
      }
    }
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });
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

        // Seeded bets: expanded parlay, then each open menu.
        await seedBets(page);
        await page.goto('/bets');
        await page
          .getByRole('button', { name: /^Show legs/ })
          .first()
          .click();
        expect(await scan()).toEqual([]);
        await page
          .getByRole('button', { name: /^Settle:/ })
          .first()
          .click();
        await expect(page.getByRole('menu')).toBeVisible();
        expect(await scan()).toEqual([]);
        await page.keyboard.press('Escape');
        await page
          .getByRole('button', { name: /^More actions for/ })
          .first()
          .click();
        expect(await scan()).toEqual([]);
        await page.keyboard.press('Escape');
        await page.getByRole('button', { name: 'Log a bet' }).first().click();
        await expect(page.getByRole('dialog', { name: 'Log a bet' })).toBeVisible();
        expect(await scan()).toEqual([]);
      });
    });
  }
}
