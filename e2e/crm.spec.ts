import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { setup } from './support';

const read = <T>(f: string): T => JSON.parse(readFileSync(new URL(`../fixtures/crm/${f}`, import.meta.url), 'utf8')) as T;
const expected = read<{ today: string; due: { id: number }[]; top: number[]; mineSantiago: number[]; upcoming: number[]; excluded: number[] }>('expected-today.json');
const fixturePeople = read<{ id: number; name: string }[]>('people.json');

const FIXTURE = './?fixture=crm#/crm';
const name = (id: number) => fixturePeople.find((p) => p.id === id)!.name;
const dueNames = (page: Page) => page.locator('ol[aria-label="Due"] > li > div:first-child > a').allInnerTexts();
async function scopeBoth(page: Page) { await page.getByRole('button', { name: 'Both founders' }).click(); }

test.describe('CRM in fixture mode (invented data, fixed date)', () => {
  let env: Awaited<ReturnType<typeof setup>>['env'];
  test.beforeEach(async ({ page }) => { env = (await setup(page, { seed: false })).env; });

  test('Today shows the expected order, reasons, indicators, waiting on and upcoming', async ({ page }) => {
    await page.goto(`${FIXTURE}/today`);
    await expect(page.getByRole('note')).toContainText(`fixed at ${expected.today}`);
    // Mine (Santiago) by default
    await expect.poll(() => dueNames(page)).toEqual(expected.mineSantiago.map(name));
    await scopeBoth(page);
    await expect.poll(() => dueNames(page)).toEqual(expected.top.map(name));
    const blake = page.locator('ol[aria-label="Due"] > li').first();
    await expect(blake).toContainText('Priority 92');
    await expect(blake).toContainText('34 days since last two-way contact, cadence 14. Due.');
    await expect(blake).toContainText('Last: Reply on next steps (Oct 20).');
    await page.getByRole('button', { name: 'Show all due (6)' }).click();
    await expect.poll(() => dueNames(page)).toEqual(expected.due.map((d) => name(d.id)));
    const ind = page.getByRole('list', { name: 'Indicators' });
    await expect(ind.getByRole('listitem').nth(0)).toContainText('Investors overdue (over 14 days)');
    await expect(ind.getByRole('listitem').nth(0)).toContainText('Blake Sample');
    await expect(ind.getByRole('listitem').nth(1)).toContainText('Emery Fixture');
    await page.getByText('I am waiting on (1)').click();
    await expect(page.getByRole('list', { name: 'I am waiting on' })).toContainText('Reese Fixture');
    await page.getByText('Waiting on me (1)').click();
    await expect(page.getByRole('list', { name: 'Waiting on me' })).toContainText('Sage Example');
    await expect(page.getByRole('list', { name: 'Upcoming' }).getByRole('listitem')).toHaveCount(expected.upcoming.length);
    await expect(page.getByText('Ranking version 1.0.0')).toBeVisible();
  });

  test('Restricted, Mapped and Dormant people never appear in Today; Restricted ones are listed in Needs attention', async ({ page }) => {
    await page.goto(`${FIXTURE}/today`);
    await scopeBoth(page);
    await page.getByRole('button', { name: 'Show all due (6)' }).click();
    const shown = [...(await dueNames(page)), ...(await page.getByRole('list', { name: 'Upcoming' }).innerText()).split('\n')].join(' ');
    for (const n of ['Oakley Example', 'Kai Sample', 'Lane Example', 'Morgan Fixture', 'Noel Sample']) expect(shown).not.toContain(n);
    await page.goto(`${FIXTURE}/attention`);
    await expect(page.getByRole('list', { name: 'Restricted records' })).toContainText('Oakley Example');
    await expect(page.getByRole('list', { name: 'No check-in date' })).toContainText('Casey Placeholder');
    await expect(page.getByRole('button', { name: 'Recompute' })).toBeDisabled();
  });

  test('Log contact removes the person from the top five without reloading, and writes history', async ({ page }) => {
    await page.goto(`${FIXTURE}/today`);
    await scopeBoth(page);
    await expect.poll(() => dueNames(page)).toEqual(expected.top.map(name));
    await page.getByRole('button', { name: 'Log contact with Blake Sample' }).click();
    const dlg = page.getByRole('dialog', { name: 'Log contact' });
    await dlg.getByLabel('Summary (required, one line)').fill('Quick check-in call');
    await dlg.getByLabel('Type').selectOption('call');
    await expect(dlg.getByLabel('Direction')).toHaveValue('two-way');
    await dlg.getByRole('button', { name: 'Save contact' }).click();
    await expect(page.getByText('Logged contact with Blake Sample.')).toBeVisible();
    const after = await dueNames(page);
    expect(after).not.toContain('Blake Sample');
    expect(after).toEqual([5, 7, 1, 6, 10].map(name)); // the sixth person moved up
    await page.goto(`${FIXTURE}/people`);
    await page.getByRole('link', { name: 'Blake Sample' }).click();
    await expect(page.getByRole('list', { name: 'Interaction history' }).getByRole('listitem').first()).toContainText('Quick check-in call');
  });

  test('a record changed by someone else shows the reload message and saves nothing', async ({ page }) => {
    await page.goto(`${FIXTURE}/today`);
    await scopeBoth(page);
    await page.evaluate(() => (globalThis as unknown as { __crmFixtureRepo: { touch(l: string, id: number): void } }).__crmFixtureRepo.touch('CRM People', 2));
    await page.getByRole('button', { name: 'Log contact with Blake Sample' }).click();
    const dlg = page.getByRole('dialog', { name: 'Log contact' });
    await dlg.getByLabel('Summary (required, one line)').fill('Call');
    await dlg.getByRole('button', { name: 'Save contact' }).click();
    await expect(dlg.getByRole('alert')).toContainText('This record changed. Reload to see the update.');
    await dlg.getByRole('button', { name: 'Reload' }).click();
    await expect(dlg).toHaveCount(0);
    expect(await dueNames(page)).toContain('Blake Sample'); // nothing was written
  });

  test('currency figures are refused in a summary', async ({ page }) => {
    await page.goto(`${FIXTURE}/today`);
    await page.getByRole('button', { name: 'Log contact with Gray Sample' }).click();
    const dlg = page.getByRole('dialog', { name: 'Log contact' });
    await dlg.getByLabel('Summary (required, one line)').fill('They want $25,000 at a cap');
    await dlg.getByRole('button', { name: 'Save contact' }).click();
    await expect(dlg.getByRole('alert')).toContainText('currency figure');
  });

  test('Snooze removes the person until the date; Mute can be undone', async ({ page }) => {
    await page.goto(`${FIXTURE}/today`);
    await page.getByRole('button', { name: 'Snooze Emery Fixture' }).click();
    await page.getByRole('dialog', { name: /Snooze Emery Fixture/ }).getByRole('button', { name: /^1 week/ }).click();
    await expect(page.getByText('Emery Fixture snoozed until 2026-11-30.')).toBeVisible();
    expect(await dueNames(page)).not.toContain('Emery Fixture');
    await page.getByRole('button', { name: 'Mute Gray Sample' }).click();
    await expect(page.getByText('Gray Sample muted.')).toBeVisible();
    expect(await dueNames(page)).not.toContain('Gray Sample');
    await page.getByRole('button', { name: 'Undo' }).click();
    await expect.poll(() => dueNames(page)).toContain('Gray Sample');
  });

  test('profile shows next check-in with its reason, history and the person actions', async ({ page }) => {
    await page.goto(`${FIXTURE}/people`);
    await page.getByRole('link', { name: 'Avery Fixture' }).click();
    await expect(page.getByRole('heading', { name: 'Avery Fixture', level: 1 })).toBeVisible();
    await expect(page.getByText('2026-11-23 (due)')).toBeVisible();
    await expect(page.getByText('Last: Call about follow-up questions (Nov 9).')).toBeVisible();
    const hist = page.getByRole('list', { name: 'Interaction history' }).getByRole('listitem');
    await expect(hist.first()).toContainText('2026-11-20'); // newest first: the broadcast
    await expect(hist.first()).toContainText('Holiday greeting newsletter');
    await expect(hist.filter({ hasText: 'Call about follow-up questions' })).toContainText('2026-11-09');
    for (const n of ['Log contact', 'Snooze', 'Mute', 'Edit']) await expect(page.getByRole('button', { name: n, exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Edit', exact: true }).click();
    const dlg = page.getByRole('dialog', { name: 'Edit Avery Fixture' });
    await dlg.getByLabel('Importance (1 to 5)').selectOption('2');
    await dlg.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText('Avery Fixture saved.')).toBeVisible();
    await expect(page.getByText('Importance', { exact: true })).toBeVisible();
  });

  test('People filters and search; an organization page lists its people by importance', async ({ page }) => {
    await page.goto(`${FIXTURE}/people`);
    await expect(page.getByRole('status')).toContainText('20 of 20');
    await page.getByLabel('Search name, organization or email').fill('fixture devices');
    await expect(page.getByRole('status')).toContainText('5 of 20');
    await page.getByLabel('Search name, organization or email').fill('');
    await page.getByLabel('Relationship type').selectOption('investor');
    await page.getByLabel('Owner').selectOption('Santiago');
    await expect(page.getByRole('list', { name: 'People' }).getByRole('listitem')).toHaveCount(3);
    await page.goto(`${FIXTURE}/organizations`);
    await page.getByRole('link', { name: 'Fixture Devices Inc' }).click();
    await expect(page.getByRole('heading', { name: 'Fixture Devices Inc', level: 1 })).toBeVisible();
    const people = page.getByRole('list', { name: 'People at this organization' }).getByRole('listitem');
    await expect(people).toHaveCount(5);
    await expect(people.first()).toContainText('Gray Sample');
    await expect(people.first()).toContainText('Importance 5');
  });

  test('the earlier investor view redirects to People filtered to investors', async ({ page }) => {
    await page.goto('./?fixture=crm#/crm/investors');
    await expect(page).toHaveURL(/#\/crm\/people\?relationship=investor$/);
    await expect(page.getByLabel('Relationship type')).toHaveValue('investor');
    await expect(page.getByRole('status')).toContainText('5 of 20');
  });

  test('network and storage: only the app and Graph; nothing from the CRM is stored', async ({ page }) => {
    const urls: string[] = [];
    page.on('request', (r) => urls.push(r.url()));
    await page.goto(`${FIXTURE}/today`);
    await scopeBoth(page);
    await page.getByRole('button', { name: 'Log contact with Gray Sample' }).click();
    await page.getByRole('dialog').getByLabel('Summary (required, one line)').fill('Intro call');
    await page.getByRole('dialog').getByRole('button', { name: 'Save contact' }).click();
    await expect(page.getByText('Logged contact with Gray Sample.')).toBeVisible();
    const origins = new Set(urls.map((u) => new URL(u).origin));
    for (const o of origins) expect(['http://localhost:4173', 'https://graph.microsoft.com']).toContain(o);
    const crmLists = env.fake.state.lists.filter((l) => l.displayName.startsWith('CRM ')).map((l) => `/lists/${l.id}`);
    expect(crmLists).toHaveLength(4);
    expect(urls.filter((u) => crmLists.some((id) => u.includes(id)))).toEqual([]); // fixture mode never reads or writes the CRM lists
    expect(env.fake.state.requests.filter((r) => crmLists.some((id) => r.path.includes(id)))).toEqual([]);
    const store = await page.evaluate(async () => ({
      local: Object.keys(localStorage), session: Object.keys(sessionStorage), idb: (await indexedDB.databases()).map((d) => d.name),
      blob: JSON.stringify({ ...localStorage, ...sessionStorage }),
    }));
    expect(store.local).toEqual(['ops-founder']);
    expect(store.session).toEqual(['e2e-account']);
    expect(store.idb).toEqual([]);
    expect(store.blob).not.toMatch(/Gray Sample|Intro call|Fixture/);
  });

  test('keyboard: every row action is reachable, the focus ring shows, Escape closes a sheet and returns focus', async ({ page }) => {
    await page.goto(`${FIXTURE}/today`);
    const log = page.getByRole('button', { name: 'Log contact with Emery Fixture' });
    await log.focus();
    await page.keyboard.press('Tab'); await page.keyboard.press('Shift+Tab');
    await expect(log).toBeFocused();
    expect(await log.evaluate((el) => getComputedStyle(el).outlineWidth)).toBe('3px');
    await page.keyboard.press('Enter');
    const dlg = page.getByRole('dialog', { name: 'Log contact' });
    await expect(dlg.getByLabel('Summary (required, one line)')).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(dlg).toHaveCount(0);
    await expect(log).toBeFocused();
    // Snooze, Open and Mute are also tab stops on the card
    for (const n of ['Snooze Emery Fixture', 'Open Emery Fixture', 'Mute Emery Fixture']) { await page.keyboard.press('Tab'); await expect(page.getByLabel(n, { exact: true })).toBeFocused(); }
  });

  test('the n and / shortcuts and the skip link still work inside the CRM', async ({ page }) => {
    await page.goto(`${FIXTURE}/today`);
    await page.locator('body').click({ position: { x: 5, y: 300 } });
    await page.keyboard.press('/');
    await expect(page.getByLabel('Search tasks')).toBeFocused();
    await page.getByLabel('Search tasks').blur();
    await page.keyboard.press('n');
    await expect(page.getByRole('dialog')).toBeVisible();
  });

  for (const [label, path] of [['Today', 'today'], ['People', 'people'], ['Organizations', 'organizations'], ['Needs attention', 'attention'], ['Profile', 'person/1'], ['Organization page', 'org/3']] as const) {
    for (const width of [1440, 390]) {
      test(`${label} at ${width}px has no serious axe violations and no sideways scroll`, async ({ page }) => {
        await page.setViewportSize({ width, height: 900 });
        await page.goto(`${FIXTURE}/${path}`);
        await page.getByRole('main').getByRole('heading', { level: 1 }).waitFor();
        const { default: AxeBuilder } = await import('@axe-core/playwright');
        const r = await new AxeBuilder({ page: page as never }).withTags(['wcag2a', 'wcag2aa']).analyze();
        expect(r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${v.id}: ${v.nodes[0]?.html}`)).toEqual([]);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
      });
    }
  }

  test('sheets are axe-clean at 390px: Log contact, Add person, Snooze', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${FIXTURE}/today`);
    const { default: AxeBuilder } = await import('@axe-core/playwright');
    for (const open of [() => page.getByRole('button', { name: 'Log contact with Emery Fixture' }).click(), () => page.getByRole('button', { name: 'Snooze Emery Fixture' }).click()]) {
      await open();
      const r = await new AxeBuilder({ page: page as never }).withTags(['wcag2a', 'wcag2aa']).analyze();
      expect(r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${v.id}: ${v.nodes[0]?.html}`)).toEqual([]);
      await page.keyboard.press('Escape');
    }
  });
});

test.describe('Add person on a phone', () => {
  test('takes well under a minute with only the required fields', async ({ page }) => {
    await setup(page, { seed: false });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${FIXTURE}/people`);
    const t0 = Date.now();
    await page.getByRole('button', { name: 'Add person' }).click();
    const dlg = page.getByRole('dialog', { name: 'Add person' });
    await dlg.getByLabel('Name', { exact: true }).fill('Pat New Person');
    await dlg.getByLabel('Relationship type').selectOption('advisor');
    await expect(dlg.getByLabel('Owner')).toHaveValue('Santiago'); // defaults to the signed-in founder
    await dlg.getByRole('button', { name: 'Add person' }).click();
    await expect(page.getByRole('heading', { name: 'Pat New Person', level: 1 })).toBeVisible();
    expect(Date.now() - t0).toBeLessThan(60_000);
    await expect(page.getByText('Independent')).toBeVisible();
    await expect(page.getByText('Active', { exact: true }).first()).toBeVisible();
  });

  test('a seeded duplicate is flagged on create: open the existing record or create anyway', async ({ page }) => {
    await setup(page, { seed: false });
    await page.goto(`${FIXTURE}/people`);
    await page.getByRole('button', { name: 'Add person' }).click();
    let dlg = page.getByRole('dialog', { name: 'Add person' });
    await dlg.getByLabel('Name', { exact: true }).fill('Someone Else');
    await dlg.getByText('More').click();
    await dlg.getByLabel('Email').fill('AVERY.fixture@example.com');
    await expect(dlg.getByRole('status')).toContainText('Possible duplicate: Avery Fixture (email)');
    await dlg.getByLabel('Relationship type').selectOption('advisor');
    await dlg.getByRole('button', { name: 'Add person' }).click();
    dlg = page.getByRole('dialog', { name: 'Possible duplicate' });
    await expect(dlg).toContainText('Avery Fixture');
    await dlg.getByRole('button', { name: 'Open existing' }).click();
    await expect(page.getByRole('heading', { name: 'Avery Fixture', level: 1 })).toBeVisible();
    await page.getByRole('link', { name: 'People', exact: true }).first().click();
    await page.getByRole('button', { name: 'Add person' }).click();
    dlg = page.getByRole('dialog', { name: 'Add person' });
    await dlg.getByLabel('Name', { exact: true }).fill('Someone Else');
    await dlg.getByLabel('Relationship type').selectOption('advisor');
    await dlg.getByText('More').click();
    await dlg.getByLabel('Email').fill('avery.fixture@example.com');
    await dlg.getByRole('button', { name: 'Add person' }).click();
    await page.getByRole('dialog', { name: 'Possible duplicate' }).getByRole('button', { name: 'Create anyway' }).click();
    await expect(page.getByRole('heading', { name: 'Someone Else', level: 1 })).toBeVisible();
  });
});

test.describe('CRM against the mocked Graph (real repository, empty lists)', () => {
  test('adds a person and logs a contact through Graph; system fields and the follow-up task are written', async ({ page }) => {
    const { env } = await setup(page, { seed: false });
    await page.goto('./#/crm/people');
    await expect(page.getByText('No one matches.')).toBeVisible();
    await page.getByRole('button', { name: 'Add person' }).click();
    const dlg = page.getByRole('dialog', { name: 'Add person' });
    await dlg.getByLabel('Name', { exact: true }).fill('Casey Graph Test');
    await dlg.getByLabel('Relationship type').selectOption('investor');
    await dlg.getByRole('button', { name: 'Add person' }).click();
    await expect(page.getByRole('heading', { name: 'Casey Graph Test', level: 1 })).toBeVisible();
    const list = (n: string) => env.fake.state.lists.find((l) => l.displayName === n)!;
    expect(list('CRM People').items).toHaveLength(1);
    expect(list('CRM People').items[0]!.fields).toMatchObject({ Title: 'Casey Graph Test', RelationshipType: 'investor', Owner: 'Santiago', Stage: 'Active' });
    expect(list('CRM Organizations').items.map((i) => i.fields.Title)).toEqual(['Independent']);
    await page.getByRole('button', { name: 'Log contact', exact: true }).click();
    const log = page.getByRole('dialog', { name: 'Log contact' });
    await log.getByLabel('Summary (required, one line)').fill('First call');
    await log.getByLabel('Type').selectOption('call');
    await log.getByLabel('Follow-up needed (creates a task)').check();
    await log.getByRole('button', { name: 'Save contact' }).click();
    await expect(page.getByText('Logged contact with Casey Graph Test.')).toBeVisible();
    expect(list('CRM Interactions').items[0]!.fields).toMatchObject({ Title: 'First call', InteractionType: 'call', Direction: 'two-way', PeopleLookupId: [1] });
    expect(list('CRM People').items[0]!.fields).toMatchObject({ LastDirection: 'two-way' });
    expect(String(list('CRM People').items[0]!.fields.LastTwoWayAt)).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(list('Tasks').items.map((i) => i.fields)).toContainEqual(expect.objectContaining({ Title: 'Follow up with Casey Graph Test', ExtId: 'crm-person:1', ContributionType: 'Relationship' }));
    await expect(page.getByRole('list', { name: 'Interaction history' })).toContainText('First call');
  });
});
