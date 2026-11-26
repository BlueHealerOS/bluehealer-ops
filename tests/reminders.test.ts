import { describe, expect, it } from 'vitest';
import { applyLog, buildDigest, buildRoutineExport, generateReminders, overdueContacts, type LogEntry } from '../src/reminders/rules';
import type { Application, Milestone, Person, Task } from '../src/domain/types';

const TODAY = '2026-11-23';
const T = (o: Partial<Task> & { id: number }): Task => ({ Title: `Task ${o.id}`, Status: 'Next', Owner: 'Santiago', ...o });
const MORNING = new Date('2026-11-23T12:30:00Z'); // 07:30 ET
const NIGHT = new Date('2026-11-24T03:00:00Z'); // 22:00 ET

describe('reminder rules', () => {
  it('raises due-today, overdue and waiting-past-expected', () => {
    const rs = generateReminders({ tasks: [T({ id: 1, DueDate: TODAY }), T({ id: 2, DueDate: '2026-11-20' }), T({ id: 3, Status: 'Waiting', WaitingOn: 'Vendor', WaitingExpected: '2026-11-22' })] }, TODAY);
    expect(rs.map((r) => r.trigger).sort()).toEqual(['task-due-today', 'task-overdue', 'waiting-past-expected']);
  });
  it('is silent for Done and Dropped records', () => {
    expect(generateReminders({ tasks: [T({ id: 1, DueDate: TODAY, Status: 'Done' }), T({ id: 2, DueDate: TODAY, Status: 'Dropped' })] }, TODAY)).toEqual([]);
  });
  it('raises application deadlines only at T-21, T-14, T-7, T-2 and T-0', () => {
    const app = (d: string): Application => ({ id: 1, Title: 'Program A', Stage: 'Preparing', FullDue: d, Owner: 'Both' });
    const hits = [0, 1, 2, 3, 7, 10, 14, 20, 21, 22].filter((n) => generateReminders({ tasks: [], applications: [app(addD(TODAY, n))] }, TODAY).length > 0);
    expect(hits).toEqual([0, 2, 7, 14, 21]);
  });
  it('skips applications that are no longer open', () => {
    expect(generateReminders({ tasks: [], applications: [{ id: 1, Title: 'A', Stage: 'Declined', FullDue: TODAY }] }, TODAY)).toEqual([]);
  });
  it('raises milestones at risk, and no longer raises people follow-ups (the CRM Today list replaced them)', () => {
    const people: Person[] = [{ id: 1, Title: 'Avery Placeholder', NextFollowUp: '2026-11-22', Owner: 'Jay' }];
    const ms: Milestone[] = [{ id: 1, Title: 'Cadaver testing', Status: 'at risk', Owner: 'Santiago' }, { id: 2, Title: 'Fine', Status: 'on track' }];
    const rs = generateReminders({ tasks: [], people, milestones: ms }, TODAY);
    expect(rs.map((r) => r.trigger)).toEqual(['milestone-at-risk']);
  });
  it('filters per founder; Both and Unassigned reach both', () => {
    const tasks = [T({ id: 1, DueDate: TODAY, Owner: 'Jay' }), T({ id: 2, DueDate: TODAY, Owner: 'Both' }), T({ id: 3, DueDate: TODAY, Owner: 'Unassigned' })];
    expect(generateReminders({ tasks }, TODAY, 'Santiago').map((r) => r.recordId)).toEqual([2, 3]);
    expect(generateReminders({ tasks }, TODAY, 'Jay').map((r) => r.recordId)).toEqual([1, 2, 3]);
  });
  it('produces one reminder per record, trigger and day', () => {
    const t = T({ id: 1, DueDate: TODAY });
    expect(generateReminders({ tasks: [t, t] }, TODAY)).toHaveLength(1);
  });
  it('honours snooze and the digest ledger', () => {
    const rs = generateReminders({ tasks: [T({ id: 1, DueDate: TODAY })] }, TODAY);
    const snoozed: LogEntry[] = [{ RecordKey: 'Tasks:1', Trigger: 'task-due-today', Day: TODAY, Channel: 'app', SnoozedUntil: '2026-11-23T20:00:00Z' }];
    expect(applyLog(rs, snoozed, 'app', MORNING)).toEqual([]);
    expect(applyLog(rs, snoozed, 'app', new Date('2026-11-23T21:00:00Z'))).toHaveLength(1);
    const sent: LogEntry[] = [{ RecordKey: 'Tasks:1', Trigger: 'task-due-today', Day: TODAY, Channel: 'digest' }];
    expect(applyLog(rs, sent, 'digest', MORNING)).toEqual([]);
    expect(applyLog(rs, sent, 'app', MORNING)).toHaveLength(1);
  });
  it('finds overdue contacts beyond cadence', () => {
    const p: Person[] = [{ id: 1, Title: 'A', CadenceDays: 30, LastContact: '2026-10-01' }, { id: 2, Title: 'B', CadenceDays: 30, LastContact: '2026-11-10' }, { id: 3, Title: 'C', LastContact: '2020-01-01' }];
    expect(overdueContacts(p, TODAY).map((x) => x.id)).toEqual([1]);
  });
});

