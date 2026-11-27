// Card order within a board column (docs/PLAN-v2.md section 5.4). A drag writes one item: the card gets a key between its new neighbours.

export const SORT_STEP = 1024;
/** When two neighbouring keys are closer than this, the column is renumbered. */
export const MIN_GAP = 1e-6;

/** Key for a card placed at `index` among the other cards of a column, whose keys are already sorted ascending. */
export function keyAt(others: readonly number[], index: number): number {
  const i = Math.max(0, Math.min(index, others.length));
  const before = others[i - 1];
  const after = others[i];
  if (before === undefined && after === undefined) return SORT_STEP;
  if (before === undefined) return after! - SORT_STEP;
  if (after === undefined) return before + SORT_STEP;
  return (before + after) / 2;
}

/** True when any two neighbouring keys are too close (or equal) for another midpoint to be reliable. */
export function needsRebalance(sortedKeys: readonly number[]): boolean {
  for (let i = 1; i < sortedKeys.length; i++) if (sortedKeys[i]! - sortedKeys[i - 1]! < MIN_GAP) return true;
  return false;
}

/** New evenly spaced keys for a column, in the order given. Written in `$batch` calls of 20. */
export function rebalance(orderedIds: readonly number[]): { id: number; SortKey: number }[] {
  return orderedIds.map((id, i) => ({ id, SortKey: (i + 1) * SORT_STEP }));
}

const PRIORITY_RANK: Record<string, number> = { P0: 0, P1: 1, P2: 2, P3: 3 };

interface Sortable { id: number; SortKey?: number; Priority?: string; DueDate?: string }

/**
 * Order of cards in a column: by SortKey; cards without a key (not yet migrated) follow, by priority, due date, then id.
 * Never random: the same data always gives the same order.
 */
export function compareCards(a: Sortable, b: Sortable): number {
  const ak = a.SortKey, bk = b.SortKey;
  if (ak !== undefined && bk !== undefined && ak !== bk) return ak - bk;
  if (ak !== undefined && bk === undefined) return -1;
  if (ak === undefined && bk !== undefined) return 1;
  const pr = (PRIORITY_RANK[a.Priority ?? 'P2'] ?? 2) - (PRIORITY_RANK[b.Priority ?? 'P2'] ?? 2);
  if (pr !== 0) return pr;
  const ad = a.DueDate ?? '9999-12-31', bd = b.DueDate ?? '9999-12-31';
  if (ad !== bd) return ad < bd ? -1 : 1;
  return a.id - b.id;
}

/** Initial keys for a list of cards that have none: priority, due date, id; spaced by SORT_STEP. */
export function initialKeys<T extends Sortable>(cards: readonly T[]): { id: number; SortKey: number }[] {
  return rebalance([...cards].sort((a, b) => compareCards({ ...a, SortKey: undefined }, { ...b, SortKey: undefined })).map((c) => c.id));
}
