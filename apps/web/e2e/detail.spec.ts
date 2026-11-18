import { expect, propLinks, test } from './fixtures';

test('detail: the "Without" teammate split changes the hit tiles', async ({ page }) => {
  await page.goto('/');
  const [href] = await propLinks(page, 1);
  await page.goto(href);
  const tiles = page.getByRole('region', { name: /^Hit rates/ });
  await expect(tiles).toBeVisible();
  const before = await tiles.innerText();

  const mate = page.getByLabel('Teammate', { exact: true });
  const options = await mate.locator('option').evaluateAll((os) =>
    (os as HTMLOptionElement[]).filter((o) => o.value).map((o) => o.value),
  );
  expect(options.length).toBeGreaterThan(0);

  // Pick teammates until "without" changes the tiles (some may not have missed games).
  const mateMode = page.getByRole('group', { name: 'With or without the teammate' });
  let changed = false;
  for (const id of options) {
    await mate.selectOption(id);
    await mateMode.getByRole('button', { name: 'Without', exact: true }).click();
    await expect(mateMode.getByRole('button', { name: 'Without', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    try {
      await expect.poll(() => tiles.innerText(), { timeout: 3000 }).not.toBe(before);
      changed = true;
      break;
    } catch {
      // this teammate did not change the tiles; try the next
    }
  }
  expect(changed, 'Without <teammate> changes the hit tiles').toBe(true);
  // A tile's hits/games fraction text actually differs.
  expect(await tiles.innerText()).not.toBe(before);
});
