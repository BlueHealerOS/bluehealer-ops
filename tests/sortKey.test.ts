import { describe, expect, it } from 'vitest';
import { compareCards, initialKeys, keyAt, MIN_GAP, needsRebalance, rebalance, SORT_STEP } from '../src/domain/sortKey';

describe('keyAt', () => {
  it('starts an empty column at one step', () => {
    expect(keyAt([], 0)).toBe(SORT_STEP);
  });
  it('places a card before the first one, after the last one, and between two', () => {
    expect(keyAt([1024, 2048], 0)).toBe(0);
    expect(keyAt([1024, 2048], 2)).toBe(3072);
    expect(keyAt([1024, 2048], 1)).toBe(1536);
  });
  it('clamps an index outside the column', () => {
    expect(keyAt([1024], 99)).toBe(2048);
    expect(keyAt([1024], -3)).toBe(0);
  });
  it('keeps the order after many insertions at the same spot', () => {
    let keys = [1024, 2048];
    for (let i = 0; i < 40; i++) keys = [keys[0]!, keyAt(keys, 1), ...keys.slice(1)];
    expect([...keys].sort((a, b) => a - b)).toEqual(keys);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe('rebalance', () => {
  it('detects neighbours that are too close or equal', () => {
    expect(needsRebalance([1, 2, 3])).toBe(false);
    expect(needsRebalance([1, 1 + MIN_GAP / 2, 3])).toBe(true);
    expect(needsRebalance([5, 5])).toBe(true);
    expect(needsRebalance([])).toBe(false);
  });
  it('is triggered by repeated halving and fixed by renumbering', () => {
    let keys = [0, 1024];
    let steps = 0;
    while (!needsRebalance(keys) && steps < 200) { keys = [keys[0]!, keyAt(keys, 1), ...keys.slice(1)]; steps++; }
    expect(steps).toBeGreaterThan(20);
    expect(needsRebalance(keys)).toBe(true);
    const fixed = rebalance(keys.map((_, i) => i + 1));
    expect(needsRebalance(fixed.map((f) => f.SortKey))).toBe(false);
    expect(fixed.map((f) => f.id)).toEqual(keys.map((_, i) => i + 1));
  });
  it('spaces keys by one step starting at one step', () => {
    expect(rebalance([7, 3, 9])).toEqual([{ id: 7, SortKey: 1024 }, { id: 3, SortKey: 2048 }, { id: 9, SortKey: 3072 }]);
  });
});

describe('compareCards', () => {
  it('orders by key, then puts unkeyed cards last by priority, due date and id', () => {
    const cards = [
      { id: 4 }, { id: 1, SortKey: 2048 }, { id: 2, SortKey: 1024 },
      { id: 3, Priority: 'P0' }, { id: 5, Priority: 'P0', DueDate: '2026-12-01' },
    ];
    expect([...cards].sort(compareCards).map((c) => c.id)).toEqual([2, 1, 5, 3, 4]);
  });
  it('is stable for equal keys by id', () => {
    expect([{ id: 9, SortKey: 1 }, { id: 2, SortKey: 1 }].sort(compareCards).map((c) => c.id)).toEqual([2, 9]);
  });
  it('gives initial keys in the same order', () => {
    const out = initialKeys([{ id: 1, Priority: 'P3' }, { id: 2, Priority: 'P0' }, { id: 3, Priority: 'P0', DueDate: '2026-12-02' }]);
    expect(out.map((o) => o.id)).toEqual([3, 2, 1]);
    expect(out.map((o) => o.SortKey)).toEqual([1024, 2048, 3072]);
  });
});
