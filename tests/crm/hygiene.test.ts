import { describe, expect, it } from 'vitest';
import { csvCell, deletionPreview, interactionsCsv, organizationsCsv, peopleCsv, personExport, toCsv } from '../../src/crm/export.ts';
import { ConflictError, CrmValidationError } from '../../src/crm/graph/repo.ts';
import { defaultChoices, mergedPatch, parseSnapshot, repoint } from '../../src/crm/model/merge.ts';
import { staleSystemFields } from '../../src/crm/model/derived.ts';
import { duplicatePeople } from '../../src/crm/model/dedupe.ts';
import { CRM_INTERACTIONS, CRM_MERGE_LOG, CRM_PEOPLE } from '../../src/crm/schema.ts';
import { loadCrm, type CrmData } from '../../src/crm/service.ts';
import { cfg, fx, person } from './helpers.ts';
import { harnesses, seed } from './repoHelpers.ts';

const byName = (d: CrmData, n: string) => d.people.find((p) => p.name.startsWith(n))!;

describe('merge model', () => {
  const keep = person({ id: 1, name: 'Avery', email: undefined, importance: 5, stage: 'Active', sensitivity: 'Normal' });
  const lose = person({ id: 2, name: 'Avery Dup', email: 'a@example.com', importance: 2, stage: 'Following up', sensitivity: 'Restricted' });
  it('defaults to the surviving record, filling its blanks from the other', () => {
    expect(defaultChoices(keep, lose)).toMatchObject({ name: 'keep', email: 'lose', importance: 'keep', stage: 'keep' });
  });
  it('patches only the fields that change, and the result is never less restrictive', () => {
    expect(mergedPatch(keep, lose, { email: 'lose', stage: 'lose', importance: 'keep' })).toEqual({ email: 'a@example.com', stage: 'Following up', sensitivity: 'Restricted' });
    expect(mergedPatch(keep, person({ ...lose, sensitivity: 'Normal' }), { sensitivity: 'lose' })).toEqual({});
    expect(mergedPatch(keep, lose, { sensitivity: 'keep' }).sensitivity).toBe('Restricted'); // choosing keep cannot loosen it
  });
  it('re-points interactions without duplicates, keeping order', () => {
    expect(repoint([3, 2, 9], 2, 1)).toEqual([3, 1, 9]);
    expect(repoint([1, 2], 2, 1)).toEqual([1]);
  });
  it('reads a snapshot only when it is well formed', () => {
    expect(parseSnapshot('')).toBeNull();
    expect(parseSnapshot('{"v":2}')).toBeNull();
    expect(parseSnapshot(JSON.stringify({ v: 1, kind: 'person', lose: { id: 4 }, links: [], keepBefore: {} }))?.lose.id).toBe(4);
  });
});

