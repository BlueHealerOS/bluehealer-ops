import { expect, test } from '@playwright/test';
import { setup } from './support';

test.describe('access gate', () => {
  test('without a token the app renders only the sign-in screen and makes no Graph calls', async ({ page }) => {
    const s = await setup(page, { signedIn: false });
    await page.goto('./');
    await expect(page.getByRole('heading', { name: 'BlueHealer Ops' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Sign in with Microsoft' })).toBeVisible();
    await page.waitForTimeout(700);
    expect(s.graphCalls()).toBe(0);
    const text = (await page.locator('body').innerText()).replace(/\s+/g, ' ');
    expect(text).not.toMatch(/Tasks|Settings|Admin|Today|Quick add/);
    await expect(page.getByRole('navigation')).toHaveCount(0);
  });

  test('a 403 from SharePoint shows access denied and nothing else', async ({ page }) => {
    await setup(page, { forbidden: true });
    await page.goto('./');
    await expect(page.getByRole('heading', { name: 'Access denied' })).toBeVisible();
    await expect(page.getByText('Prepare benchtop summary')).toHaveCount(0);
    await expect(page.getByRole('navigation')).toHaveCount(0);
  });

  test('signing in loads the app', async ({ page }) => {
    await setup(page, { signedIn: false });
    await page.goto('./');
    await page.getByRole('button', { name: 'Sign in with Microsoft' }).click();
    await page.waitForLoadState();
    await page.getByRole('button', { name: 'Santiago' }).click(); // first run: choose founder
    await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible();
  });
});
