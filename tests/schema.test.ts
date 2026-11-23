import { describe, expect, it } from 'vitest';
import { creationOrder, DENY_PATTERN, LISTS, validateSchema, type ListDef } from '../src/schema/lists';

describe('schema', () => {
  it('is valid and has the 18 lists', () => {
    expect(validateSchema(LISTS)).toEqual([]);
    expect(LISTS.map((l) => l.name).sort()).toEqual([
      'AnswerBank', 'Applications', 'ImportStaging', 'Intake', 'Interactions', 'KPIMeasurements', 'KPIs', 'KeyResults', 'Labels', 'Meetings',
      'Milestones', 'Objectives', 'Organizations', 'People', 'Programs', 'ReminderLog', 'Settings', 'Tasks',
    ]);
  });
  it('carries Sensitivity on every list', () => {
    for (const l of LISTS) expect(l.columns.some((c) => c.name === 'Sensitivity'), l.name).toBe(true);
  });
  it('has no deal or personal-finance column anywhere (no amount field)', () => {
    for (const l of LISTS) for (const c of l.columns) {
      expect(DENY_PATTERN.test(c.name), `${l.name}.${c.name}`).toBe(false);
      for (const v of c.choices ?? []) expect(DENY_PATTERN.test(v), `${l.name}.${c.name}=${v}`).toBe(false);
    }
  });
  it('rejects a column that matches the deny list', () => {
    const bad: ListDef[] = [{ name: 'X', description: '', columns: [{ name: 'InvestmentAmount', type: 'number' }] }];
    expect(validateSchema(bad).join()).toMatch(/deny list/);
  });
  it('keeps at most 4 lookups per list', () => {
    for (const l of LISTS) expect(l.columns.filter((c) => c.type === 'lookup').length).toBeLessThanOrEqual(4);
  });
  it('orders lookup targets first', () => {
    const order = creationOrder(LISTS).map((l) => l.name);
    expect(order.indexOf('Milestones')).toBeLessThan(order.indexOf('Tasks'));
    expect(order.indexOf('Organizations')).toBeLessThan(order.indexOf('People'));
    expect(order.indexOf('People')).toBeLessThan(order.indexOf('Tasks'));
  });
  it('indexes every column the app filters on', () => {
    const idx = (l: string, c: string) => LISTS.find((x) => x.name === l)!.columns.find((x) => x.name === c)?.indexed;
    for (const c of ['Status', 'DueDate', 'ThisWeek', 'CompletedAt', 'Owner', 'Sensitivity']) expect(idx('Tasks', c), c).toBe(true);
  });
});