describe.each(harnesses)('merge, undo and delete on the %s', (_n, make) => {
  /** Avery plus a duplicate with the same email, a contact of the duplicate alone, and a group contact with both. */
  async function withDuplicate() {
    const h = await make();
    await seed(h.repo);
    let d = await loadCrm(h.repo);
    const avery = byName(d, 'Avery');
    const dup = (await h.service.addPerson({ name: 'Avery F.', email: 'avery.fixture@example.com', relationshipType: 'investor', owner: 'Jay', stage: 'Following up', importance: 2, organizationId: avery.organizationId }, d, { allowDuplicate: true })).person!;
    d = await loadCrm(h.repo);
    await h.service.logContact({ personIds: [dup.id], summary: 'Call with the duplicate record', type: 'call', date: '2026-11-22' }, d);
    d = await loadCrm(h.repo);
    await h.service.logContact({ personIds: [avery.id, dup.id], summary: 'Group lunch', type: 'meeting', date: '2026-11-21' }, d);
    d = await loadCrm(h.repo);
    return { h, d, avery: byName(d, 'Avery Fixture'), dup: byName(d, 'Avery F.') };
  }

  it('the duplicate is flagged by the model, then merged: interactions move, fields are chosen, the other record is deleted, a log entry is written', async () => {
    const { h, d, avery, dup } = await withDuplicate();
    expect(duplicatePeople(d.people, cfg).map((x) => [x.a.name, x.b.name, x.reason])).toEqual([['Avery Fixture', 'Avery F.', 'same email']]);
    const { keep, log } = await h.service.mergePeople(avery.id, dup.id, { importance: 'lose', stage: 'keep' }, d, 'Santiago');
    const after = await loadCrm(h.repo);
    expect(after.people.find((p) => p.id === dup.id)).toBeUndefined();
    expect(after.people).toHaveLength(20);
    expect(keep).toMatchObject({ importance: 2, stage: 'Following up', lastTwoWayAt: '2026-11-22', lastDirection: 'two-way' });
    expect(after.interactions.find((i) => i.summary === 'Call with the duplicate record')!.peopleIds).toEqual([avery.id]);
    expect(after.interactions.find((i) => i.summary === 'Group lunch')!.peopleIds).toEqual([avery.id]); // both were in it: no duplicate entry
    expect(after.interactions.some((i) => i.peopleIds.includes(dup.id))).toBe(false);
    expect(staleSystemFields(after.people, after.interactions)).toEqual([]);
    expect(log).toMatchObject({ title: 'Merged Avery F. into Avery Fixture', kind: 'person', mergedIntoId: avery.id, mergedBy: 'Santiago', undone: false });
    expect(parseSnapshot(log.snapshot)!.links).toHaveLength(2);
    expect(after.mergeLog).toHaveLength(1);
  });

  it('Undo merge restores both records and their interactions', async () => {
    const { h, d, avery, dup } = await withDuplicate();
    const before = { avery: { ...avery }, dupName: dup.name };
    const { log } = await h.service.mergePeople(avery.id, dup.id, { importance: 'lose', stage: 'lose', email: 'keep' }, d, 'Jay');
    const merged = await loadCrm(h.repo);
    const { restored } = await h.service.undoMerge(log.id, merged);
    const after = await loadCrm(h.repo);
    expect(after.people).toHaveLength(21);
    expect(restored.name).toBe(before.dupName);
    expect(restored.id).not.toBe(dup.id); // recreated, new item id
    expect(restored).toMatchObject({ email: 'avery.fixture@example.com', importance: 2, stage: 'Following up', owner: 'Jay', lastTwoWayAt: '2026-11-22' });
    expect(after.people.find((p) => p.id === avery.id)).toMatchObject({ importance: before.avery.importance, stage: before.avery.stage });
    expect(after.interactions.find((i) => i.summary === 'Call with the duplicate record')!.peopleIds).toEqual([restored.id]);
    expect(after.interactions.find((i) => i.summary === 'Group lunch')!.peopleIds.sort()).toEqual([avery.id, restored.id].sort());
    expect(staleSystemFields(after.people, after.interactions)).toEqual([]);
    const entry = after.mergeLog.find((e) => e.id === log.id)!;
    expect(entry).toMatchObject({ undone: true, snapshot: '' }); // no personal data kept once undone
    await expect(h.service.undoMerge(log.id, after)).rejects.toThrow(/already undone/);
  });

  it('refuses nonsense and writes nothing when a record changed', async () => {
    const { h, d, avery, dup } = await withDuplicate();
    await expect(h.service.mergePeople(avery.id, avery.id, {}, d, 'Jay')).rejects.toBeInstanceOf(CrmValidationError);
    await expect(h.service.mergePeople(avery.id, 9999, {}, d, 'Jay')).rejects.toThrow(/no longer exists/);
    h.touch(CRM_PEOPLE, dup.id);
    await expect(h.service.mergePeople(avery.id, dup.id, {}, d, 'Jay')).rejects.toBeInstanceOf(ConflictError);
    expect(await h.repo.listAll(CRM_MERGE_LOG)).toHaveLength(0);
    expect((await loadCrm(h.repo)).people).toHaveLength(21);
  });

  it('cannot undo when the surviving record is gone', async () => {
    const { h, d, avery, dup } = await withDuplicate();
    const { log } = await h.service.mergePeople(avery.id, dup.id, {}, d, 'Jay');
    await h.repo.remove(CRM_PEOPLE, avery.id);
    await expect(h.service.undoMerge(log.id, await loadCrm(h.repo))).rejects.toThrow(/no longer exists/);
  });

  it('Delete one person removes them, interactions only they were in, their place in shared ones, and merge snapshots of them', async () => {
    const { h, d, avery, dup } = await withDuplicate();
    const pv = deletionPreview(dup.id, d);
    expect([pv.solo.map((i) => i.summary), pv.shared.map((i) => i.summary), pv.mergeLogs]).toEqual([['Call with the duplicate record'], ['Group lunch'], []]);
    const r = await h.service.deletePerson(dup.id, d);
    expect(r).toEqual({ interactionsDeleted: 1, interactionsUpdated: 1, mergeLogsDeleted: 0 });
    const after = await loadCrm(h.repo);
    expect(after.people.find((p) => p.id === dup.id)).toBeUndefined();
    expect(after.interactions.find((i) => i.summary === 'Call with the duplicate record')).toBeUndefined();
    expect(after.interactions.find((i) => i.summary === 'Group lunch')!.peopleIds).toEqual([avery.id]);
    expect(after.interactions).toHaveLength(d.interactions.length - 1);
    // merge snapshots of the surviving person are purged with them
    const d2 = await loadCrm(h.repo);
    const third = (await h.service.addPerson({ name: 'Avery Third', email: 'avery.fixture@example.com', relationshipType: 'investor', owner: 'Jay', organizationId: avery.organizationId }, d2, { allowDuplicate: true })).person!;
    await h.service.mergePeople(avery.id, third.id, {}, await loadCrm(h.repo), 'Jay');
    const d3 = await loadCrm(h.repo);
    expect(d3.mergeLog).toHaveLength(1);
    expect(deletionPreview(avery.id, d3).mergeLogs).toHaveLength(1);
    expect((await h.service.deletePerson(avery.id, d3)).mergeLogsDeleted).toBe(1);
    expect(await h.repo.listAll(CRM_MERGE_LOG)).toHaveLength(0);
    expect((await h.repo.listAll(CRM_INTERACTIONS)).every((r) => !(r.fields.PeopleLookupId as number[]).includes(avery.id))).toBe(true);
  });

  it('delete refuses a stale record', async () => {
    const { h, d, dup } = await withDuplicate();
    h.touch(CRM_PEOPLE, dup.id);
    await expect(h.service.deletePerson(dup.id, d)).rejects.toBeInstanceOf(ConflictError);
  });
});

