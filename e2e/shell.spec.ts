import { expect, test } from '@playwright/test';
import { setup } from './support';

const FOCUS_RGB = 'rgb(47, 128, 201)'; // #2F80C9

test.describe('desktop shell', () => {
  for (const width of [1280, 1440]) {
    test(`header is a single row at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await setup(page);
      await page.goto('./#/tasks/today');
      const header = page.getByRole('banner');
      await expect(header).toBeVisible();
      expect((await header.boundingBox())!.height).toBeLessThan(72);
      const tops = await header.locator('input, button').evaluateAll((els) => els.filter((e) => (e as HTMLElement).offsetParent).map((e) => Math.round(e.getBoundingClientRect().top)));
      expect(Math.max(...tops) - Math.min(...tops)).toBeLessThan(16);
    });
  }

  test('sidebar shows queues, sections, saved views and counts', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await setup(page);
    await page.goto('./#/tasks/today');
    const nav = page.getByRole('navigation', { name: 'Main' });
    for (const name of ['Today', 'This week', 'Waiting on others', 'Suggested', 'Done this week', 'Needs attention', 'Milestones', 'Triage', 'Meetings', 'Settings', 'Overdue']) {
      await expect(nav.getByRole('link', { name: new RegExp(name) })).toBeVisible();
    }
    await expect(nav.getByRole('link', { name: /Suggested/ })).toContainText('1'); // one seeded suggestion
    await expect(nav.getByRole('link', { name: /Today/ })).toHaveAttribute('aria-current', 'page');
  });

  test('top bar has the workspace tabs and a More menu; the sidebar follows the workspace', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await setup(page);
    await page.goto('./#/tasks/today');
    const tabs = page.getByRole('navigation', { name: 'Workspaces' });
    for (const name of ['Tasks', 'Engineering', 'CRM']) await expect(tabs.getByRole('link', { name })).toBeVisible();
    await expect(tabs.getByRole('link', { name: 'Tasks' })).toHaveAttribute('aria-current', 'page');
    const more = tabs.getByRole('button', { name: 'More' });
    await more.click();
    for (const name of ['Milestones', 'Triage', 'Meetings', 'Settings']) await expect(page.getByRole('menuitem', { name })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('menu')).toHaveCount(0);
    await expect(more).toBeFocused();
    await tabs.getByRole('link', { name: 'CRM' }).click();
    await expect(page).toHaveURL(/#\/crm\/people$/);
    const nav = page.getByRole('navigation', { name: 'Main' });
    for (const name of ['People', 'Organizations', 'Investor follow-ups', 'Overdue contacts']) await expect(nav.getByRole('link', { name })).toBeVisible();
    await expect(nav.getByRole('link', { name: /Today/ })).toHaveCount(0);
    await tabs.getByRole('link', { name: 'Engineering' }).click();
    await expect(page).toHaveURL(/#\/engineering\/review$/);
    for (const name of ['Review', 'Trace graph']) await expect(nav.getByRole('link', { name })).toBeVisible();
  });

  test('every earlier route redirects to its place in the workspaces', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await setup(page);
    for (const [from, to] of [['#/triage', '#/tasks/triage'], ['#/milestones', '#/tasks/milestones'], ['#/meetings', '#/tasks/meetings'], ['#/crm', '#/crm/people'], ['#/tasks', '#/tasks/today'], ['', '#/tasks/today'], ['#/triage?x=1', '#/tasks/triage?x=1']] as const) {
      await page.goto(`./${from}`);
      await expect(page).toHaveURL(new RegExp(to.replace(/[?#/]/g, '\\$&') + '$'));
    }
    for (const same of ['#/tasks/proposed', '#/crm/organizations', '#/settings', '#/admin', '#/engineering/graph']) {
      await page.goto(`./${same}`);
      await expect(page).toHaveURL(new RegExp(same.replace(/[?#/]/g, '\\$&') + '$'));
    }
  });

  test('layout control and renamed routes still work', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await setup(page);
    await page.goto('./#/tasks/proposed');
    await expect(page.getByRole('heading', { name: 'Suggested', level: 1 })).toBeVisible();
    await expect(page.getByText('Machine proposed task')).toBeVisible();
    await expect(page.getByText('Suggested').first()).toBeVisible();
    await page.getByRole('navigation', { name: 'Task layouts' }).getByRole('link', { name: 'Board' }).click();
    await expect(page).toHaveURL(/#\/tasks\/board$/);
    await page.goto('./#/tasks/hygiene');
    await expect(page.getByRole('heading', { name: 'Needs attention', level: 1 })).toBeVisible();
    for (const path of ['#/tasks/today', '#/tasks/proposed', '#/tasks/hygiene', '#/settings', '#/admin', '#/milestones', '#/crm/people', '#/triage', '#/meetings']) {
      await page.goto(`./${path}`);
      const text = await page.locator('body').innerText();
      expect(text, path).not.toMatch(/Hygiene|Proposed/);
    }
  });

  test('avatar menu holds sign out and closes with Escape', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await setup(page);
    await page.goto('./#/tasks/today');
    const trigger = page.getByRole('button', { name: /Account menu/ });
    await trigger.click();
    await expect(page.getByRole('menuitem', { name: 'Sign out' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('menu')).toHaveCount(0);
    await expect(trigger).toBeFocused();
  });

  test('admin lives under settings', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await setup(page);
    await page.goto('./#/settings');
    await page.getByRole('link', { name: 'Open lists and imports' }).click();
    await expect(page.getByRole('heading', { name: 'Lists and imports' })).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Settings' })).toHaveAttribute('aria-current', 'page');
    await expect(page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Admin' })).toHaveCount(0);
  });

  test('keyboard reaches every nav item with a visible #2F80C9 focus ring', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await setup(page);
    await page.goto('./#/tasks/today');
    const nav = page.getByRole('navigation', { name: 'Main' });
    await expect(nav).toBeVisible();
    const total = await nav.getByRole('link').count();
    expect(total).toBeGreaterThan(10);
    await nav.getByRole('link').first().focus();
    const seen = new Set<string>();
    for (let i = 0; i < total; i++) {
      if (i > 0) await page.keyboard.press('Tab');
      const info = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement;
        const cs = getComputedStyle(el);
        return { inNav: !!el.closest('nav[aria-label="Main"]'), text: el.textContent?.trim() ?? '', color: cs.outlineColor, width: cs.outlineWidth, style: cs.outlineStyle };
      });
      if (!info.inNav) continue;
      expect(info.color).toBe(FOCUS_RGB);
      expect(info.width).toBe('3px');
      expect(info.style).not.toBe('none');
      seen.add(info.text);
    }
    expect(seen.size).toBe(total);
  });

  test('fonts load from this origin and are used', async ({ page }) => {
    const fontUrls: string[] = [];
    page.on('response', (r) => { if (/\.woff2(\?|$)/.test(r.url())) fontUrls.push(r.url()); });
    await page.setViewportSize({ width: 1440, height: 900 });
    await setup(page);
    await page.goto('./#/tasks/today');
    await expect(page.locator('h1').first()).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    expect(fontUrls.length).toBeGreaterThan(0);
    for (const u of fontUrls) expect(new URL(u).origin).toBe('http://localhost:4173');
    expect(await page.evaluate(() => document.fonts.check('400 15px "BH Sans"'))).toBe(true);
    expect(await page.evaluate(() => getComputedStyle(document.querySelector('h1')!).fontFamily)).toContain('BH Display');
  });
});

test.describe('mobile shell', () => {
  test.use({ viewport: { width: 390, height: 780 } });
  test('header is brand and search; tab bar has icons and an active state', async ({ page }) => {
    await setup(page);
    await page.goto('./#/tasks/today');
    await expect(page.getByRole('navigation', { name: 'Main' })).toBeHidden();
    const tabs = page.getByRole('navigation', { name: 'Mobile' });
    await expect(tabs.getByRole('link', { name: 'Tasks' })).toHaveAttribute('aria-current', 'page');
    for (const name of ['Engineering', 'CRM']) await expect(tabs.getByRole('link', { name })).toBeVisible();
    await expect(tabs.getByRole('button', { name: 'More' })).toBeVisible();
    expect(await tabs.locator('svg').count()).toBe(5);
    await expect(page.getByRole('button', { name: 'Quick add' })).toBeHidden();
    await expect(page.getByRole('searchbox').or(page.getByLabel('Search tasks'))).toBeVisible();
    const padding = await tabs.evaluate((el) => getComputedStyle(el).paddingBottom);
    expect(padding).toBeDefined();
  });
});
