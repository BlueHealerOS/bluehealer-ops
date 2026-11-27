import { describe, expect, it } from 'vitest';
import { applyPatch, mergeWrite } from '../../src/data/merge';

describe('mergeWrite', () => {
  const base = { Status: 'Backlog', Priority: 'P2', DueDate: '2026-12-01' };

  it('applies fields the other founder did not touch', () => {
    const r = mergeWrite(base, { Status: 'This week' }, { ...base, Priority: 'P0' });
    expect(r).toEqual({ apply: { Status: 'This week' }, conflicts: [] });
  });
  it('skips a field both founders set to the same value', () => {
    expect(mergeWrite(base, { Status: 'This week' }, { ...base, Status: 'This week' })).toEqual({ apply: {}, conflicts: [] });
  });
  it('reports a field both changed to different values, and still applies the rest', () => {
    const r = mergeWrite(base, { Status: 'This week', DueDate: '2026-12-05' }, { ...base, Status: 'In progress' });
    expect(r.apply).toEqual({ DueDate: '2026-12-05' });
    expect(r.conflicts).toEqual([{ field: 'Status', mine: 'This week', theirs: 'In progress' }]);
  });
  it('treats null, undefined and an empty string as the same empty value', () => {
    expect(mergeWrite({ DueDate: undefined }, { DueDate: '2026-12-05' }, { DueDate: null })).toEqual({ apply: { DueDate: '2026-12-05' }, conflicts: [] });
    expect(mergeWrite({ DueDate: '2026-12-01' }, { DueDate: null }, { DueDate: '' })).toEqual({ apply: {}, conflicts: [] });
  });
  it('flags a clear that meets a change', () => {
    const r = mergeWrite(base, { DueDate: null }, { ...base, DueDate: '2026-12-09' });
    expect(r.conflicts).toEqual([{ field: 'DueDate', mine: null, theirs: '2026-12-09' }]);
  });
  it('compares arrays by value', () => {
    expect(mergeWrite({ Track: ['A'] }, { Track: ['A', 'B'] }, { Track: ['A'] }).apply).toEqual({ Track: ['A', 'B'] });
    expect(mergeWrite({ Track: ['A'] }, { Track: ['A', 'B'] }, { Track: ['A', 'C'] }).conflicts).toHaveLength(1);
  });
});

describe('applyPatch', () => {
  it('replaces values and removes fields set to null, without changing the input', () => {
    const f = { a: 1, b: 2 };
    expect(applyPatch(f, { a: 3, b: null, c: 4 })).toEqual({ a: 3, c: 4 });
    expect(f).toEqual({ a: 1, b: 2 });
  });
});
