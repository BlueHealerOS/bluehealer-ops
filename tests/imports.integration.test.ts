import { describe, expect, it } from 'vitest';
import { parseHubExport, planHubImport, planTrelloImport, seedMilestones } from '../src/ui/importRunner';
import type { HubRecord } from '../src/domain/imports';
import type { OrgFull, PersonFull } from '../src/domain/types';
import { provisioned } from './helpers';

const recs: HubRecord[] = [
  { kind: 'company', file: 'Example Clinic.md', fields: { relationship: 'Hospital partner', website: 'https://example.com', owner: 'santiago' } },
  { kind: 'person', file: 'Avery Placeholder.md', fields: { organization: '"[[Example Clinic]]"', relationship: 'Customer discovery', tier: '2', email: 'avery@example.com', 'last-contact': '2026-10-01', owner: 'santiago' } },
  { kind: 'person', file: 'Casey Fictional.md', fields: { organization: '[[Missing Org]]', relationship: 'Scheduling contact', owner: 'shared' } },
];

describe('hub import', () => {
  it('reports a dry run, imports, links people to organizations, and is idempotent', async () => {
    const { store } = await provisioned();
    const plan = await planHubImport(store, recs);
    expect(plan.report).toMatchObject({ create: 3, unresolvedOrgs: 1, unmappedRelationships: 1, tierConverted: 1 });
    expect(await store.items('People')).toHaveLength(0); // dry run wrote nothing
    expect(await plan.run()).toContain('Created 1 organizations and 2 people');
    const [org] = await store.items<OrgFull>('Organizations');
    const people = await store.items<PersonFull>('People');
    const avery = people.find((p) => p.Title === 'Avery Placeholder')!;
    expect(avery).toMatchObject({ OrganizationLookupId: org!.id, Tier: 'B', LastContactSeed: '2026-10-01', RelationshipType: 'customer discovery' });
    expect(people.find((p) => p.Title === 'Casey Fictional')?.OrganizationLookupId).toBeUndefined();
    const again = await planHubImport(store, recs);
    expect(again.report).toMatchObject({ create: 0, unchanged: 3 });
  });
  it('never overwrites a field a founder edited, only fills blanks', async () => {
    const { store } = await provisioned();
    await (await planHubImport(store, recs)).run();
    const avery = (await store.items<PersonFull>('People')).find((p) => p.Title === 'Avery Placeholder')!;
    await store.update('People', avery.id, { Role: 'Edited by founder' });
    const changed: HubRecord[] = [recs[0]!, { ...recs[1]!, fields: { ...recs[1]!.fields, role: 'Hub role', phone: '555-0100' } }, recs[2]!];
    await (await planHubImport(store, changed)).run();
    const after = (await store.items<PersonFull>('People')).find((p) => p.Title === 'Avery Placeholder')!;
    expect(after.Role).toBe('Edited by founder'); // founder's value kept
    expect(after.Phone).toBe('555-0100'); // blank field filled from the hub
  });
  it('rejects a file that is not a hub export', () => {
    expect(() => parseHubExport('{"a":1}')).toThrow(/not a hub export/);
    expect(parseHubExport(JSON.stringify(recs))).toHaveLength(3);
  });
});

describe('trello import and seeds', () => {
  it('imports open cards once', async () => {
    const { store } = await provisioned();
    const x = { lists: [{ id: 'l', name: 'Todo' }], cards: [{ id: '1', name: 'Fictional card', idList: 'l' }] };
    expect((await planTrelloImport(store, x)).report).toMatchObject({ toCreate: 1 });
    await (await planTrelloImport(store, x)).run();
    expect((await planTrelloImport(store, x)).report).toMatchObject({ toCreate: 0, alreadyImported: 1 });
  });
  it('seeds six milestones once, with baseline equal to target', async () => {
    const { store } = await provisioned();
    expect(await seedMilestones(store)).toBe(6);
    expect(await seedMilestones(store)).toBe(0);
    const ms = await store.items<{ TargetDate: string; BaselineDate: string; Labels: string }>('Milestones');
    expect(ms.every((m) => m.TargetDate === '2027-02-26' && m.BaselineDate === '2027-02-26' && m.Labels === 'draft seed')).toBe(true);
  });
});
