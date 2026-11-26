import { describe, expect, it } from 'vitest';
import { parseRankingConfig } from '../../src/crm/model/config.ts';
import { deriveSystemFields, staleSystemFields } from '../../src/crm/model/derived.ts';
import { addWorkingDays, effectiveness } from '../../src/crm/model/effectiveness.ts';
import { indicators } from '../../src/crm/model/indicators.ts';
import { cadenceDays, eligibleForToday, isDue, nextCheckIn, priorityScore, rankToday, reason, waitingLists, waitingOn } from '../../src/crm/model/ranking.ts';
import { cfg, fx, interaction, person } from './helpers.ts';

const T = '2026-11-23';

describe('due and not due', () => {
  it('uses cadence by relationship type', () => {
    expect(cadenceDays(person({ relationshipType: 'investor' }), cfg)).toBe(14);
    expect(cadenceDays(person({ relationshipType: 'KOL' }), cfg)).toBe(30);
    expect(cadenceDays(person({ relationshipType: 'family and friends' }), cfg)).toBe(30);
  });
  it('is due exactly on last two-way plus cadence and not a day earlier', () => {
    const p = person({ relationshipType: 'investor', lastTwoWayAt: '2026-11-09' });
    expect(nextCheckIn(p, T, cfg)).toBe('2026-11-23');
    expect(isDue(p, T, cfg)).toBe(true);
    expect(isDue(p, '2026-11-22', cfg)).toBe(false);
  });
  it('agreed date suppresses until the date, then makes the person due', () => {
    const p = person({ lastTwoWayAt: '2026-09-01', agreedCheckIn: '2026-12-15' });
    expect(isDue(p, T, cfg)).toBe(false);
    expect(nextCheckIn(p, T, cfg)).toBe('2026-12-15');
    expect(isDue(p, '2026-12-15', cfg)).toBe(true);
  });
  it('ignores an agreed date that is not later than the last two-way contact', () => {
    const p = person({ lastTwoWayAt: '2026-11-20', agreedCheckIn: '2026-11-10' });
    expect(nextCheckIn(p, T, cfg)).toBe('2026-12-20');
  });
});

describe('broadcast does not reset the clock (D29)', () => {
  const ints = [interaction({ id: 1, date: '2026-10-01', type: 'meeting' }), interaction({ id: 2, date: '2026-11-20', type: 'broadcast', direction: 'outbound' })];
  it('keeps last two-way at the meeting but moves last touch', () => {
    expect(deriveSystemFields(1, ints)).toEqual({ lastTwoWayAt: '2026-10-01', lastTouchAt: '2026-11-20', lastDirection: 'two-way' });
  });
  it('a person with only broadcasts is still never contacted', () => {
    const f = deriveSystemFields(1, [ints[1]!]);
    expect(f.lastTwoWayAt).toBeUndefined();
    expect(f.lastTouchAt).toBe('2026-11-20');
  });
  it('latest non-broadcast wins; same-day ties go to the later id', () => {
    const f = deriveSystemFields(1, [interaction({ id: 1, date: '2026-11-05', direction: 'outbound' }), interaction({ id: 2, date: '2026-11-05', direction: 'inbound' })]);
    expect(f.lastDirection).toBe('inbound');
  });
  it('flags stored system fields that no longer match', () => {
    const stale = staleSystemFields([person({ lastTwoWayAt: '2026-11-20', lastTouchAt: '2026-11-20', lastDirection: 'two-way' })], ints);
    expect(stale).toHaveLength(1);
    expect(stale[0]!.expected.lastTwoWayAt).toBe('2026-10-01');
  });
});

describe('never contacted', () => {
  it('is due now when Active or an investor from Contacted onward', () => {
    expect(isDue(person({ stage: 'Active' }), T, cfg)).toBe(true);
    expect(isDue(person({ stage: 'Contacted', relationshipType: 'investor' }), T, cfg)).toBe(true);
  });
  it('has no check-in date in Identified or Intro pending', () => {
    expect(nextCheckIn(person({ stage: 'Identified', relationshipType: 'investor' }), T, cfg)).toBeUndefined();
    expect(nextCheckIn(person({ stage: 'Intro pending' }), T, cfg)).toBeUndefined();
    expect(rankToday([person({ stage: 'Intro pending' })], T, cfg).due).toHaveLength(0);
  });
  it('scores as one full cadence of recency', () => {
    expect(priorityScore(person({ importance: 5 }), T, cfg)).toBe(8 * 5 + 20 + 20);
  });
});

