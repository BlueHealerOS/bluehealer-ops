import { describe, expect, it } from 'vitest';
import { ConflictError, CrmValidationError } from '../../src/crm/graph/repo.ts';
import { rankToday } from '../../src/crm/model/ranking.ts';
import { staleSystemFields } from '../../src/crm/model/derived.ts';
import { quickSnoozeDates, defaultDirection, mostRestrictive } from '../../src/crm/model/defaults.ts';
import { CRM_INTERACTIONS, CRM_PEOPLE } from '../../src/crm/schema.ts';
import { CrmService, loadCrm } from '../../src/crm/service.ts';
import { cfg } from './helpers.ts';
import { harnesses, seed } from './repoHelpers.ts';

const TODAY = '2026-11-23';
const personNamed = (d: Awaited<ReturnType<typeof loadCrm>>, n: string) => d.people.find((p) => p.name.startsWith(n))!;

describe('defaults', () => {
  it('direction follows the type', () => {
    expect([defaultDirection('call'), defaultDirection('meeting'), defaultDirection('event')]).toEqual(['two-way', 'two-way', 'two-way']);
    expect([defaultDirection('email'), defaultDirection('message'), defaultDirection('broadcast')]).toEqual(['outbound', 'outbound', 'outbound']);
  });
  it('the most restrictive sensitivity wins', () => {
    expect(mostRestrictive(['Normal', 'Restricted', 'Normal'])).toBe('Restricted');
    expect(mostRestrictive([])).toBe('Normal');
  });
  it('quick snooze dates', () => {
    expect(quickSnoozeDates('2026-11-23').map((x) => x.date)).toEqual(['2026-11-30', '2026-12-07', '2026-12-23', '2026-12-01']);
    expect(quickSnoozeDates('2026-01-31')[2]!.date).toBe('2026-02-28');
  });
});

