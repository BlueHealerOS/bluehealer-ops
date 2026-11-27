// Status migration to the v2 board (docs/PLAN-v2.md section 6.2). Pure: reads decoded tasks, returns what would change.
// The Admin page shows the dry run, then applies it. It is idempotent: a card that already carries its v2 fields is skipped.
import type { Decoded } from '../graph/codec';
import type { Task } from './types';
import { compareCards, SORT_STEP } from './sortKey';

type Status = Task['Status'];
export type MigratedTask = Decoded<Task>;

/** Statuses that are columns of the v2 board and therefore carry a SortKey. Proposed is reached through the Suggested filter. */
const BOARD_STATUS: readonly Status[] = ['Backlog', 'This week', 'In progress', 'Waiting'];
const LEGACY: readonly Status[] = ['Inbox', 'Next'];

export interface RowChange {
  id: number;
  from: Status;
  to: Status;
  changes: Record<string, unknown>;
  restricted: boolean;
}

export interface MigrationPlan {
  rows: RowChange[];
  report: Record<string, number>;
}

export function targetStatus(t: Pick<Task, 'Status' | 'ThisWeek'>): Status {
  if (t.Status === 'Inbox') return 'Backlog';
  if (t.Status === 'Next') return t.ThisWeek === true ? 'This week' : 'Backlog';
  return t.Status;
}

const isClosed = (s: Status) => s === 'Done' || s === 'Dropped';

/** A card is done migrating when it has left Inbox and Next and carries the fields the migration adds. */
export function isMigrated(t: MigratedTask): boolean {
  if (LEGACY.includes(t.Status)) return false;
  if (t.Kind === undefined || t.LastTouched === undefined) return false;
  if (BOARD_STATUS.includes(t.Status) && t.SortKey === undefined) return false;
  if (t.Status === 'Waiting' && t.CheckAgain === undefined && t.WaitingExpected !== undefined) return false;
  return true;
}

export function planMigrationV2(tasks: readonly MigratedTask[]): MigrationPlan {
  const r = {
    'Tasks scanned': tasks.length,
    'Inbox to Backlog': 0,
    'Next (this week) to This week': 0,
    'Next (other) to Backlog': 0,
    'In progress (unchanged)': 0,
    'Waiting (unchanged)': 0,
    'Waiting: check-again date copied from the expected date': 0,
    'Waiting: no "waiting for" text yet (flagged)': 0,
    'Done and Dropped (left alone)': 0,
    'Proposed (not a board column)': 0,
    'Already migrated (skipped)': 0,
    'Cards without a workstream after migration': 0,
    'Restricted records included (updated, never cached)': 0,
    'Cards to update': 0,
    'Batches of 20': 0,
  };
  const rows: RowChange[] = [];
  const open = tasks.filter((t) => !isClosed(t.Status));
  r['Done and Dropped (left alone)'] = tasks.length - open.length;

  // Next SortKey per target column: after any key already there, so a partly migrated list never collides.
  const nextKey = new Map<Status, number>();
  for (const t of open) {
    const s = targetStatus(t);
    if (t.SortKey !== undefined) nextKey.set(s, Math.max(nextKey.get(s) ?? 0, t.SortKey));
  }
  const queue = new Map<Status, MigratedTask[]>();

  for (const t of open) {
    if (t.Status === 'Proposed') r['Proposed (not a board column)']++;
    if (isMigrated(t)) { r['Already migrated (skipped)']++; continue; }
    const to = targetStatus(t);
    const changes: Record<string, unknown> = {};
    if (to !== t.Status) changes.Status = to;
    if (t.Status === 'Inbox') r['Inbox to Backlog']++;
    else if (t.Status === 'Next') r[to === 'This week' ? 'Next (this week) to This week' : 'Next (other) to Backlog']++;
    else if (t.Status === 'In progress') r['In progress (unchanged)']++;
    else if (t.Status === 'Waiting') {
      r['Waiting (unchanged)']++;
      if (t.CheckAgain === undefined && t.WaitingExpected !== undefined) { changes.CheckAgain = t.WaitingExpected; r['Waiting: check-again date copied from the expected date']++; }
      if (t.WaitingFor === undefined) r['Waiting: no "waiting for" text yet (flagged)']++;
    }
    // The aging fade measures from the last real edit, so take it from before this migration touches the item.
    if (t.LastTouched === undefined && t._modified) changes.LastTouched = t._modified;
    if (t.Kind === undefined) changes.Kind = 'Task';
    if (BOARD_STATUS.includes(to) && t.SortKey === undefined) {
      const list = queue.get(to) ?? [];
      list.push(t);
      queue.set(to, list);
    }
    rows.push({ id: t.id, from: t.Status, to, changes, restricted: t.Sensitivity === 'restricted' });
  }

  // Card order inside each column: priority, then due date, then id.
  const byId = new Map(rows.map((x) => [x.id, x]));
  for (const [status, list] of queue) {
    let key = nextKey.get(status) ?? 0;
    for (const t of [...list].sort((a, b) => compareCards({ ...a, SortKey: undefined }, { ...b, SortKey: undefined }))) {
      key += SORT_STEP;
      byId.get(t.id)!.changes.SortKey = key;
    }
  }

  const todo = rows.filter((x) => Object.keys(x.changes).length > 0);
  r['Cards without a workstream after migration'] = open.filter((t) => t.WorkstreamId === undefined).length;
  r['Restricted records included (updated, never cached)'] = todo.filter((x) => x.restricted).length;
  r['Cards to update'] = todo.length;
  r['Batches of 20'] = Math.ceil(todo.length / 20);
  return { rows: todo, report: r };
}

/** What a founder downloads before applying: ids and previous statuses only, no titles, so it can be used to restore. */
export interface RollbackReport {
  kind: 'ops-v2-migration-rollback';
  createdAt: string;
  entries: { id: number; status: Status; fields: string[] }[];
}

export function rollbackReport(plan: MigrationPlan, now: Date): RollbackReport {
  return { kind: 'ops-v2-migration-rollback', createdAt: now.toISOString(), entries: plan.rows.map((x) => ({ id: x.id, status: x.from, fields: Object.keys(x.changes) })) };
}

export function parseRollbackReport(text: string): RollbackReport {
  let j: unknown;
  try { j = JSON.parse(text); } catch { throw new Error('This file is not a migration report.'); }
  const o = j as Partial<RollbackReport> | null;
  if (!o || o.kind !== 'ops-v2-migration-rollback' || !Array.isArray(o.entries)) throw new Error('This file is not a migration report.');
  return o as RollbackReport;
}

/** Restoring writes the previous Status only; the columns the migration added are left in place (they are harmless and removing them is not needed). */
export function restoreUpdates(report: RollbackReport): { id: number; fields: Record<string, unknown> }[] {
  return report.entries.filter((e) => e.fields.includes('Status')).map((e) => ({ id: e.id, fields: { Status: e.status } }));
}
