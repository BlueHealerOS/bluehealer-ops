import { describe, expect, it } from 'vitest';
import { attention, filterPeople, filtersFromQuery, interactionsOf, interactionsOfOrg, orgPeople, orgSummaries, safeHttpUrl, emptyFilters } from '../../src/crm/ui/viewModel.ts';
import { cfg, fx } from './helpers.ts';

const names = (xs: { name: string }[]) => xs.map((x) => x.name);

describe('people filters', () => {
  it('searches name, organization and email, case-insensitively', () => {
    expect(names(filterPeople(fx.people, fx.orgs, { ...emptyFilters(), search: 'AVERY' }))).toEqual(['Avery Fixture']);
    expect(filterPeople(fx.people, fx.orgs, { ...emptyFilters(), search: 'fixture devices' })).toHaveLength(5);
    expect(names(filterPeople(fx.people, fx.orgs, { ...emptyFilters(), search: 'sage.example@' }))).toEqual(['Sage Example']);
  });
  it('combines filters with AND and sorts by name', () => {
    const r = filterPeople(fx.people, fx.orgs, { ...emptyFilters(), relationshipType: 'investor', owner: 'Santiago' });
    expect(names(r)).toEqual(['Avery Fixture', 'Casey Placeholder', 'Reese Fixture']);
    expect(filterPeople(fx.people, fx.orgs, { ...emptyFilters(), stage: 'Dormant' })).toHaveLength(1);
    expect(names(filterPeople(fx.people, fx.orgs, { ...emptyFilters(), importance: 1 }))).toEqual(['Jordan Fixture']);
    expect(filterPeople(fx.people, fx.orgs, { ...emptyFilters(), organizationId: 1 })).toHaveLength(5);
  });
  it('reads the earlier investor view redirect', () => {
    expect(filtersFromQuery('relationship=investor').relationshipType).toBe('investor');
    expect(filtersFromQuery('x=1')).toEqual(emptyFilters());
  });
});

describe('organizations', () => {
  it('summarizes people and the latest two-way contact', () => {
    const s = orgSummaries(fx.orgs, fx.people);
    expect(s.map((x) => [x.org.name, x.people])).toEqual([['Example Capital', 5], ['Example Health System', 6], ['Fixture Devices Inc', 5], ['Independent', 4]]);
    expect(s[0]!.lastContact).toBe('2026-11-17');
    expect(orgSummaries(fx.orgs, fx.people, 'x')).toEqual([]);
  });
  it('lists an organization\'s people by importance, then recent contact', () => {
    const devices = fx.orgs.find((o) => o.name === 'Fixture Devices Inc')!;
    expect(names(orgPeople(devices, fx.people))[0]).toBe('Gray Sample'); // importance 5
  });
  it('collects interactions newest first for a person and an organization', () => {
    const avery = fx.people.find((p) => p.name === 'Avery Fixture')!;
    const mine = interactionsOf(avery.id, fx.interactions);
    expect(mine[0]!.date >= mine.at(-1)!.date).toBe(true);
    expect(mine.every((i) => i.peopleIds.includes(avery.id))).toBe(true);
    const org = interactionsOfOrg(1, fx.people, fx.interactions);
    expect(org.length).toBeGreaterThan(mine.length - 1);
  });
});

describe('safeHttpUrl', () => {
  it('allows web links only', () => {
    expect(safeHttpUrl('https://example.com/a')).toBe('https://example.com/a');
    expect(safeHttpUrl('javascript:alert(1)')).toBeUndefined();
    expect(safeHttpUrl('not a url')).toBeUndefined();
    expect(safeHttpUrl(undefined)).toBeUndefined();
  });
});

describe('needs attention', () => {
  const a = attention(fx.people, fx.interactions, '2026-11-23', cfg);
  it('lists people with no interaction and ones without a check-in date', () => {
    expect(names(a.noInteraction).sort()).toEqual(['Casey Placeholder', 'Gray Sample', 'Lane Example', 'Parker Fixture']);
    expect(names(a.noCheckInDate).sort()).toEqual(['Casey Placeholder', 'Parker Fixture']);
  });
  it('lists restricted people, people without an email and no stale fields in the fixtures', () => {
    expect(names(a.restricted)).toEqual(['Oakley Example']);
    expect(a.missingEmail.length).toBe(fx.people.filter((p) => !p.email).length);
    expect(a.stale).toEqual([]);
  });
});
