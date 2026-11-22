import { describe, expect, it } from 'vitest';
import { applyFacets, dueWindowOf, facetsFromQuery, facetsToQuery } from '../src/domain/filters';
import { dealDataProblem } from '../src/domain/guards';
import type { Task } from '../src/domain/types';

const T = (o: Partial<Task> & { id: number }): Task => ({ Title: 'x', Status: 'Next', ...o });
const TODAY = '2026-11-23';

describe('facets', () => {
  const tasks = [
    T({ id: 1, Owner: 'Santiago', Priority: 'P0', DueDate: '2026-11-20', Labels: 'cadaver; lab' }),
    T({ id: 2, Owner: 'Jay', Priority: 'P1', DueDate: TODAY, Track: ['Pitch and Investors'] }),
    T({ id: 3, Owner: 'Jay', Priority: 'P0' }),
  ];
  it('is OR within a facet and AND across facets', () => {
    expect(applyFacets(tasks, { owner: ['Santiago', 'Jay'] }, TODAY).map((t) => t.id)).toEqual([1, 2, 3]);
    expect(applyFacets(tasks, { owner: ['Jay'], priority: ['P0'] }, TODAY).map((t) => t.id)).toEqual([3]);
  });
  it('filters by due window, track and free tag', () => {
    expect(applyFacets(tasks, { due: ['overdue'] }, TODAY).map((t) => t.id)).toEqual([1]);
    expect(applyFacets(tasks, { due: ['no date'] }, TODAY).map((t) => t.id)).toEqual([3]);
    expect(applyFacets(tasks, { track: ['Pitch and Investors'] }, TODAY).map((t) => t.id)).toEqual([2]);
    expect(applyFacets(tasks, { label: ['LAB'] }, TODAY).map((t) => t.id)).toEqual([1]);
  });
  it('treats missing sensitivity as normal', () => {
    expect(applyFacets(tasks, { sensitivity: ['restricted'] }, TODAY)).toEqual([]);
    expect(applyFacets(tasks, { sensitivity: ['normal'] }, TODAY)).toHaveLength(3);
  });
  it('classifies due windows', () => {
    expect(dueWindowOf('2026-11-29', TODAY)).toBe('this week');
    expect(dueWindowOf('2026-12-05', TODAY)).toBe('next 14 days');
  });
  it('puts facet values, never content, in the URL', () => {
    const q = facetsToQuery({ owner: ['Jay', 'Both'], status: ['Next'] });
    expect(q).toBe('owner=Jay%2CBoth&status=Next');
    expect(facetsFromQuery(q)).toEqual({ owner: ['Jay', 'Both'], status: ['Next'] });
  });
});

describe('deal data guard', () => {
  it.each(['$5', '$1,250,000 valuation', 'USD 500', '10k dollars', '€ 20', '3 million dollars'])('blocks %s', (s) => expect(dealDataProblem(s)).not.toBeNull());
  it.each(['Call about trial design', 'Meeting at 5 pm', 'Follow up in 2 weeks', ''])('allows %s', (s) => expect(dealDataProblem(s)).toBeNull());
});
