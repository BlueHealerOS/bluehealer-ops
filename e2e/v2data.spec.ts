// Phase A1 (docs/PLAN-v2.md): who closes a card, the status migration on the Admin page, and the browser cache being cleared.
import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { setup } from './support';

type Setup = Awaited<ReturnType<typeof setup>>;
const tasksList = (s: Setup) => s.env.fake.state.lists.find((l) => l.displayName === 'Tasks')!;
const byTitle = (s: Setup, title: string) => tasksList(s).items.find((i) => i.fields.Title === title)!;

test.describe('only a founder closes a card', () => {
  test('Done is not offered in the Status list, and Mark done records who closed it', async ({ page }) => {
    const s = await setup(page);
    await page.goto('./#/tasks/list');
    await page.getByRole('button', { name: 'Prepare benchtop summary' }).click();
    const options = await page.getByLabel('Status').locator('option').allInnerTexts();
    expect(options).not.toContain('Done');
    await page.getByRole('button', { name: 'Mark done' }).click();
    await expect.poll(() => byTitle(s, 'Prepare benchtop summary').fields.Status).toBe('Done');
    const f = byTitle(s, 'Prepare benchtop summary').fields;
    expect(f.ClosedBy).toBe('Santiago');
    expect(typeof f.CompletedAt).toBe('string');
  });

  test('a card that is already Done still shows its own status', async ({ page }) => {
    const s = await setup(page);
    s.env.fake.seed('Tasks', { Title: 'Fictional finished item', Status: 'Done', Owner: 'Santiago', CompletedAt: new Date().toISOString() });
    await page.goto('./#/tasks/done');
    await page.getByRole('button', { name: 'Fictional finished item' }).click();
    await expect(page.getByLabel('Status')).toHaveValue('Done');
  });
});

test.describe('Admin: move cards to the new board', () => {
  test('dry run, download, apply and restore', async ({ page }) => {
    const s = await setup(page);
    await page.goto('./#/admin');
    const panel = page.getByLabel('Move cards to the new board');
    await panel.getByRole('button', { name: 'Dry run' }).click();
    const report = page.getByRole('region', { name: 'Migration dry run' });
    await expect(report).toContainText('Inbox to Backlog: 1');
    await expect(report).toContainText('Next (this week) to This week: 1');
    await expect(report).toContainText('Next (other) to Backlog: 3');
    await expect(report).toContainText('Cards to update: 7');
    // Nothing is written by a dry run.
    expect(byTitle(s, 'Untyped inbox item').fields.Status).toBe('Inbox');
    // Apply waits for the report to be downloaded.
    await expect(panel.getByRole('button', { name: /^Apply/ })).toBeDisabled();
    const [download] = await Promise.all([page.waitForEvent('download'), panel.getByRole('button', { name: 'Download report' }).click()]);
    const text = await readFile((await download.path())!, 'utf8');
    expect(text).not.toContain('Prepare benchtop summary'); // ids and statuses only, no titles
    await panel.getByRole('button', { name: /^Apply/ }).click();
    await expect(panel.getByRole('status')).toContainText('Updated 7 of 7 cards.');
    expect(byTitle(s, 'Untyped inbox item').fields.Status).toBe('Backlog');
    expect(byTitle(s, 'Prepare benchtop summary').fields.Status).toBe('This week');
    expect(byTitle(s, 'Waiting on fictional vendor').fields).toMatchObject({ Status: 'Waiting', Kind: 'Task' });
    // A second dry run finds nothing to do.
    await panel.getByRole('button', { name: 'Dry run' }).click();
    await expect(page.getByRole('region', { name: 'Migration dry run' })).toContainText('Nothing to move');
    // Restore puts the earlier statuses back.
    await page.getByLabel('Restore previous statuses from a report (JSON)').setInputFiles({ name: 'report.json', mimeType: 'application/json', buffer: Buffer.from(text) });
    await expect(panel.getByRole('status')).toContainText('Restored the previous status on 5 of 5 cards.'); // 1 Inbox and 4 Next cards changed status
    expect(byTitle(s, 'Untyped inbox item').fields.Status).toBe('Inbox');
    expect(byTitle(s, 'Prepare benchtop summary').fields.Status).toBe('Next');
  });

  test('says what to do when the new columns are not in the list yet', async ({ page }) => {
    const s = await setup(page);
    tasksList(s).columns = tasksList(s).columns.filter((c) => c.name !== 'SortKey');
    await page.goto('./#/admin');
    await page.getByLabel('Move cards to the new board').getByRole('button', { name: 'Dry run' }).click();
    await expect(page.getByLabel('Move cards to the new board').getByRole('alert')).toContainText('new columns are not in the Tasks list yet');
  });
});

test.describe('browser cache', () => {
  test('anything left in the cache is removed when nobody is signed in', async ({ page }) => {
    await setup(page, { signedIn: false });
    // Seed the database from a plain page of the same origin that does not run the app, so the app's start-up clear cannot race the seeding.
    await page.goto('./manifest.webmanifest');
    await page.evaluate(() => new Promise<void>((resolve, reject) => {
      const req = indexedDB.open('ops-cache-v1', 1);
      req.onupgradeneeded = () => { req.result.createObjectStore('snapshots'); };
      req.onsuccess = () => { req.result.close(); resolve(); };
      req.onerror = () => reject(req.error);
    }));
    expect(await page.evaluate(async () => (await indexedDB.databases()).map((d) => d.name))).toContain('ops-cache-v1');
    await page.goto('./');
    await expect(page.getByRole('button', { name: /sign in/i })).toBeVisible();
    await expect.poll(() => page.evaluate(async () => (await indexedDB.databases()).map((d) => d.name))).not.toContain('ops-cache-v1');
  });
});
