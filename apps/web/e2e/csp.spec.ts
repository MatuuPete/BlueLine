import { expect, test } from '@playwright/test';

// Runs against the production build (`next start`): Next only stamps nonces on dynamically
// rendered pages, so every page route must be dynamic. Checks the shipped markup and CSP.
for (const path of ['/signin', '/welcome', '/offline']) {
  test(`CSP nonce covers every script on ${path}`, async ({ page }) => {
    const problems: string[] = [];
    page.on('console', (m) => {
      if (m.type() === 'error') problems.push(`console: ${m.text()}`);
    });
    page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));

    const res = await page.goto(path);
    expect(res?.status()).toBe(200);
    const csp = res?.headers()['content-security-policy'] ?? '';
    const nonce = /'nonce-([^']+)'/.exec(csp)?.[1];
    expect(nonce, 'CSP header carries a nonce').toBeTruthy();

    const scripts = await page.$$eval('script', (els) =>
      els.map((s) => ({ src: s.getAttribute('src'), nonce: s.nonce || s.getAttribute('nonce') })),
    );
    expect(scripts.length).toBeGreaterThan(0);
    for (const s of scripts) expect(s.nonce, `script ${s.src ?? '(inline)'} has a nonce`).toBe(nonce);

    await page.waitForLoadState('networkidle');
    expect(problems).toEqual([]);
  });
}