describe('exports', () => {
  const data: CrmData = { orgs: fx.orgs, people: fx.people, interactions: fx.interactions.map((i) => ({ ...i })), mergeLog: [] };
  it('csv cells are quoted and cannot start a formula', () => {
    expect(csvCell('a,"b"\nc')).toBe('"a,""b""\nc"');
    expect(csvCell('=SUM(A1)')).toBe("'=SUM(A1)");
    expect(csvCell('@x')).toBe("'@x");
    expect(csvCell(undefined)).toBe('');
    expect(csvCell(false)).toBe('false');
    expect(toCsv(['a', 'b'], [[1, 'x,y']])).toBe('a,b\r\n1,"x,y"\r\n');
  });
  it('the people csv leaves out Restricted people unless included', () => {
    const lines = peopleCsv(data).trim().split('\r\n');
    expect(lines[0]).toBe('id,name,organization,relationship_type,owner,email,importance,comfort,agreed_check_in,stage,sensitivity,last_two_way_at,last_touch_at,last_direction,source_id');
    expect(lines).toHaveLength(20); // header plus 19
    expect(peopleCsv(data)).not.toContain('Oakley Example');
    expect(peopleCsv(data, { includeRestricted: true }).trim().split('\r\n')).toHaveLength(21);
    expect(peopleCsv(data)).toContain('1,Avery Fixture,Example Capital,investor,Santiago,avery.fixture@example.com,5,,,Following up,Normal,2026-11-09,2026-11-20,two-way,');
  });
  it('the interactions csv leaves out Restricted interactions and names people', () => {
    const all = interactionsCsv(data, { includeRestricted: true }).trim().split('\r\n');
    const some = interactionsCsv(data).trim().split('\r\n');
    expect(all).toHaveLength(41);
    expect(some).toHaveLength(40); // one interaction involves the Restricted person
    expect(some.join('\n')).not.toContain('Call with a restricted contact');
    expect(some.join('\n')).toContain(',Avery Fixture; Blake Sample; Finley Demo; Harper Fixture; Quinn Demo,');
  });
  it('the organizations csv lists every organization', () => {
    expect(organizationsCsv(data).trim().split('\r\n')).toHaveLength(5);
  });
  it('the one-person export is complete and names nobody else', () => {
    const avery = fx.people.find((p) => p.name === 'Avery Fixture')!;
    const x = personExport({ ...avery, etag: '"1,1"' } as typeof avery, data, new Date('2026-11-23T17:00:00Z'));
    expect(x.person).not.toHaveProperty('etag');
    expect(x.person).toMatchObject({ name: 'Avery Fixture', email: 'avery.fixture@example.com', importance: 5, stage: 'Following up', lastTwoWayAt: '2026-11-09' });
    expect(x.organization).toMatchObject({ name: 'Example Capital', type: undefined });
    expect(x.interactions).toHaveLength(7);
    expect(x.interactions[0]).toMatchObject({ date: '2026-11-20', type: 'broadcast', otherParticipants: 4 });
    expect(JSON.stringify(x)).not.toContain('Blake');
    expect(x.exportedAt).toBe('2026-11-23T17:00:00.000Z');
  });
});
