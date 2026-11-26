import { describe, expect, it } from 'vitest';
import { ConflictError, CrmValidationError } from '../../src/crm/graph/repo.ts';
import { interactionFromRow, interactionToFields, orgFromRow, personFromRow } from '../../src/crm/graph/mappers.ts';
import { CRM_INTERACTIONS, CRM_MERGE_LOG, CRM_ORGANIZATIONS, CRM_PEOPLE } from '../../src/crm/schema.ts';
import { loadCrm } from '../../src/crm/service.ts';
import { fx } from './helpers.ts';
import { harnesses, seed } from './repoHelpers.ts';

describe.each(harnesses)('CrmRepo contract: %s', (_name, make) => {
  it('creates, reads back and lists with dates, numbers and lookups intact', async () => {
    const h = await make();
    const o = await h.repo.create(CRM_ORGANIZATIONS, { Title: 'Example Org', OrgType: 'other' });
    const p = await h.repo.create(CRM_PEOPLE, { Title: 'Test Person', OrganizationLookupId: o.id, RelationshipType: 'advisor', Owner: 'Jay', Importance: 4, AgreedCheckIn: '2026-12-01', Stage: 'Active' });
    expect(p.etag).toBeTruthy();
    expect((await h.repo.get(CRM_PEOPLE, p.id))!.fields).toMatchObject({ Title: 'Test Person', OrganizationLookupId: o.id, Importance: 4, AgreedCheckIn: '2026-12-01' });
    expect((await h.repo.listAll(CRM_PEOPLE)).map((r) => r.id)).toEqual([p.id]);
    expect(await h.repo.get(CRM_PEOPLE, 999)).toBeUndefined();
  });
  it('round-trips a multi-person interaction', async () => {
    const h = await make();
    const r = await h.repo.create(CRM_INTERACTIONS, interactionToFields({ summary: 'Group call', date: '2026-11-01', type: 'call', direction: 'two-way', peopleIds: [3, 5], organizationId: 2 }));
    expect(interactionFromRow((await h.repo.get(CRM_INTERACTIONS, r.id))!)).toMatchObject({ summary: 'Group call', peopleIds: [3, 5], organizationId: 2, type: 'call' });
  });
  it('gives a new eTag after each write and clears a field with null', async () => {
    const h = await make();
    const r = await h.repo.create(CRM_PEOPLE, { Title: 'A', Stage: 'Active', AgreedCheckIn: '2026-12-01' });
    const r2 = await h.repo.update(CRM_PEOPLE, r.id, r.etag, { Stage: 'Dormant', AgreedCheckIn: null });
    expect(r2.etag).not.toBe(r.etag);
    expect(r2.fields.Stage).toBe('Dormant');
    expect(r2.fields.AgreedCheckIn).toBeUndefined();
  });
  it('raises ConflictError for a stale eTag and leaves the record unchanged', async () => {
    const h = await make();
    const r = await h.repo.create(CRM_PEOPLE, { Title: 'A', Stage: 'Active' });
    h.touch(CRM_PEOPLE, r.id); // another founder saved
    await expect(h.repo.update(CRM_PEOPLE, r.id, r.etag, { Stage: 'Dormant' })).rejects.toBeInstanceOf(ConflictError);
    await expect(h.repo.update(CRM_PEOPLE, r.id, r.etag, { Stage: 'Dormant' })).rejects.toThrow('This record changed. Reload to see the update.');
    expect((await h.repo.get(CRM_PEOPLE, r.id))!.fields.Stage).toBe('Active');
    const fresh = (await h.repo.get(CRM_PEOPLE, r.id))!;
    expect((await h.repo.update(CRM_PEOPLE, r.id, fresh.etag, { Stage: 'Dormant' })).fields.Stage).toBe('Dormant');
  });
  it('deletes an item', async () => {
    const h = await make();
    const r = await h.repo.create(CRM_PEOPLE, { Title: 'A' });
    await h.repo.remove(CRM_PEOPLE, r.id);
    expect(await h.repo.get(CRM_PEOPLE, r.id)).toBeUndefined();
  });
  it('refuses currency figures in text, but not in merge snapshots (D27)', async () => {
    const h = await make();
    await expect(h.repo.create(CRM_PEOPLE, { Title: 'Wants $5,000 deal' })).rejects.toBeInstanceOf(CrmValidationError);
    await expect(h.repo.create(CRM_INTERACTIONS, { Title: 'Note', SourceLink: '$1m' })).rejects.toBeInstanceOf(CrmValidationError);
    await expect(h.repo.create(CRM_MERGE_LOG, { Title: 'Merged', Kind: 'person', Snapshot: '{"note":"$5"}' })).resolves.toBeTruthy();
  });
  it('creates a follow-up task, or says there is no Tasks list', async () => {
    const h = await make();
    const t = { Title: 'Follow up with A', Status: 'Next', Priority: 'P2', DueDate: '2026-11-30', ContributionType: 'Relationship', Owner: 'Jay', ExtId: 'crm-person:1', Source: 'manual' } as const;
    expect(await h.repo.createTask(t)).toEqual({ id: expect.any(Number) });
    h.setTasksList(false);
    expect(await h.repo.createTask(t)).toBeNull();
  });
  it('loads the invented fixtures unchanged through the mappers', async () => {
    const h = await make();
    await seed(h.repo);
    const d = await loadCrm(h.repo);
    const strip = <T extends { etag?: string }>(xs: T[]) => xs.map(({ etag, ...rest }) => { void etag; return rest; });
    expect(strip(d.orgs)).toEqual(fx.orgs);
    expect(strip(d.people)).toEqual(fx.people);
    expect(strip(d.interactions)).toEqual(fx.interactions.map((i) => ({ ...i, sensitivity: 'Normal' }))); // the list default
    expect(orgFromRow({ id: 1, fields: { Title: 'X' } }).name).toBe('X');
    expect(personFromRow({ id: 1, fields: { Title: 'X' } }).sensitivity).toBe('Normal');
  });
});
