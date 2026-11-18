import { expect, test as base } from '@playwright/test';

// No seeded cookie here: this is a first visit.
base('first visit shows the intro, and "Enter the board" opens the board', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/welcome$/);
  await page.getByRole('link', { name: /Enter the board/ }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('heading', { name: 'Prop board', level: 1 })).toBeVisible();

  // The intro is remembered: the board no longer redirects to it.
  await page.goto('/');
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('heading', { name: 'Prop board', level: 1 })).toBeVisible();
});
