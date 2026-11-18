import { expect, test } from './fixtures';

test('theme toggle persists across reload (cookie and data-theme)', async ({ page, context }) => {
  await page.goto('/');
  const html = page.locator('html');
  await expect(html).toHaveAttribute('data-theme', /^(light|dark)$/);
  const start = await html.getAttribute('data-theme');
  const next = start === 'dark' ? 'light' : 'dark';

  await page
    .getByRole('button', { name: start === 'dark' ? 'Switch to light mode' : 'Switch to dark mode' })
    .first()
    .click();
  await expect(html).toHaveAttribute('data-theme', next);
  await expect
    .poll(async () => (await context.cookies()).find((c) => c.name === 'theme')?.value)
    .toBe(next);

  await page.reload();
  await expect(html).toHaveAttribute('data-theme', next);
  expect((await context.cookies()).find((c) => c.name === 'theme')?.value).toBe(next);
});
