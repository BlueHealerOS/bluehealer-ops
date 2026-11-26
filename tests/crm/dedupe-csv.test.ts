import { describe, expect, it } from 'vitest';
import { parseCsv, peopleFromCsv } from '../../src/crm/model/csv.ts';
import { duplicateOrgs, duplicatePeople, findPersonDuplicates, normalizeDomain, normalizeEmail, normalizeName } from '../../src/crm/model/dedupe.ts';
import { cfg, person } from './helpers.ts';

describe('normalizing', () => {
  it('names: case, accents, punctuation, titles, Last, First', () => {
    expect(normalizeName('Dr. Ana  Pérez, MD')).toBe(normalizeName('ana perez'));
    expect(normalizeName('Fixture, Avery')).toBe('avery fixture');
  });
  it('emails: lowercase, placeholders ignored', () => {
    expect(normalizeEmail('  A.B@Example.com ', cfg)).toBe('a.b@example.com');
    expect(normalizeEmail('noreply@example.com', cfg)).toBeUndefined();
    expect(normalizeEmail('n/a', cfg)).toBeUndefined();
    expect(normalizeEmail('', cfg)).toBeUndefined();
  });
  it('domains: scheme, www and path removed', () => expect(normalizeDomain('https://www.Foo.example.com/about')).toBe('foo.example.com'));
});

describe('people duplicates', () => {
  const people = [person({ id: 1, name: 'Avery Fixture', email: 'a@example.com', organizationId: 1 }), person({ id: 2, name: 'Blake Sample', email: 'b@example.com', organizationId: 2 })];
  it('flags an exact normalized email', () => {
    expect(findPersonDuplicates({ name: 'Someone Else', email: 'A@EXAMPLE.com' }, people, cfg)).toEqual([{ id: 1, name: 'Avery Fixture', reason: 'email' }]);
  });
  it('flags the same name in the same organization, not in another', () => {
    expect(findPersonDuplicates({ name: 'avery fixture', organizationId: 1 }, people, cfg)).toHaveLength(1);
    expect(findPersonDuplicates({ name: 'avery fixture', organizationId: 2 }, people, cfg)).toHaveLength(0);
  });
  it('never matches two placeholder emails', () => {
    const ps = [person({ id: 1, name: 'One', email: 'noreply@example.com' }), person({ id: 2, name: 'Two', email: 'noreply@example.com' })];
    expect(duplicatePeople(ps, cfg)).toHaveLength(0);
  });
  it('lists existing pairs once', () => {
    const ps = [person({ id: 1, name: 'Same Name', organizationId: 1 }), person({ id: 2, name: 'Same Name', organizationId: 1 }), person({ id: 3, name: 'Same Name', organizationId: 2 })];
    const d = duplicatePeople(ps, cfg);
    expect(d).toHaveLength(1);
    expect(d[0]!.suggestionOnly).toBe(false);
  });
});

describe('organization duplicates', () => {
  it('suggests same domain, but not for shared domains', () => {
    const orgs = [{ id: 1, name: 'A', domain: 'x.example.com' }, { id: 2, name: 'B', domain: 'https://www.x.example.com' }, { id: 3, name: 'C', domain: 'shared-hospital.example.com' }, { id: 4, name: 'D', domain: 'shared-hospital.example.com' }];
    const d = duplicateOrgs(orgs, cfg);
    expect(d).toHaveLength(1);
    expect(d[0]).toMatchObject({ suggestionOnly: true, reason: 'same domain' });
  });
});

describe('csv', () => {
  it('parses quotes, commas, doubled quotes and CRLF', () => {
    expect(parseCsv('a,"b,c","d ""e"""\r\n1,2,3\r\n')).toEqual([['a', 'b,c', 'd "e"'], ['1', '2', '3']]);
  });
  const HEAD = 'name,organization,relationship type,owner,importance,last two-way date,agreed date,stage\n';
  it('reads the pilot columns into people', () => {
    const { people, orgNames } = peopleFromCsv(HEAD + 'Avery Fixture,Example Capital,investor,Santiago,5,2026-11-09,,Following up\nBlake Sample,,advisor,Jay,,,2026-12-01,Active\n');
    expect(people).toHaveLength(2);
    expect(people[0]).toMatchObject({ importance: 5, lastTwoWayAt: '2026-11-09', stage: 'Following up' });
    expect(people[1]).toMatchObject({ agreedCheckIn: '2026-12-01' });
    expect(orgNames.get(people[1]!.organizationId)).toBe('Independent');
  });
  it.each([
    ['owner', 'A,O,investor,Nobody,3,,,Active'],
    ['stage', 'A,O,investor,Jay,3,,,Mystery'],
    ['date', 'A,O,investor,Jay,3,11/09/2026,,Active'],
    ['importance', 'A,O,investor,Jay,9,,,Active'],
  ])('rejects a bad %s with the line number', (_n, row) => expect(() => peopleFromCsv(HEAD + row)).toThrow(/Line 2/));
  it('rejects missing columns', () => expect(() => peopleFromCsv('name,stage\nA,Active')).toThrow(/Missing columns/));
});