describe.each(harnesses)('CrmService on the %s', (_name, make) => {
  async function fresh(withData = true) {
    const h = await make();
    if (withData) await seed(h.repo);
    return { h, data: () => loadCrm(h.repo) };
  }

  describe('addPerson', () => {
    it('creates with Stage Active and Importance 3 by default, lowercases email, and makes the Independent organization once', async () => {
      const { h, data } = await fresh(false);
      const r1 = await h.service.addPerson({ name: ' Pat Fixture ', relationshipType: 'advisor', owner: 'Jay', email: 'Pat.Fixture@Example.com' }, await data());
      expect(r1.person).toMatchObject({ name: 'Pat Fixture', stage: 'Active', importance: 3, email: 'pat.fixture@example.com', sensitivity: 'Normal', owner: 'Jay' });
      await h.service.addPerson({ name: 'Sam Fixture', relationshipType: 'KOL', owner: 'Jay' }, await data());
      const d = await data();
      expect(d.orgs.filter((o) => o.name === 'Independent')).toHaveLength(1);
      expect(d.people.every((p) => p.organizationId === d.orgs[0]!.id)).toBe(true);
    });
    it('needs only name, relationship type and owner', async () => {
      const { h, data } = await fresh(false);
      await expect(h.service.addPerson({ name: '', relationshipType: 'advisor', owner: 'Jay' }, await data())).rejects.toBeInstanceOf(CrmValidationError);
      await expect(h.service.addPerson({ name: 'A', relationshipType: 'nonsense', owner: 'Jay' }, await data())).rejects.toThrow(/relationship type/);
      await expect(h.service.addPerson({ name: 'A', relationshipType: 'advisor', owner: 'Nobody' as 'Jay' }, await data())).rejects.toThrow(/owner/);
      await expect(h.service.addPerson({ name: 'A', relationshipType: 'advisor', owner: 'Jay', importance: 9 }, await data())).rejects.toThrow(/1 to 5/);
      await expect(h.service.addPerson({ name: 'A', relationshipType: 'advisor', owner: 'Jay', email: 'nope' }, await data())).rejects.toThrow(/email/);
    });
    it('returns possible duplicates without writing, then creates anyway on request', async () => {
      const { h, data } = await fresh();
      const d = await data();
      const r = await h.service.addPerson({ name: 'Someone Else', email: 'AVERY.fixture@example.com', relationshipType: 'advisor', owner: 'Jay' }, d);
      expect(r.person).toBeUndefined();
      expect(r.duplicates).toEqual([{ id: 1, name: 'Avery Fixture', reason: 'email' }]);
      expect((await data()).people).toHaveLength(20);
      const by = await h.service.addPerson({ name: 'avery fixture', organizationId: 1, relationshipType: 'advisor', owner: 'Jay' }, d);
      expect(by.duplicates[0]!.reason).toBe('name and organization');
      const anyway = await h.service.addPerson({ name: 'avery fixture', organizationId: 1, relationshipType: 'advisor', owner: 'Jay' }, d, { allowDuplicate: true });
      expect(anyway.person!.id).toBe(21);
    });
    it('Q3 flag: family and friends default to Restricted only when switched on', async () => {
      const { h, data } = await fresh(false);
      expect((await h.service.addPerson({ name: 'F One', relationshipType: 'family and friends', owner: 'Jay' }, await data())).person!.sensitivity).toBe('Normal');
      const on = new CrmService(h.repo, { ...cfg, familyInvestorsRestricted: true }, () => new Date('2026-11-23T17:00:00Z'));
      expect((await on.addPerson({ name: 'F Two', relationshipType: 'family and friends', owner: 'Jay' }, await data())).person!.sensitivity).toBe('Restricted');
    });
    it('refuses currency figures', async () => {
      const { h, data } = await fresh(false);
      await expect(h.service.addPerson({ name: 'A', relationshipType: 'investor', owner: 'Jay', email: 'a@example.com', sourceId: '$2m' }, await data())).rejects.toThrow(/currency/);
    });
  });

  describe('logContact (acceptance 3 at service level)', () => {
    it('writes the interaction and updates the person, who then leaves the top five', async () => {
      const { h, data } = await fresh();
      const d = await data();
      expect(rankToday(d.people, TODAY, cfg).top.map((r) => r.person.name)).toContain('Blake Sample');
      const blake = personNamed(d, 'Blake');
      const r = await h.service.logContact({ personIds: [blake.id], summary: 'Quick check-in call', type: 'call' }, d);
      expect(r.interaction).toMatchObject({ summary: 'Quick check-in call', date: TODAY, type: 'call', direction: 'two-way', organizationId: blake.organizationId });
      expect(r.people[0]).toMatchObject({ lastTwoWayAt: TODAY, lastTouchAt: TODAY, lastDirection: 'two-way' });
      const after = await data();
      expect(staleSystemFields(after.people, after.interactions)).toEqual([]);
      const top = rankToday(after.people, TODAY, cfg).top.map((x) => x.person.name);
      expect(top).not.toContain('Blake Sample');
      expect(top).toHaveLength(5); // the next person moves up
      expect((await h.repo.listAll(CRM_INTERACTIONS))).toHaveLength(41);
    });
    it('a broadcast moves only LastTouchAt and does not reset the clock (D29)', async () => {
      const { h, data } = await fresh();
      const d = await data();
      const finley = personNamed(d, 'Finley'); // last two-way Sep 1, last touch Nov 20
      const r = await h.service.logContact({ personIds: [finley.id], summary: 'Update newsletter', type: 'broadcast', date: '2026-11-22' }, d);
      expect(r.interaction.direction).toBe('outbound');
      expect(r.people[0]).toMatchObject({ lastTwoWayAt: '2026-09-01', lastTouchAt: '2026-11-22', lastDirection: 'two-way' });
    });
    it('an outbound email sets LastDirection so the person shows under waiting on', async () => {
      const { h, data } = await fresh();
      const d = await data();
      const r = await h.service.logContact({ personIds: [personNamed(d, 'Devon').id], summary: 'Sent the draft', type: 'email', date: '2026-11-10' }, d);
      expect(r.people[0]!.lastTwoWayAt).toBe('2026-11-12'); // an older interaction does not move the clock back
      expect(r.people[0]!.lastDirection).toBe('two-way');
    });
    it('updates every person in a group contact and inherits the most restrictive sensitivity', async () => {
      const { h, data } = await fresh();
      const d = await data();
      const ids = [personNamed(d, 'Oakley').id, personNamed(d, 'Quinn').id]; // Oakley is Restricted
      const r = await h.service.logContact({ personIds: ids, summary: 'Joint session', type: 'meeting' }, d);
      expect(r.interaction.sensitivity).toBe('Restricted');
      expect(r.interaction.peopleIds).toEqual(ids);
      expect(r.people.every((p) => p.lastTwoWayAt === TODAY)).toBe(true);
    });
    it('creates a follow-up task for the first person when asked, linked by ExtId', async () => {
      const { h, data } = await fresh();
      const d = await data();
      const avery = personNamed(d, 'Avery');
      const r = await h.service.logContact({ personIds: [avery.id], summary: 'Asked for the data pack', followUpNeeded: true }, d);
      expect(r.task).toEqual({ id: expect.any(Number) });
      expect(r.interaction.followUpNeeded).toBe(true);
      if ('tasks' in h.repo) expect((h.repo as unknown as { tasks: Record<string, unknown>[] }).tasks[0]).toMatchObject({ Title: 'Follow up with Avery Fixture', Owner: 'Santiago', ExtId: `crm-person:${avery.id}`, ContributionType: 'Relationship', DueDate: '2026-11-30' });
    });
    it('keeps the flag and warns when there is no Tasks list', async () => {
      const { h, data } = await fresh();
      h.setTasksList(false);
      const d = await data();
      const r = await h.service.logContact({ personIds: [d.people[0]!.id], summary: 'Asked for a call', followUpNeeded: true }, d);
      expect(r.task).toBeNull();
      expect(r.warnings[0]).toMatch(/no Tasks list/);
      expect(r.interaction.followUpNeeded).toBe(true);
    });
    it('writes nothing and shows the reload message when a person changed since loading', async () => {
      const { h, data } = await fresh();
      const d = await data();
      const blake = personNamed(d, 'Blake');
      h.touch(CRM_PEOPLE, blake.id); // another founder saved Blake
      const err = await h.service.logContact({ personIds: [blake.id], summary: 'Call', type: 'call' }, d).catch((e) => e);
      expect(err).toBeInstanceOf(ConflictError);
      expect(err.message).toBe('This record changed. Reload to see the update.');
      expect(await h.repo.listAll(CRM_INTERACTIONS)).toHaveLength(40);
      // after reloading, the same log succeeds
      const again = await data();
      await expect(h.service.logContact({ personIds: [blake.id], summary: 'Call', type: 'call' }, again)).resolves.toBeTruthy();
    });
    it('reports a person whose update lost a race after the interaction was written, so Recompute can repair it', async () => {
      const { h, data } = await fresh();
      const d = await data();
      const blake = personNamed(d, 'Blake');
      const real = h.repo.update.bind(h.repo);
      h.repo.update = async (list, id, etag, fields) => { if (list === CRM_PEOPLE) h.touch(CRM_PEOPLE, id); return real(list, id, etag, fields); };
      const r = await h.service.logContact({ personIds: [blake.id], summary: 'Call', type: 'call' }, d);
      expect(r.failed).toHaveLength(1);
      expect(r.failed[0]!.message).toMatch(/Reload to see the update.*Recompute/);
      h.repo.update = real;
      const after = await data();
      expect(staleSystemFields(after.people, after.interactions)).toHaveLength(1);
      expect(await h.service.recompute(after)).toEqual({ updated: 1, failed: [] });
      const healed = await data();
      expect(staleSystemFields(healed.people, healed.interactions)).toEqual([]);
    });
    it('validates input', async () => {
      const { h, data } = await fresh();
      const d = await data();
      const one = d.people[0]!.id;
      const bad = (o: object) => h.service.logContact({ personIds: [one], summary: 'ok', ...o }, d);
      await expect(bad({ summary: '' })).rejects.toThrow(/short summary/);
      await expect(bad({ summary: 'x'.repeat(201) })).rejects.toThrow(/200 characters/);
      await expect(bad({ summary: 'Discussed $50,000 raise' })).rejects.toThrow(/currency/);
      await expect(bad({ date: '2026-11-24' })).rejects.toThrow(/future/);
      await expect(bad({ date: '11/20/2026' })).rejects.toThrow(/valid date/);
      await expect(bad({ type: 'carrier pigeon' })).rejects.toThrow(/type/);
      await expect(bad({ personIds: [] })).rejects.toThrow(/at least one person/);
      await expect(bad({ personIds: [9999] })).rejects.toThrow(/no longer exists/);
      expect(await h.repo.listAll(CRM_INTERACTIONS)).toHaveLength(40);
    });
  });

  describe('snooze and mute', () => {
    it('snooze writes AgreedCheckIn and suppresses the person until then', async () => {
      const { h, data } = await fresh();
      const d = await data();
      const blake = personNamed(d, 'Blake');
      const p = await h.service.snooze(blake, '2026-12-07');
      expect(p.agreedCheckIn).toBe('2026-12-07');
      const after = await data();
      expect(rankToday(after.people, TODAY, cfg).due.map((r) => r.person.name)).not.toContain('Blake Sample');
      await expect(h.service.snooze(p, TODAY)).rejects.toThrow(/after today/);
      await expect(h.service.snooze(p, 'soon')).rejects.toThrow(/after today/);
    });
    it('mute sets Stage Dormant and returns the previous stage for Undo', async () => {
      const { h, data } = await fresh();
      const emery = personNamed(await data(), 'Emery');
      const { person, previousStage } = await h.service.mute(emery);
      expect([person.stage, previousStage]).toEqual(['Dormant', 'Active']);
      expect(rankToday((await data()).people, TODAY, cfg).due.map((r) => r.person.name)).not.toContain('Emery Fixture');
      expect((await h.service.setStage(person, previousStage)).stage).toBe('Active');
    });
    it('a stale record raises ConflictError', async () => {
      const { h, data } = await fresh();
      const p = personNamed(await data(), 'Emery');
      h.touch(CRM_PEOPLE, p.id);
      await expect(h.service.mute(p)).rejects.toBeInstanceOf(ConflictError);
    });
  });

  describe('updatePerson and recompute', () => {
    it('edits founder fields, clears optional ones, and cannot touch system fields', async () => {
      const { h, data } = await fresh();
      const p = personNamed(await data(), 'Harper');
      const u = await h.service.updatePerson(p, { importance: 5, agreedCheckIn: null, comfort: 2 });
      expect(u).toMatchObject({ importance: 5, comfort: 2, lastTwoWayAt: p.lastTwoWayAt });
      expect(u.agreedCheckIn).toBeUndefined();
      expect(await h.service.updatePerson(u, {})).toBe(u);
      await expect(h.service.updatePerson(u, { importance: 0 })).rejects.toThrow(/1 to 5/);
    });
    it('recompute repairs wrong and missing system fields, including ones that should be empty', async () => {
      const { h, data } = await fresh();
      const d = await data();
      const avery = personNamed(d, 'Avery'), casey = personNamed(d, 'Casey');
      await h.repo.update(CRM_PEOPLE, avery.id, undefined, { LastTwoWayAt: '2020-01-01', LastDirection: null });
      await h.repo.update(CRM_PEOPLE, casey.id, undefined, { LastTouchAt: '2026-01-01' }); // Casey has no interactions
      const broken = await data();
      expect(staleSystemFields(broken.people, broken.interactions)).toHaveLength(2);
      expect(await h.service.recompute(broken)).toEqual({ updated: 2, failed: [] });
      const healed = await data();
      expect(staleSystemFields(healed.people, healed.interactions)).toEqual([]);
      expect(personNamed(healed, 'Avery').lastTwoWayAt).toBe('2026-11-09');
      expect(personNamed(healed, 'Casey').lastTouchAt).toBeUndefined();
      expect(await h.service.recompute(healed)).toEqual({ updated: 0, failed: [] });
    });
  });

  it('holds no state between calls: a second service sees the first one\'s writes only after loading', async () => {
    const { h, data } = await fresh();
    const d = await data();
    await h.service.logContact({ personIds: [d.people[0]!.id], summary: 'First' }, d);
    expect(d.interactions).toHaveLength(40);
    expect((await data()).interactions).toHaveLength(41);
  });
});