describe('restricted records never leave the app by digest or export', () => {
  const tasks = [T({ id: 1, DueDate: TODAY, Title: 'Normal task' }), T({ id: 2, DueDate: TODAY, Title: 'SECRET restricted task', Sensitivity: 'restricted' }), T({ id: 3, DueDate: TODAY, Title: 'Opted in', Sensitivity: 'restricted', ReminderOptIn: true })];
  const people: Person[] = [{ id: 1, Title: 'SECRET restricted person', NextFollowUp: TODAY, Sensitivity: 'restricted' }];
  const ms: Milestone[] = [{ id: 1, Title: 'SECRET restricted milestone', Status: 'late', Sensitivity: 'restricted' }];
  it('digest excludes restricted unless opted in', () => {
    const d = buildDigest({ tasks, people, milestones: ms }, TODAY, 'Santiago', MORNING);
    const text = JSON.stringify(d);
    expect(text).toContain('Normal task');
    expect(text).toContain('Opted in');
    expect(text).not.toContain('SECRET');
  });
  it('routine export excludes restricted records and restricted intake text', () => {
    const e = buildRoutineExport({
      tasks, people, milestones: ms,
      intake: [{ id: 1, Title: 'ok', Raw: 'plain', TriageState: 'New' }, { id: 2, Title: 'SECRET intake', Raw: 'SECRET raw', TriageState: 'New', Sensitivity: 'restricted' }],
    });
    const text = JSON.stringify(e);
    expect(text).not.toContain('SECRET');
    expect(text).toContain('plain');
  });
  it('the routine export leaves out a Restricted CRM person (capital R, no ReminderOptIn) and keeps names only', () => {
    const crm = [
      { id: 1, Title: 'Fixture Visible', Owner: 'Jay', Sensitivity: 'Normal', Email: 'visible@example.com' },
      { id: 2, Title: 'Fixture Hidden', Owner: 'Santiago', Sensitivity: 'Restricted', Email: 'hidden@example.com' },
    ] as unknown as Person[];
    const text = JSON.stringify(buildRoutineExport({ tasks: [], people: crm }));
    expect(text).toContain('Fixture Visible');
    expect(text).not.toContain('Fixture Hidden');
    expect(text).not.toContain('example.com'); // names, ids and owners only
    expect(JSON.parse(text).people).toEqual([{ id: 1, title: 'Fixture Visible', owner: 'Jay' }]);
  });
  it('digest is not delivered during quiet hours', () => {
    expect(buildDigest({ tasks }, TODAY, 'Santiago', NIGHT).deliver).toBe(false);
  });
});

function addD(d: string, n: number) {
  const x = new Date(d + 'T00:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10);
}