describe('eligibility', () => {
  it.each(['Mapped', 'Targeted', 'Dormant', 'Closed', 'Passed', 'Do not contact'] as const)('excludes stage %s', (stage) => {
    expect(eligibleForToday(person({ stage }))).toBe(false);
  });
  it.each(['Active', 'Intro pending', 'Identified', 'Contacted', 'Meeting held', 'Following up', 'Committed'] as const)('includes stage %s', (stage) => {
    expect(eligibleForToday(person({ stage }))).toBe(true);
  });
  it('excludes Restricted people from ranking, waiting on and indicators', () => {
    const p = person({ sensitivity: 'Restricted', relationshipType: 'investor', lastTwoWayAt: '2026-01-01', lastDirection: 'inbound' });
    expect(rankToday([p], T, cfg).due).toHaveLength(0);
    expect(waitingLists([p], T, cfg).waitingOnMe).toHaveLength(0);
    expect(indicators([p], T, cfg).investors).toHaveLength(0);
  });
});

describe('ordering and tie-breaks', () => {
  it('orders by score, then days since contact, then name', () => {
    const a = person({ id: 1, name: 'Zed', importance: 5, relationshipType: 'investor', lastTwoWayAt: '2026-11-09' }); // 80, 14 days
    const b = person({ id: 2, name: 'Amy', importance: 5 }); // never contacted: 80, counts as 30 days
    const c = person({ id: 3, name: 'Bea', importance: 5 }); // same as Amy
    expect(rankToday([a, c, b], T, cfg).due.map((r) => r.person.name)).toEqual(['Amy', 'Bea', 'Zed']);
  });
  it('limits the top list to topN and filters by owner', () => {
    const many = Array.from({ length: 8 }, (_, i) => person({ id: i + 1, name: `P${i}`, owner: i % 2 ? 'Jay' : 'Santiago' }));
    expect(rankToday(many, T, cfg).top).toHaveLength(5);
    expect(rankToday(many, T, cfg, { owner: 'Jay' }).due.every((r) => r.person.owner === 'Jay')).toBe(true);
  });
  it('puts not-due people within 14 days under upcoming by date', () => {
    const near = person({ id: 1, name: 'Near', lastTwoWayAt: '2026-11-10' }); // next Dec 10, 17 days: outside
    const soon = person({ id: 2, name: 'Soon', lastTwoWayAt: '2026-11-01' }); // next Dec 1
    expect(rankToday([near, soon], T, cfg).upcoming.map((r) => r.person.name)).toEqual(['Soon']);
  });
});

describe('reason text', () => {
  it('names importance, days, cadence, due state and last interaction', () => {
    const p = person({ importance: 5, relationshipType: 'investor', lastTwoWayAt: '2026-11-08' });
    expect(reason(p, T, cfg, { summary: 'Coffee, discussed bench data', date: '2026-11-08' })).toBe(
      'Importance 5. 15 days since last two-way contact, cadence 14. Due. Last: Coffee, discussed bench data (Nov 8).',
    );
  });
  it('says so when there has been no contact and when an agreed date has arrived', () => {
    expect(reason(person(), T, cfg)).toBe('Importance 3. No two-way contact yet, cadence 30. Due.');
    expect(reason(person({ lastTwoWayAt: '2026-11-22', agreedCheckIn: '2026-11-23' }), T, cfg)).toContain('Due: the agreed check-in date has arrived.');
  });
});

describe('waiting on', () => {
  it('waits on them only after more than 3 days', () => {
    expect(waitingOn(person({ lastDirection: 'outbound', lastTwoWayAt: '2026-11-20' }), T, cfg)).toBeNull();
    expect(waitingOn(person({ lastDirection: 'outbound', lastTwoWayAt: '2026-11-19' }), T, cfg)).toBe('them');
  });
  it('waits on me when the last contact was inbound', () => {
    expect(waitingOn(person({ lastDirection: 'inbound', lastTwoWayAt: '2026-11-23' }), T, cfg)).toBe('me');
    expect(waitingOn(person({ lastDirection: 'two-way', lastTwoWayAt: '2026-11-01' }), T, cfg)).toBeNull();
  });
});

describe('indicators', () => {
  const inv = (o = {}) => person({ relationshipType: 'investor', stage: 'Following up', lastTwoWayAt: '2026-11-01', ...o });
  it('counts an investor 22 days out and not one at exactly the limit', () => {
    expect(indicators([inv()], T, cfg).investors).toHaveLength(1);
    expect(indicators([inv({ lastTwoWayAt: '2026-11-09' })], T, cfg).investors).toHaveLength(0); // due today, 14 days: not more than 0 past
  });
  it('a future agreed check-in counts as followed up (D26)', () => {
    expect(indicators([inv({ agreedCheckIn: '2026-12-01' })], T, cfg).investors).toHaveLength(0);
  });
  it('uses 30 days for advisors and clinical advisors, and ignores other types', () => {
    const adv = (rel: string, d: string) => person({ relationshipType: rel, lastTwoWayAt: d });
    expect(indicators([adv('advisor', '2026-10-20'), adv('clinical advisor', '2026-10-20'), adv('KOL', '2026-01-01')], T, cfg).advisors).toHaveLength(2);
    expect(indicators([adv('advisor', '2026-10-30')], T, cfg).advisors).toHaveLength(0);
  });
});

