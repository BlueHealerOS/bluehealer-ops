// Only a founder closes a card (docs/PLAN-v2.md section 5.3, item 7). Routines propose "Looks done?" and never close.
// `closeTask` is the only place that issues a FounderClose. The write queue refuses `Status: 'Done'` without one, and the
// check is on object identity (a WeakSet), so a hand-built look-alike object is refused too.
import type { Task } from './types';
import { completeTask, type Completion } from './tasks';

export type ClosingFounder = 'Santiago' | 'Jay';

export interface FounderClose {
  readonly founder: ClosingFounder;
  readonly at: string;
}

const issued = new WeakSet<object>();

export function isFounderClose(x: unknown): x is FounderClose {
  return typeof x === 'object' && x !== null && issued.has(x);
}

export interface Closing extends Completion {
  close: FounderClose;
}

/** Fields to write when a founder closes a card: Done, who and when, an optional outcome note, and the next instance of a recurring card. */
export function closeTask(task: Task, founder: ClosingFounder, today: string, nowIso: string, outcome?: string): Closing {
  const c = completeTask(task, today, nowIso, outcome);
  const close: FounderClose = Object.freeze({ founder, at: nowIso });
  issued.add(close);
  return { ...c, update: { ...c.update, ClosedBy: founder }, close };
}

/** A patch that sets Done must carry the token; any other patch needs none. Throws on a Done write without one. */
export function assertCloseAllowed(patch: { Status?: unknown }, close?: FounderClose): void {
  if (patch.Status === 'Done' && !isFounderClose(close)) {
    throw new Error('Only a founder can mark a card done. Please use Mark done.');
  }
}
