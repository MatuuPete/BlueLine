import { expect, propLinks, test } from './fixtures';

test('add two legs to the slip, save it, and see it in /slips', async ({ page }) => {
  await page.goto('/');
  const hrefs = await propLinks(page, 2);
  expect(hrefs[0]).not.toBe(hrefs[1]);

  const names: string[] = [];
  for (const href of hrefs) {
    await page.goto(href);
    names.push((await page.getByRole('heading', { level: 1 }).first().innerText()).trim());
    await page.getByRole('button', { name: /^Add to slip|^Add .* to slip/ }).first().click();
    await expect(page.getByRole('button', { name: /^Remove from slip|^Remove .* from slip|In slip/ }).first()).toBeVisible();
  }

  await page.getByRole('button', { name: /^Slip · 2 legs?/ }).first().click();
  const drawer = page.getByRole('dialog');
  await expect(drawer).toBeVisible();
  await drawer.getByLabel('Slip name').fill('E2E slip');
  await drawer.getByRole('button', { name: 'Save slip' }).click();

  await page.goto('/slips');
  const card = page.getByRole('listitem').filter({ has: page.getByRole('heading', { name: 'E2E slip' }) });
  await expect(card).toBeVisible();
  await expect(card).toContainText('2 legs');
});
