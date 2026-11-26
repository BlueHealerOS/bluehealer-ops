// Reference implementation of the reminder rules. The in-app notification center runs this code, and
// docs/flows/ describes the same rules for the Power Automate digests, so both stay identical.
import type { Application, Founder, Milestone, Person, Task } from '../domain/types';
import { addDays, diffDays, inQuietHours } from '../domain/time';

export interface RuleInput {
  tasks: Task[];
  milestones?: Milestone[];
  people?: Person[];
  applications?: Application[];
}
export interface Shareable { Sensitivity?: string; ReminderOptIn?: boolean }

/** Restricted records are excluded from digests, packs and routine reads unless a founder opts in per record. */
export const isShareable = (x: Shareable) => (x.Sensitivity ?? 'normal') !== 'restricted' || x.ReminderOptIn === true;

export type Trigger =
  | 'task-due-today' | 'task-overdue' | 'waiting-past-expected' | 'milestone-at-risk'
  | `application-deadline-T-${number}`;

export interface Reminder {
  /** One reminder per record, trigger and day. */
  id: string;
  list: 'Tasks' | 'Milestones' | 'Applications';
  recordId: number;
  trigger: Trigger;
  title: string;
  detail: string;
  day: string;
}

const forFounder = (owner: string | undefined, f?: Founder) => !f || owner === f || owner === 'Both' || owner === 'Unassigned' || owner === undefined;
export const DEADLINE_OFFSETS = [21, 14, 7, 2, 0] as const;
const APP_CLOSED = new Set(['Awarded', 'Declined', 'Withdrawn', 'Closed']);

export function generateReminders(input: RuleInput, today: string, founder?: Founder): Reminder[] {
  const out: Reminder[] = [];
  const add = (r: Omit<Reminder, 'id' | 'day'>) => out.push({ ...r, day: today, id: `${r.list}:${r.recordId}:${r.trigger}:${today}` });

  for (const t of input.tasks) {
    if (t.Status === 'Done' || t.Status === 'Dropped') continue;
    if (!isShareable(t) || !forFounder(t.Owner, founder)) continue;
    if (t.DueDate === today) add({ list: 'Tasks', recordId: t.id, trigger: 'task-due-today', title: t.Title, detail: 'Due today' });
    else if (t.DueDate && t.DueDate < today) add({ list: 'Tasks', recordId: t.id, trigger: 'task-overdue', title: t.Title, detail: `Overdue by ${diffDays(today, t.DueDate)} day(s)` });
    if (t.Status === 'Waiting' && t.WaitingExpected && t.WaitingExpected < today)
      add({ list: 'Tasks', recordId: t.id, trigger: 'waiting-past-expected', title: t.Title, detail: `Waiting on ${t.WaitingOn ?? 'someone'}, expected ${t.WaitingExpected}` });
  }
  for (const a of input.applications ?? []) {
    if (APP_CLOSED.has(a.Stage ?? '') || !isShareable(a) || !forFounder(a.Owner, founder)) continue;
    for (const [label, date] of [['LOI', a.LoiDue], ['Full application', a.FullDue], ['Reporting', a.ReportingDue]] as const) {
      if (!date) continue;
      const n = diffDays(date, today);
      if ((DEADLINE_OFFSETS as readonly number[]).includes(n))
        add({ list: 'Applications', recordId: a.id, trigger: `application-deadline-T-${n}`, title: a.Title, detail: `${label} due ${date} (T-${n})` });
    }
  }
  // People follow-ups are not reminders: the CRM Today list ranks who to contact. The earlier People.NextFollowUp trigger was retired when the CRM lists replaced the Phase 1 CRM page.
  for (const m of input.milestones ?? []) {
    if ((m.Status !== 'at risk' && m.Status !== 'late') || !isShareable(m) || !forFounder(m.Owner, founder)) continue;
    add({ list: 'Milestones', recordId: m.id, trigger: 'milestone-at-risk', title: m.Title, detail: `Milestone is ${m.Status}` });
  }
  return dedupe(out);
}

function dedupe(rs: Reminder[]): Reminder[] {
  const seen = new Set<string>();
  return rs.filter((r) => (seen.has(r.id) ? false : (seen.add(r.id), true)));
}

export interface LogEntry { RecordKey: string; Trigger: string; Day: string; Channel: 'app' | 'digest'; SnoozedUntil?: string }

/** Remove reminders already delivered on this channel today, and those snoozed beyond now. */
export function applyLog(rs: Reminder[], log: LogEntry[], channel: 'app' | 'digest', now: Date): Reminder[] {
  return rs.filter((r) => {
    const key = `${r.list}:${r.recordId}`;
    return !log.some((l) => l.RecordKey === key && l.Trigger === r.trigger && l.Day === r.day && (
      (channel === 'digest' && l.Channel === 'digest') || (l.SnoozedUntil !== undefined && new Date(l.SnoozedUntil) > now)
    ));
  });
}

/** Quiet hours suppress delivery (digest, badge), not the list itself. */
export const mayDeliver = (now: Date) => !inQuietHours(now);

export const snoozeOptions = (now: Date, today: string) => ({
  'In 1 hour': new Date(now.getTime() + 3_600_000).toISOString(),
  Tomorrow: `${addDays(today, 1)}T12:00:00.000Z`,
  'Next week': `${addDays(today, 7)}T12:00:00.000Z`,
});

/** Overdue contacts: last contact beyond cadence. */
export function overdueContacts(people: Person[], today: string): Person[] {
  return people.filter((p) => p.CadenceDays && p.LastContact && isShareable(p) && diffDays(today, p.LastContact) > p.CadenceDays);
}

/** Reference digest for one founder. Plain data (ids, titles, deep links); never restricted content. */
export function buildDigest(input: RuleInput, today: string, founder: Founder, now: Date, log: LogEntry[] = []) {
  if (!mayDeliver(now)) return { deliver: false as const, sections: {} };
  const rs = applyLog(generateReminders(input, today, founder), log, 'digest', now);
  const by = (pred: (r: Reminder) => boolean) => rs.filter(pred).map(({ list, recordId, title, detail }) => ({ list, recordId, title, detail }));
  return {
    deliver: true as const,
    sections: {
      dueToday: by((r) => r.trigger === 'task-due-today'),
      overdue: by((r) => r.trigger === 'task-overdue'),
      waiting: by((r) => r.trigger === 'waiting-past-expected'),
      deadlines: by((r) => r.trigger.startsWith('application-deadline')),
      milestonesAtRisk: by((r) => r.trigger === 'milestone-at-risk'),
    },
  };
}

/** Reference routine export (what the F4 flow writes). Titles, ids and owners only; restricted excluded. */
export function buildRoutineExport(input: RuleInput & { intake?: { id: number; Title: string; Raw?: string; Sensitivity?: string; ReminderOptIn?: boolean; TriageState?: string }[] }) {
  const slim = <T extends { id: number; Title: string; Owner?: string } & Shareable>(xs: T[] | undefined) =>
    (xs ?? []).filter(isShareable).map((x) => ({ id: x.id, title: x.Title, owner: x.Owner ?? 'Unassigned' }));
  return {
    tasks: input.tasks.filter((t) => !['Done', 'Dropped'].includes(t.Status) && isShareable(t)).map((t) => ({ id: t.id, title: t.Title, owner: t.Owner ?? 'Unassigned', status: t.Status, due: t.DueDate })),
    milestones: slim(input.milestones),
    people: slim(input.people),
    intake: (input.intake ?? []).filter((i) => i.TriageState === 'New' && isShareable(i)).map((i) => ({ id: i.id, title: i.Title, raw: i.Raw })),
  };
}
