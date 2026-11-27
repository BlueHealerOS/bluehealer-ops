import type { Task } from './types';
import { addDays, addMonthsClamped, diffDays, mondayOf, weekdayOf } from './time';

export const CLOSED = ['Done', 'Dropped'] as const;
export const isClosed = (t: Pick<Task, 'Status'>) => t.Status === 'Done' || t.Status === 'Dropped';

/** Which link a strategic contribution type must carry. Operations needs none. */
const REQUIRED_LINK: Record<string, keyof Task | undefined> = {
  Milestone: 'MilestoneLookupId',
  'Key result': 'KeyResultLookupId',
  Application: 'ApplicationLookupId',
  'Fundraising follow-up': 'PersonLookupId',
  Relationship: 'PersonLookupId',
  Operations: undefined,
};

/** A task may leave Inbox only with a contribution type, and strategic types need a link. */
export function canLeaveInbox(t: Task): { ok: true } | { ok: false; reason: string } {
  if (!t.ContributionType) return { ok: false, reason: 'Please choose a contribution type before moving this task out of Inbox.' };
  const need = REQUIRED_LINK[t.ContributionType];
  if (need && !t[need]) return { ok: false, reason: `A ${t.ContributionType} task needs a link to the matching record.` };
  return { ok: true };
}

export function validateTransition(t: Task, to: Task['Status']): { ok: true } | { ok: false; reason: string } {
  if (t.Status === 'Inbox' && !['Inbox', 'Dropped', 'Proposed'].includes(to)) return canLeaveInbox(t);
  if (to === 'Waiting' && !t.WaitingOn) return { ok: false, reason: 'Please say who or what this task is waiting on.' };
  if (to === 'Dropped' && !t.DropReason) return { ok: false, reason: 'Please give a short reason for dropping this task.' };
  return { ok: true };
}

/** Recurrence subset: "daily", "weekly:MO,WE", "monthly:15" (day of month, clamped). */
const DAYS = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
export function nextOccurrence(rule: string, from: string): string | undefined {
  const [kind, arg] = rule.trim().toLowerCase().split(':');
  if (kind === 'daily') return addDays(from, 1);
  if (kind === 'weekly') {
    const want = (arg ?? '').split(',').map((s) => DAYS.indexOf(s.trim().toUpperCase())).filter((n) => n >= 0);
    if (!want.length) return addDays(from, 7);
    for (let i = 1; i <= 7; i++) if (want.includes(weekdayOf(addDays(from, i)))) return addDays(from, i);
  }
  if (kind === 'monthly') {
    const dom = arg ? Number(arg) : undefined;
    return addMonthsClamped(from, 1, dom && dom >= 1 && dom <= 31 ? dom : undefined);
  }
  return undefined;
}

export interface Completion {
  update: Partial<Task>;
  next?: Partial<Task>;
}

/** Complete a task. A recurring task yields the next instance in the same call. */
export function completeTask(t: Task, today: string, nowIso: string, outcome?: string): Completion {
  const update: Partial<Task> = { Status: 'Done', CompletedAt: nowIso, ...(outcome ? { OutcomeNote: outcome } : {}) };
  if (!t.Recurrence) return { update };
  const base = t.DueDate ?? today;
  const due = nextOccurrence(t.Recurrence, base < today ? today : base);
  if (!due) return { update };
  const shift = t.StartDate && t.DueDate ? diffDays(t.DueDate, t.StartDate) : undefined;
  return {
    update,
    next: {
      Title: t.Title, Description: t.Description, Status: 'Next', Priority: t.Priority, DueDate: due,
      ...(shift !== undefined ? { StartDate: addDays(due, -shift) } : {}),
      EstimateMinutes: t.EstimateMinutes, Recurrence: t.Recurrence, ContributionType: t.ContributionType,
      MilestoneLookupId: t.MilestoneLookupId, KeyResultLookupId: t.KeyResultLookupId, ApplicationLookupId: t.ApplicationLookupId,
      PersonLookupId: t.PersonLookupId, Context: t.Context, Effort: t.Effort, Owner: t.Owner, Sensitivity: t.Sensitivity,
      Labels: t.Labels, Track: t.Track, Source: t.Source, RecurrenceParentId: t.id,
    },
  };
}

