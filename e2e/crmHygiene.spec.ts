import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { setup } from './support';

const FIXTURE = './?fixture=crm#/crm';
const peopleCount = (page: Page) => page.getByRole('status').filter({ hasText: /of \d+ people/ });

/** Adds a second record for Avery with the same email, through the duplicate warning ("Create anyway"). */
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

test.describe('CRM data hygiene in fixture mode', () => {
  test.beforeEach(async ({ page }) => { await setup(page, { seed: false }); });

  test('a duplicate shows in Needs attention; merge moves its interactions; Undo merge brings both records back', async ({ page }) => {
    await seedDuplicate(page);
    await page.goto(`${FIXTURE}/attention`);
    const dups = page.getByRole('list', { name: 'Possible duplicate people' });
    await expect(dups).toContainText('Avery Fixture');
    await expect(dups).toContainText('Avery F.');
    await expect(dups).toContainText('same email');
    await dups.getByRole('button', { name: /^Merge Avery Fixture and Avery F\./ }).click();
    const dlg = page.getByRole('dialog', { name: 'Merge people' });
    await expect(dlg.getByLabel(/Avery Fixture/).first()).toBeChecked(); // the record with more interactions is kept by default
    await dlg.getByRole('radio', { name: /Other record: 2/ }).first().check(); // take the other record's importance
    await expect(dlg.getByRole('status')).toContainText('The kept record will change: Importance.');
    await dlg.getByRole('button', { name: 'Merge records' }).click();
    await expect(page.getByText('Merged Avery F. into Avery Fixture.')).toBeVisible();
    await expect(dups).toContainText('No possible duplicates.');
    await page.goto(`${FIXTURE}/people`);
    await expect(peopleCount(page)).toContainText('20 of 20');
    await page.getByRole('link', { name: 'Avery Fixture' }).click();
    await expect(page.getByRole('list', { name: 'Interaction history' })).toContainText('Call with the second record');
    await expect(page.getByText('Importance', { exact: true })).toBeVisible();
    // undo
    await page.goto(`${FIXTURE}/attention`);
    const merges = page.getByRole('list', { name: 'Recent merges' });
    await expect(merges).toContainText('Merged Avery F. into Avery Fixture');
    await merges.getByRole('button', { name: /Undo merge/ }).click();
    await expect(page.getByText('Merge undone. Both records are back.')).toBeVisible();
    await expect(page.getByRole('list', { name: 'Recent merges' })).toContainText('No merges to undo.');
    await expect(dups).toContainText('Avery F.');
    await page.goto(`${FIXTURE}/people`);
    await expect(peopleCount(page)).toContainText('21 of 21');
    await page.getByRole('link', { name: 'Avery F.' }).click();
    await expect(page.getByRole('list', { name: 'Interaction history' })).toContainText('Call with the second record');
  });

  test('Delete one person lists what goes, then removes the person and their solo interactions', async ({ page }) => {
    await seedDuplicate(page);
    await page.getByRole('button', { name: 'Delete', exact: true }).click();
    const dlg = page.getByRole('dialog', { name: 'Delete Avery F.' });
    const what = dlg.getByRole('list', { name: 'What will be deleted' });
    await expect(what).toContainText('the person record for Avery F.');
    await expect(what).toContainText('1 interaction only involving Avery F.');
    await expect(dlg).toContainText('Follow-up tasks in the Tasks list are not deleted');
    await dlg.getByRole('button', { name: 'Delete person' }).click();
    await expect(page.getByText('Avery F. deleted.')).toBeVisible();
    await expect(page).toHaveURL(/#\/crm\/people$/);
    await expect(peopleCount(page)).toContainText('20 of 20');
    await expect(page.getByRole('link', { name: 'Avery F.' })).toHaveCount(0);
  });

  test('Export one person downloads complete JSON that names no one else', async ({ page }) => {
    await page.goto(`${FIXTURE}/people`);
    await page.getByRole('link', { name: 'Avery Fixture' }).click();
    const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export', exact: true }).click()]);
    expect(dl.suggestedFilename()).toBe('crm-person-1.json');
    const json = JSON.parse(readFileSync(await dl.path(), 'utf8'));
    expect(json.person).toMatchObject({ name: 'Avery Fixture', email: 'avery.fixture@example.com' });
    expect(json.organization.name).toBe('Example Capital');
    expect(json.interactions).toHaveLength(7);
    expect(JSON.stringify(json)).not.toContain('Blake');
  });

  test('weekly CSV: three downloads, Restricted records left out unless included', async ({ page }) => {
    await page.goto(`${FIXTURE}/export`);
    const get = async (name: string) => { const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name }).click()]); return { name: dl.suggestedFilename(), text: readFileSync(await dl.path(), 'utf8') }; };
    const people = await get('Download people');
    expect(people.name).toBe('crm-people-2026-11-23.csv');
    expect(people.text.charCodeAt(0)).toBe(0xfeff); // byte order mark for spreadsheets
    expect(people.text).toContain('Avery Fixture');
    expect(people.text).not.toContain('Oakley Example');
    expect((await get('Download organizations')).text).toContain('Fixture Devices Inc');
    expect((await get('Download interactions')).text).not.toContain('Call with a restricted contact');
    await page.getByLabel(/Include Restricted records/).check();
    expect((await get('Download people')).text).toContain('Oakley Example');
    expect((await get('Download interactions')).text).toContain('Call with a restricted contact');
  });

  test('keyboard: the merge sheet is reachable and closes with Escape', async ({ page }) => {
    await seedDuplicate(page);
    await page.goto(`${FIXTURE}/attention`);
    const merge = page.getByRole('button', { name: /^Merge Avery Fixture and Avery F\./ });
    await merge.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('dialog', { name: 'Merge people' })).toBeVisible();
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(merge).toBeFocused();
  });

  for (const width of [1440, 390]) {
    test(`Export, Needs attention with duplicates, and the merge and delete sheets are axe-clean at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await seedDuplicate(page);
      const { default: AxeBuilder } = await import('@axe-core/playwright');
      const check = async () => {
        const r = await new AxeBuilder({ page: page as never }).withTags(['wcag2a', 'wcag2aa']).analyze();
        expect(r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${v.id}: ${v.nodes[0]?.html}`)).toEqual([]);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
      };
      await page.goto(`${FIXTURE}/export`); await page.getByRole('heading', { name: 'Export', level: 1 }).waitFor(); await check();
      await page.goto(`${FIXTURE}/attention`); await page.getByRole('heading', { name: 'Needs attention', level: 1 }).waitFor(); await check();
      await page.getByRole('button', { name: /^Merge Avery Fixture/ }).click(); await check(); await page.keyboard.press('Escape');
      await page.goto(`${FIXTURE}/people`);
      await page.getByRole('link', { name: 'Avery F.' }).click();
      await page.getByRole('button', { name: 'Delete', exact: true }).click(); await check();
    });
  }
});
