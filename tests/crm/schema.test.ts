import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { applyProvision, planProvision, toGraphColumn } from '../../src/provision/provision.ts';
import { decodeItem, encodeFields } from '../../src/graph/codec.ts';
import { CRM_INTERACTIONS, CRM_LISTS, CRM_MERGE_LOG, CRM_ORGANIZATIONS, CRM_PEOPLE, crmListDef, STAGES } from '../../src/crm/schema.ts';
import { creationOrder, DENY_PATTERN, LISTS, validateSchema } from '../../src/schema/lists.ts';
import { makeEnv } from '../helpers.ts';

const col = (list: string, name: string) => crmListDef(list).columns.find((c) => c.name === name)!;

describe('CRM list schemas (context section 4)', () => {
  it('are valid and keep deal data out', () => {
    expect(validateSchema(CRM_LISTS)).toEqual([]);
    for (const l of CRM_LISTS) for (const c of l.columns) { expect(c.name).not.toMatch(DENY_PATTERN); for (const v of c.choices ?? []) expect(v).not.toMatch(DENY_PATTERN); }
  });
  it('have the four names and none clashes with a Phase 1 list', () => {
    expect(CRM_LISTS.map((l) => l.name)).toEqual(['CRM Organizations', 'CRM People', 'CRM Interactions', 'CRM Merge Log']);
    for (const l of CRM_LISTS) expect(LISTS.some((x) => x.name === l.name)).toBe(false);
  });
  it('People has 10 user fields (4 required plus Stage) and the system fields', () => {
    const names = crmListDef(CRM_PEOPLE).columns.map((c) => c.name);
    expect(names).toEqual(['Organization', 'RelationshipType', 'Owner', 'Email', 'Importance', 'Comfort', 'AgreedCheckIn', 'Stage', 'Sensitivity', 'LastTwoWayAt', 'LastTouchAt', 'LastDirection', 'SourceId']);
    expect(names.slice(0, 9)).toHaveLength(9); // user fields besides Title: 9, plus Title = 10
    expect(crmListDef(CRM_PEOPLE).columns.filter((c) => c.required).map((c) => c.name)).toEqual(['Organization', 'RelationshipType', 'Owner', 'Stage']);
  });
  it('Stage has the 13 values, with Paused folded into Dormant', () => {
    expect(STAGES).toHaveLength(13);
    expect(STAGES).not.toContain('Paused');
    expect(col(CRM_PEOPLE, 'Stage').default).toBe('Active');
  });
  it('Interactions: two lookups only, People allows several, direction and date required', () => {
    const lookups = crmListDef(CRM_INTERACTIONS).columns.filter((c) => c.type === 'lookup');
    expect(lookups.map((c) => c.name)).toEqual(['People', 'Organization']);
    expect(col(CRM_INTERACTIONS, 'People').multiple).toBe(true);
    expect(col(CRM_INTERACTIONS, 'Organization').multiple).toBeUndefined();
    for (const n of ['Date', 'InteractionType', 'Direction', 'People']) expect(col(CRM_INTERACTIONS, n).required).toBe(true);
    expect(col(CRM_INTERACTIONS, 'InteractionType').choices).toContain('broadcast');
  });
  it('People uses one lookup; Importance and Comfort are 1 to 5', () => {
    expect(crmListDef(CRM_PEOPLE).columns.filter((c) => c.type === 'lookup')).toHaveLength(1);
    expect(toGraphColumn(col(CRM_PEOPLE, 'Importance'), new Map())).toMatchObject({ number: { minimum: 1, maximum: 5 } });
  });
  it('creation order puts lookup targets first', () => {
    const order = creationOrder(CRM_LISTS).map((l) => l.name);
    expect(order.indexOf(CRM_ORGANIZATIONS)).toBeLessThan(order.indexOf(CRM_PEOPLE));
    expect(order.indexOf(CRM_PEOPLE)).toBeLessThan(order.indexOf(CRM_INTERACTIONS));
  });
  it('docs/crm/lists is up to date: run npm run crm:schemas if this fails', () => {
    for (const l of CRM_LISTS) {
      const file = l.name.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '.json';
      expect(JSON.parse(readFileSync(new URL(`../../docs/crm/lists/${file}`, import.meta.url), 'utf8'))).toEqual(l);
    }
  });
});

describe('provisioning the CRM lists', () => {
  it('creates four lists with required, multi-lookup and number bounds, then plans nothing', async () => {
    const { client, store, fake } = makeEnv();
    const sid = await store.siteId();
    await applyProvision(client, await planProvision(client, sid, CRM_LISTS));
    expect(fake.state.lists.map((l) => l.displayName)).toEqual(['CRM Organizations', 'CRM People', 'CRM Interactions', 'CRM Merge Log']);
    const inter = fake.state.lists.find((l) => l.displayName === CRM_INTERACTIONS)!;
    expect((inter.columns.find((c) => c.name === 'People')!.lookup as { allowMultipleValues: boolean }).allowMultipleValues).toBe(true);
    expect((inter.columns.find((c) => c.name === 'Organization')!.lookup as { allowMultipleValues: boolean }).allowMultipleValues).toBe(false);
    expect(inter.columns.find((c) => c.name === 'Direction')!.required).toBe(true);
    const people = fake.state.lists.find((l) => l.displayName === CRM_PEOPLE)!;
    expect(people.columns.find((c) => c.name === 'Email')!.indexed).toBe(true);
    expect((await planProvision(client, sid, CRM_LISTS)).changes).toBe(0);
  });
  it('leaves every Phase 1 list exactly as it was', async () => {
    const { client, store, fake } = makeEnv();
    const sid = await store.siteId();
    await applyProvision(client, await planProvision(client, sid, LISTS));
    fake.seed('Tasks', { Title: 'Existing task', Status: 'Next' });
    const before = JSON.stringify(fake.state.lists);
    const writes = fake.state.requests.length;
    await applyProvision(client, await planProvision(client, sid, CRM_LISTS));
    const after = fake.state.lists.filter((l) => !l.displayName.startsWith('CRM '));
    expect(JSON.stringify(after)).toBe(before);
    const mutating = fake.state.requests.slice(writes).filter((r) => r.method !== 'GET');
    expect(mutating.every((r) => r.method === 'POST')).toBe(true); // creates only: no PATCH, no DELETE
  });
});

const ODATA = '@odata.type';
describe('codec: multi-lookup and eTag', () => {
  const def = crmListDef(CRM_INTERACTIONS);
  it('encodes a multi-lookup as a collection and a single lookup as a number', () => {
    expect(encodeFields(def, { Title: 'x', PeopleLookupId: [1, 2], OrganizationLookupId: 3 })).toEqual({
      Title: 'x', PeopleLookupId: [1, 2], ['PeopleLookupId' + ODATA]: 'Collection(Edm.Int32)', OrganizationLookupId: 3,
    });
  });
  it('decodes a multi-lookup to an array and keeps the item eTag', () => {
    const d = decodeItem<{ PeopleLookupId?: number[]; OrganizationLookupId?: number }>(def, { id: '7', eTag: '"7,3"', fields: { Title: 't', PeopleLookupId: ['1', 2], OrganizationLookupId: '4' } });
    expect(d).toMatchObject({ id: 7, _etag: '"7,3"', PeopleLookupId: [1, 2], OrganizationLookupId: 4 });
  });
  it('merge log snapshots may hold any JSON text', () => {
    expect(encodeFields(crmListDef(CRM_MERGE_LOG), { Title: 'Merged', Snapshot: '{"a":1}', Undone: false })).toMatchObject({ Snapshot: '{"a":1}', Undone: false });
  });
});
