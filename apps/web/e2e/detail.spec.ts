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
  let changed = false;
  for (const id of options) {
    await mate.selectOption(id);
    await page
      .getByRole('group', { name: 'With or without the teammate' })
      .getByRole('button', { name: 'Without', exact: true })
      .click();
    await page.waitForTimeout(300);
    if ((await tiles.innerText()) !== before) {
      changed = true;
      break;
    }
  }
  expect(changed, 'Without <teammate> changes the hit tiles').toBe(true);
});
