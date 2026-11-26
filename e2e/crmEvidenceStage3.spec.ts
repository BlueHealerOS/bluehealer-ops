// Generates the Stage 3 evidence from fixture mode (invented data). Run: CRM_EVIDENCE=1 npx playwright test e2e/crmEvidenceStage3.spec.ts --trace off
import { mkdirSync, renameSync } from 'node:fs';
import { expect, test, type Browser, type Page } from '@playwright/test';
import { setup } from './support';

const OUT = new URL('../docs/crm/evidence/stage3/', import.meta.url).pathname;
const FIXTURE = './?fixture=crm#/crm';
test.skip(!process.env.CRM_EVIDENCE, 'evidence is generated on request');
test.describe.configure({ mode: 'serial' });

async function seedDuplicate(page: Page) {
  await page.goto(`${FIXTURE}/people`);
  await page.getByRole('button', { name: 'Add person' }).click();
  const dlg = page.getByRole('dialog', { name: 'Add person' });
  await dlg.getByLabel('Name', { exact: true }).fill('Avery F.');
  await dlg.getByLabel('Relationship type').selectOption('investor');
  await dlg.getByLabel('Organization').selectOption({ label: 'Example Capital' });
  await dlg.getByText('More').click();
  await dlg.getByLabel('Email').fill('avery.fixture@example.com');
  await dlg.getByLabel('Importance (1 to 5)').selectOption('2');
  await dlg.getByRole('button', { name: 'Add person' }).click();
  await page.getByRole('dialog', { name: 'Possible duplicate' }).getByRole('button', { name: 'Create anyway' }).click();
  await expect(page.getByRole('heading', { name: 'Avery F.', level: 1 })).toBeVisible();
  await page.getByRole('button', { name: 'Log contact', exact: true }).click();
  await page.getByRole('dialog').getByLabel('Summary (required, one line)').fill('Call with the second record');
  await page.getByRole('dialog').getByRole('button', { name: 'Save contact' }).click();
  await expect(page.getByText('Logged contact with Avery F.')).toBeVisible();
}
const quiet = (page: Page) => expect(page.locator('div[aria-live="polite"] p')).toHaveCount(0, { timeout: 15_000 });
const still = async (page: Page, file: string) => { await quiet(page); await page.evaluate(() => window.scrollTo(0, 0)); await page.mouse.move(0, 0); await page.screenshot({ path: `${OUT}${file}.png` }); };

for (const width of [1440, 390]) {
  test(`screenshots at ${width}px`, async ({ browser }) => {
    mkdirSync(OUT, { recursive: true });
    const ctx = await browser.newContext({ viewport: { width, height: width === 1440 ? 900 : 844 }, deviceScaleFactor: 2 });
    const page = await ctx.newPage();
    await setup(page, { seed: false });
    await seedDuplicate(page);
    await page.goto(`${FIXTURE}/attention`);
    await page.getByRole('heading', { name: 'Needs attention', level: 1 }).waitFor();
    await still(page, `needs-attention-duplicates-${width}`);
    await page.getByRole('button', { name: /^Merge Avery Fixture/ }).click();
    await page.getByRole('dialog', { name: 'Merge people' }).waitFor();
    await page.getByRole('dialog').getByRole('radio', { name: /Other record: 2/ }).first().check();
    await quiet(page);
    await page.getByRole('dialog').evaluate((el) => el.scrollTo(0, 0));
    await page.mouse.move(0, 0);
    await page.screenshot({ path: `${OUT}merge-sheet-${width}.png` });
    await page.keyboard.press('Escape');
    await page.goto(`${FIXTURE}/people`);
    await page.getByRole('link', { name: 'Avery F.' }).click();
    await page.getByRole('button', { name: 'Delete', exact: true }).click();
    await page.getByRole('dialog', { name: 'Delete Avery F.' }).waitFor();
    await quiet(page);
    await page.mouse.move(0, 0);
    await page.screenshot({ path: `${OUT}delete-sheet-${width}.png` });
    await page.keyboard.press('Escape');
    await page.goto(`${FIXTURE}/export`);
    await page.getByRole('heading', { name: 'Export', level: 1 }).waitFor();
    await still(page, `export-${width}`);
    await ctx.close();
  });
}

async function record(browser: Browser, file: string, run: (page: Page) => Promise<void>) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, recordVideo: { dir: OUT, size: { width: 390, height: 844 } } });
  const page = await ctx.newPage();
  await setup(page, { seed: false });
  await run(page);
  const video = page.video()!;
  await ctx.close();
  renameSync(await video.path(), `${OUT}${file}.webm`);
}

test('recording: merge two duplicate people, then undo the merge', async ({ browser }) => {
  await record(browser, 'merge-undo-390', async (page) => {
    await seedDuplicate(page);
    await page.goto(`${FIXTURE}/attention`);
    await page.waitForTimeout(800);
    await page.getByRole('button', { name: /^Merge Avery Fixture/ }).click();
    const dlg = page.getByRole('dialog', { name: 'Merge people' });
    await page.waitForTimeout(600);
    await dlg.getByRole('radio', { name: /Other record: 2/ }).first().check();
    await page.waitForTimeout(600);
    await dlg.getByRole('button', { name: 'Merge records' }).click();
    await expect(page.getByText('Merged Avery F. into Avery Fixture.')).toBeVisible();
    await page.waitForTimeout(1200);
    await page.getByRole('list', { name: 'Recent merges' }).getByRole('button', { name: /Undo merge/ }).click();
    await expect(page.getByText('Merge undone. Both records are back.')).toBeVisible();
    await page.waitForTimeout(1500);
  });
});
