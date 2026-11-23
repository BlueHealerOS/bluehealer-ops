import { expect, test } from '@playwright/test';
import { setup } from './support';

const row = (o: Record<string, unknown>) => ({ import_id: 'IMP-901', trello_card_id: 'card901', trello_list: 'Triage', title_original: '[Fictional] Draft the plan', title_proposed: 'Draft the plan', proposed_home: 'Task', status_suggested: 'Inbox', owner: 'Santiago', owner_signals: 'member:Santiago', sensitivity: 'normal', note: 'Next step.', flags: '', mapping_confidence: 'high', ...o });
const data = {
  records: [row({}), row({ import_id: 'IMP-902', trello_card_id: 'card902', title_original: 'Fictional restricted card', title_proposed: 'Review the fictional pack', sensitivity: 'restricted', note: '', owner: 'Unassigned' })],
  events: [row({ import_id: 'IMP-903', trello_card_id: 'card903', proposed_home: 'Event', event_type: 'Travel', start_date: '2026-12-08', note: '' })],
};

test('Settings leads to lists and imports, where the curated dataset shows a dry run, then loads Proposed items once', async ({ page }) => {
  const { env } = await setup(page, { seed: false });
  await page.goto('./#/settings');
  await page.getByRole('link', { name: 'Open lists and imports' }).click();
  await expect(page.getByRole('heading', { name: 'Seed and one-time imports' })).toBeVisible();

  await page.getByLabel('Curated Trello dataset (JSON, records and events)').setInputFiles({ name: 'fictional.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(data)) });
  const dry = page.getByRole('region', { name: 'Curated import dry run' });
  await expect(dry.getByText('toCreate: 3')).toBeVisible();
  await expect(dry.getByText('Sensitivity restricted: 1')).toBeVisible();
  expect(await env.store.items('Intake')).toHaveLength(0); // dry run wrote nothing

  await dry.getByRole('button', { name: 'Import now' }).click();
  await expect(page.getByRole('status')).toContainText('Imported 3 Intake items and 3 staging rows');
  expect(await env.store.items('Intake')).toHaveLength(3);
  expect(await env.store.items('ImportStaging')).toHaveLength(3);

  await page.getByLabel('Curated Trello dataset (JSON, records and events)').setInputFiles({ name: 'fictional.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(data)) });
  await expect(page.getByRole('region', { name: 'Curated import dry run' }).getByText('toCreate: 0')).toBeVisible();
});

test('a file with a currency figure is refused with a clear message', async ({ page }) => {
  await setup(page, { seed: false });
  await page.goto('./#/admin');
  const bad = { records: [row({ note: 'Costs $5000' })] };
  await page.getByLabel('Curated Trello dataset (JSON, records and events)').setInputFiles({ name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(bad)) });
  await expect(page.getByRole('status')).toContainText('Import blocked');
});
