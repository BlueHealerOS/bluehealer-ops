// Generates the Stage 2 evidence (screenshots, recordings, network and storage panels) from fixture mode only.
// Run: CRM_EVIDENCE=1 npx playwright test e2e/crmEvidence.spec.ts --trace off
// Skipped otherwise, so CI never rewrites the files. Everything shown is invented data.
import { mkdirSync, renameSync, writeFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { setup } from './support';

const OUT = new URL('../docs/crm/evidence/stage2/', import.meta.url).pathname;
const FIXTURE = './?fixture=crm#/crm';
test.skip(!process.env.CRM_EVIDENCE, 'evidence is generated on request');
test.describe.configure({ mode: 'serial' });

const SHOTS = [['today', 'today'], ['people', 'people'], ['organization', 'org/3'], ['profile', 'person/1'], ['needs-attention', 'attention']] as const;

for (const width of [1440, 390]) {
  test(`screenshots at ${width}px`, async ({ browser }) => {
    mkdirSync(OUT, { recursive: true });
    const ctx = await browser.newContext({ viewport: { width, height: width === 1440 ? 900 : 844 }, deviceScaleFactor: 2 });
    const page = await ctx.newPage();
    await setup(page, { seed: false });
    for (const [file, path] of SHOTS) {
      await page.goto(`${FIXTURE}/${path}`);
      if (path === 'today') await page.getByRole('button', { name: 'Both founders' }).click();
      await page.getByRole('main').getByRole('heading', { level: 1 }).waitFor();
      await page.waitForLoadState('networkidle');
      await page.evaluate(() => window.scrollTo(0, 0)); // hash navigation keeps the previous scroll position
      await page.mouse.move(0, 0); // no hover state in the picture
      await page.screenshot({ path: `${OUT}${file}-${width}.png` });
      if (file === 'today') { // the top of the list, scrolled to the first card
        await page.locator('ol[aria-label="Due"]').scrollIntoViewIfNeeded();
        await page.getByRole('heading', { name: 'Top 5 due' }).scrollIntoViewIfNeeded();
        await page.evaluate(() => window.scrollBy(0, -70));
        await page.screenshot({ path: `${OUT}today-list-${width}.png` });
      }
    }
    await ctx.close();
  });
}

async function record(browser: import('@playwright/test').Browser, file: string, run: (page: import('@playwright/test').Page) => Promise<void>) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, recordVideo: { dir: OUT, size: { width: 390, height: 844 } } });
  const page = await ctx.newPage();
  await setup(page, { seed: false });
  await run(page);
  const video = page.video()!;
  await ctx.close();
  renameSync(await video.path(), `${OUT}${file}.webm`);
}

test('recording: Log contact removes the person from the top', async ({ browser }) => {
  await record(browser, 'log-contact-390', async (page) => {
    await page.goto(`${FIXTURE}/today`);
    await page.getByRole('button', { name: 'Both founders' }).click();
    await expect(page.getByRole('link', { name: 'Blake Sample' }).first()).toBeVisible();
    await page.waitForTimeout(800);
    await page.getByRole('button', { name: 'Log contact with Blake Sample' }).click();
    const dlg = page.getByRole('dialog', { name: 'Log contact' });
    await dlg.getByLabel('Summary (required, one line)').pressSequentially('Quick check-in call', { delay: 40 });
    await dlg.getByLabel('Type').selectOption('call');
    await page.waitForTimeout(500);
    await dlg.getByRole('button', { name: 'Save contact' }).click();
    await expect(page.getByText('Logged contact with Blake Sample.')).toBeVisible();
    await page.waitForTimeout(1500);
    await expect(page.locator('ol[aria-label="Due"] > li > div:first-child > a').first()).not.toHaveText('Blake Sample');
  });
});

test('recording: Add person on a phone with the required fields only', async ({ browser }) => {
  await record(browser, 'add-person-390', async (page) => {
    await page.goto(`${FIXTURE}/people`);
    await page.waitForTimeout(800);
    await page.getByRole('button', { name: 'Add person' }).click();
    const dlg = page.getByRole('dialog', { name: 'Add person' });
    await dlg.getByLabel('Name', { exact: true }).pressSequentially('Pat New Person', { delay: 40 });
    await dlg.getByLabel('Relationship type').selectOption('advisor');
    await page.waitForTimeout(500);
    await dlg.getByRole('button', { name: 'Add person' }).click();
    await expect(page.getByRole('heading', { name: 'Pat New Person', level: 1 })).toBeVisible();
    await page.waitForTimeout(1500);
  });
});

test('network and storage panels in fixture mode', async ({ page }) => {
  const { env } = await setup(page, { seed: false });
  const urls: string[] = [];
  page.on('request', (r) => urls.push(r.url()));
  await page.goto(`${FIXTURE}/today`);
  await page.getByRole('button', { name: 'Both founders' }).click();
  await page.getByRole('button', { name: 'Log contact with Gray Sample' }).click();
  await page.getByRole('dialog').getByLabel('Summary (required, one line)').fill('Intro call');
  await page.getByRole('dialog').getByRole('button', { name: 'Save contact' }).click();
  await expect(page.getByText('Logged contact with Gray Sample.')).toBeVisible();
  const crmIds = env.fake.state.lists.filter((l) => l.displayName.startsWith('CRM ')).map((l) => `/lists/${l.id}`);
  const origins: Record<string, number> = {};
  for (const u of urls) { const o = new URL(u).origin; origins[o] = (origins[o] ?? 0) + 1; }
  const store = await page.evaluate(async () => ({ localStorageKeys: Object.keys(localStorage), sessionStorageKeys: Object.keys(sessionStorage), indexedDbDatabases: (await indexedDB.databases()).map((d) => d.name) }));
  writeFileSync(`${OUT}network.json`, JSON.stringify({
    note: 'Fixture mode, one Log contact. Requests by origin; the Graph calls are the app shell (site check, task lists). No request touched a CRM list.',
    requestsByOrigin: origins,
    requestsToCrmLists: urls.filter((u) => crmIds.some((id) => u.includes(id))).length,
    otherOrigins: Object.keys(origins).filter((o) => !['http://localhost:4173', 'https://graph.microsoft.com'].includes(o)),
  }, null, 2) + '\n');
  writeFileSync(`${OUT}storage.json`, JSON.stringify({ note: 'Fixture mode after one Log contact. Key names only.', ...store }, null, 2) + '\n');
  expect(store.indexedDbDatabases).toEqual([]);
});