const PRIORITY_RANK: Record<string, number> = { P0: 0, P1: 1, P2: 2, P3: 3 };
const STRATEGIC = new Set(['Milestone', 'Key result', 'Application', 'Fundraising follow-up']);

/** Ranking for weekly planning and the proposed Today: priority, due date, then strategic contribution. */
export function rankTasks(tasks: Task[], today: string): Task[] {
  const score = (t: Task) => [
    t.TodayDate === today ? 0 : 1,
    PRIORITY_RANK[t.Priority ?? 'P2'] ?? 2,
    t.DueDate ? diffDays(t.DueDate, today) : 9999,
    STRATEGIC.has(t.ContributionType ?? '') ? 0 : 1,
  ];
  return [...tasks].sort((a, b) => {
    const x = score(a), y = score(b);
    for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return (x[i] as number) - (y[i] as number);
    return a.id - b.id;
  });
}

const ACTIVE = new Set(['Next', 'This week', 'In progress']);

/** In "this week": the v2 status, or the older flag that is read until every record has been migrated. Only the status is written from now on. */
export const inThisWeek = (t: Pick<Task, 'Status' | 'ThisWeek'>) => t.Status === 'This week' || t.ThisWeek === true;

/**
 * Statuses a founder may pick by hand in a Status list. Done is reached only through `closeTask`.
 * Backlog and This week are offered once the lists carry those values (phase A2, after provisioning and the migration).
 * The current value is always kept so that an existing card still shows its own status.
 */
export const PICKABLE_STATUS: readonly Task['Status'][] = ['Proposed', 'Inbox', 'Next', 'In progress', 'Waiting', 'Dropped'];
export const statusOptions = (current?: Task['Status']): readonly Task['Status'][] => (current && !PICKABLE_STATUS.includes(current) ? [...PICKABLE_STATUS, current] : PICKABLE_STATUS);

/** Today: pinned for today, plus This week or due items that are actionable, capped. */
export function proposeToday(tasks: Task[], today: string, cap = 7): Task[] {
  const cands = tasks.filter((t) => !isClosed(t) && (t.TodayDate === today || (ACTIVE.has(t.Status) && (inThisWeek(t) || (t.DueDate !== undefined && t.DueDate <= today)))));
  return rankTasks(cands, today).slice(0, cap);
}

export const thisWeek = (tasks: Task[], today: string) => {
  const mon = mondayOf(today), sun = addDays(mon, 6);
  return tasks.filter((t) => !isClosed(t) && (inThisWeek(t) || (t.DueDate !== undefined && t.DueDate >= mon && t.DueDate <= sun)));
};
export const waitingOnOthers = (tasks: Task[]) => tasks.filter((t) => t.Status === 'Waiting');
export const proposed = (tasks: Task[]) => tasks.filter((t) => t.Status === 'Proposed');
export const doneThisWeek = (tasks: Task[], today: string) => {
  const mon = mondayOf(today);
  return tasks.filter((t) => t.Status === 'Done' && t.CompletedAt !== undefined && t.CompletedAt.slice(0, 10) >= mon);
};

/** Weekly hygiene: unlinked strategic tasks, Inbox older than 3 days, Next without dates older than 14 days. */
export function hygiene(tasks: Task[], today: string, createdOn: (t: Task) => string | undefined) {
  const open = tasks.filter((t) => !isClosed(t));
  return {
    unlinkedStrategic: open.filter((t) => t.Status !== 'Inbox' && t.Status !== 'Proposed' && !canLeaveInbox(t).ok),
    staleInbox: open.filter((t) => t.Status === 'Inbox' && (createdOn(t) ?? today) <= addDays(today, -3)),
    undatedNext: open.filter((t) => t.Status === 'Next' && !t.DueDate && !t.StartDate && (createdOn(t) ?? today) <= addDays(today, -14)),
  };
}
