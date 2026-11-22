import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { setup } from './support';

test.describe('tasks', () => {
  test('Today shows my actionable tasks, ranked and capped, not Jay-only or Inbox items', async ({ page }) => {
    await setup(page);
    await page.goto('./#/tasks/today');
    const list = page.getByRole('list', { name: 'Tasks' });
    await expect(list.getByRole('listitem')).toHaveCount(3);
    const titles = await list.getByRole('listitem').locator('button').allInnerTexts();
    expect(titles[0]).toContain('Prepare benchtop summary'); // P0 first
    await expect(page.getByText('Jay only item')).toHaveCount(0);
    await expect(page.getByText('Untyped inbox item')).toHaveCount(0);
  });

  test('quick add with the n key creates an Inbox task', async ({ page }) => {
    await setup(page);
    await page.goto('./#/tasks/board');
    await expect(page.getByRole('navigation', { name: 'Task views' })).toBeVisible();
    await page.keyboard.press('n');
    await page.getByLabel('Quick add to Inbox').fill('Call fictional contact');
    await page.keyboard.press('Enter');
    const inbox = page.getByRole('listitem', { name: 'Inbox' });
    await expect(inbox.getByRole('button', { name: 'Call fictional contact' })).toBeVisible();
  });

  test('a task cannot leave Inbox without a contribution type, and strategic types need a link', async ({ page }) => {
    await setup(page);
    await page.goto('./#/tasks/board');
    await page.getByRole('button', { name: 'Untyped inbox item' }).click();
    await page.getByLabel('Status').selectOption('Next');
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByRole('alert')).toContainText('contribution type');
    await page.getByLabel('Contribution type').selectOption('Milestone');
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByRole('alert')).toContainText('link to the matching record');
    await page.getByLabel('Contribution type').selectOption('Operations');
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByRole('listitem', { name: 'Next' }).getByRole('button', { name: 'Untyped inbox item' })).toBeVisible();
  });

  test('completing a recurring task creates the next instance', async ({ page }) => {
    await setup(page);
    await page.goto('./#/tasks/list');
    await page.getByLabel('Mark "Weekly review" done').check();
    await expect(page.getByText('Weekly review')).toHaveCount(1); // the next instance replaces it
    await page.getByRole('link', { name: 'Done this week' }).click();
    await expect(page.getByText('Weekly review')).toBeVisible();
  });

  test('currency figures are refused, so no deal data can be saved', async ({ page }) => {
    await setup(page);
    await page.goto('./#/tasks/list');
    await page.getByRole('button', { name: 'Prepare benchtop summary' }).click();
    await page.getByLabel('Description').fill('They proposed $50,000');
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByRole('alert')).toContainText('currency figure');
  });

  test('the task form has no amount, valuation or terms field anywhere', async ({ page }) => {
    await setup(page);
    await page.goto('./#/tasks/list');
    await page.getByRole('button', { name: 'Prepare benchtop summary' }).click();
    const html = (await page.locator('body').innerText()).toLowerCase();
    for (const w of ['amount', 'valuation', 'equity', 'cap table', 'wire', 'bank account']) expect(html).not.toContain(w);
  });

  test('filters are AND across facets, OR within, and the URL carries only facet values', async ({ page }) => {
    await setup(page);
    await page.goto('./#/tasks/list');
    await page.getByText('Filters').click();
    await page.getByRole('group', { name: 'Priority' }).getByText('P0', { exact: true }).click();
    await expect(page.getByText('Prepare benchtop summary')).toBeVisible();
    await expect(page.getByText('Send fictional follow-up')).toHaveCount(0);
    expect(page.url()).toContain('priority=P0');
    expect(page.url()).not.toContain('benchtop');
  });

  test('the version history tab lists changes', async ({ page }) => {
    await setup(page);
    await page.goto('./#/tasks/list');
    await page.getByRole('button', { name: 'Prepare benchtop summary' }).click();
    await page.getByLabel('Title').fill('Prepare benchtop summary v2');
    await page.getByRole('button', { name: 'Save' }).click();
    await page.getByRole('button', { name: 'Prepare benchtop summary v2' }).click();
    await page.getByRole('tab', { name: 'History' }).click();
    await expect(page.getByRole('list', { name: 'Version history' }).getByRole('listitem')).toHaveCount(2);
  });
});

test.describe('reminders', () => {
  test('overdue and waiting-past-expected reminders show, snooze hides them', async ({ page }) => {
    await setup(page);
    await page.goto('./#/tasks/today');
    await page.getByRole('button', { name: /Alerts/ }).click();
    const panel = page.getByRole('region', { name: 'Notifications' });
    await expect(panel.getByText('Overdue by 2 day(s)')).toBeVisible();
    await expect(panel.getByText(/Waiting on Example Vendor/)).toBeVisible();
    await expect(panel.getByText('Jay only item')).toHaveCount(0);
    await panel.getByRole('listitem').filter({ hasText: 'Send fictional follow-up' }).getByRole('button', { name: 'Snooze: In 1 hour' }).click();
    await expect(panel.getByText('Send fictional follow-up')).toHaveCount(0);
  });
});

test.describe('mobile', () => {
  test.use({ viewport: { width: 390, height: 780 } });
  test('Today, quick add and alerts work with one thumb', async ({ page }) => {
    await setup(page);
    await page.goto('./#/tasks/today');
    const nav = page.getByRole('navigation', { name: 'Mobile' });
    await expect(nav).toBeVisible();
    await nav.getByRole('button', { name: 'Add' }).click();
    await page.getByLabel('Quick add to Inbox').fill('Mobile captured item');
    await page.getByRole('button', { name: 'Add', exact: true }).last().click();
    await nav.getByRole('link', { name: 'Proposed' }).click();
    await expect(page.getByText('Machine proposed task')).toBeVisible();
    await page.getByRole('button', { name: /Alerts/ }).click();
    await expect(page.getByRole('region', { name: 'Notifications' })).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    expect(overflow).toBe(false);
  });
});

test.describe('accessibility', () => {
  for (const [name, path] of [['Today', '#/tasks/today'], ['Board', '#/tasks/board'], ['Settings', '#/settings'], ['Admin', '#/admin']] as const) {
    test(`${name} has no serious axe violations`, async ({ page }) => {
      await setup(page);
      await page.goto(`./${path}`);
      await page.waitForLoadState('networkidle');
      const r = await new AxeBuilder({ page: page as never }).withTags(['wcag2a', 'wcag2aa']).analyze();
      expect(r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${v.id}: ${v.nodes[0]?.html}`)).toEqual([]);
    });
  }
});