describe('effectiveness replay', () => {
  it('works with working days', () => {
    expect(addWorkingDays('2026-11-26', 2)).toBe('2026-11-30'); // Thu to Mon
    expect(addWorkingDays('2026-11-27', 2)).toBe('2026-12-01'); // Fri to Tue
  });
  it('replays a small history exactly and skips days whose window has not closed', () => {
    const a = person({ id: 1, name: 'A', importance: 5 }), b = person({ id: 2, name: 'B', importance: 3, owner: 'Jay' });
    const ints = [interaction({ id: 1, date: '2026-11-24', type: 'call', peopleIds: [1] })];
    // Mon 23 and Tue 24: A and B are in the top. Wed 25: only B (A was contacted). Thu and Fri windows are still open on Mon 30.
    const [w] = effectiveness([a, b], ints, '2026-11-30', cfg, 1);
    expect(w).toEqual({ weekStart: '2026-11-23', top: 5, contacted: 2, share: 0.4 });
  });
  it('is null when nothing was in the top, and a broadcast is not a contact', () => {
    expect(effectiveness([], [], T, cfg, 1)[0]!.share).toBeNull();
    const [w] = effectiveness([person({ id: 1 })], [interaction({ date: '2026-11-17', type: 'broadcast', direction: 'outbound' })], '2026-12-01', cfg, 1);
    expect(w!.contacted).toBe(0);
  });
});

describe('fixture set (acceptance item 2)', () => {
  const r = rankToday(fx.people, fx.expected.today, cfg, { interactions: fx.interactions });
  it('has 20 invented people, 4 organizations and 40 interactions, all on example.com', () => {
    expect([fx.people.length, fx.orgs.length, fx.interactions.length]).toEqual([20, 4, 40]);
    for (const p of fx.people) if (p.email) expect(p.email.endsWith('@example.com')).toBe(true);
    for (const o of fx.orgs) if (o.domain) expect(o.domain.endsWith('.example.com')).toBe(true);
  });
  it('stored system fields match the interactions', () => expect(staleSystemFields(fx.people, fx.interactions)).toEqual([]));
  it('matches expected-today.json: order, scores and top five', () => {
    expect(r.due.map((x) => ({ id: x.person.id, score: x.score }))).toEqual(fx.expected.due);
    expect(r.top.map((x) => x.person.id)).toEqual(fx.expected.top);
    expect(r.upcoming.map((x) => x.person.id)).toEqual(fx.expected.upcoming);
  });
  it('splits by owner', () => {
    expect(rankToday(fx.people, fx.expected.today, cfg, { owner: 'Santiago' }).due.map((x) => x.person.id)).toEqual(fx.expected.mineSantiago);
    expect(rankToday(fx.people, fx.expected.today, cfg, { owner: 'Jay' }).due.map((x) => x.person.id)).toEqual(fx.expected.mineJay);
  });
  it('keeps excluded people out of every list', () => {
    const shown = new Set([...r.due, ...r.upcoming].map((x) => x.person.id));
    for (const id of fx.expected.excluded) expect(shown.has(id)).toBe(false);
  });
  it('matches the waiting on lists and the indicators', () => {
    const w = waitingLists(fx.people, fx.expected.today, cfg);
    expect(w.waitingOnThem.map((p) => p.id)).toEqual(fx.expected.waitingOnThem);
    expect(w.waitingOnMe.map((p) => p.id)).toEqual(fx.expected.waitingOnMe);
    const i = indicators(fx.people, fx.expected.today, cfg);
    expect(i.investors.map((p) => p.id)).toEqual(fx.expected.indicators.investors);
    expect(i.advisors.map((p) => p.id)).toEqual(fx.expected.indicators.advisors);
  });
  it('a broadcast on the 20th did not reset the clock for Quinn', () => {
    const q = fx.people.find((p) => p.name.startsWith('Quinn'))!;
    expect(q.lastTouchAt).toBe('2026-11-20');
    expect(q.lastTwoWayAt).toBe('2026-11-01');
  });
});

describe('ranking config', () => {
  const good = JSON.parse(JSON.stringify(cfg));
  it('accepts the shipped config and shows its version', () => expect(cfg.version).toBe('1.0.0'));
  it.each([
    ['missing weights', { ...good, weights: undefined }],
    ['bad version', { ...good, version: 'one' }],
    ['changelog out of step', { ...good, version: '1.0.1' }],
    ['bad pattern', { ...good, placeholderEmailPatterns: ['('] }],
    ['zero cadence', { ...good, cadenceDays: { default: 0 } }],
  ])('rejects %s', (_n, bad) => expect(() => parseRankingConfig(bad)).toThrow());
});
