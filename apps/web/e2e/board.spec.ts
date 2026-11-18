import { BOARD_TABLE, boardSubtitle, expect, test } from './fixtures';

test('board loads; "L10 Locks" changes the count and the URL; reload keeps the filters', async ({
  page,
}) => {
  await page.goto('/');
  const table = page.getByRole('table', { name: BOARD_TABLE });
  await expect(table.getByRole('link').first()).toBeVisible();
  const before = await boardSubtitle(page);
  expect(before).toMatch(/\d+ props?/);
  const url0 = new URL(page.url());
  expect(url0.search).toBe('');

  await page.getByRole('group', { name: 'Presets' }).getByRole('button', { name: 'L10 Locks' }).click();
  await expect.poll(() => new URL(page.url()).search).not.toBe('');
  await expect.poll(() => boardSubtitle(page)).not.toBe(before);
  const after = await boardSubtitle(page);
  expect(after).toMatch(/props? match/);
  const search = new URL(page.url()).search;
  expect(search).toContain('minHitRate=80');

  await page.reload();
  expect(new URL(page.url()).search).toBe(search);
  expect(await boardSubtitle(page)).toBe(after);
  await expect(
    page.getByRole('group', { name: 'Presets' }).getByRole('button', { name: 'L10 Locks' }),
  ).toHaveAttribute('aria-pressed', 'true');
});
