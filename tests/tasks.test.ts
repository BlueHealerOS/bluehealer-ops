import { describe, expect, it } from 'vitest';
import { canLeaveInbox, completeTask, doneThisWeek, hygiene, nextOccurrence, proposeToday, rankTasks, validateTransition } from '../src/domain/tasks';
import type { Task } from '../src/domain/types';

const T = (o: Partial<Task> & { id: number }): Task => ({ Title: `Task ${o.id}`, Status: 'Next', ...o });
const TODAY = '2026-11-23';

describe('contribution gate', () => {
  it('needs a contribution type to leave Inbox', () => {
    expect(canLeaveInbox(T({ id: 1, Status: 'Inbox' })).ok).toBe(false);
    expect(canLeaveInbox(T({ id: 1, Status: 'Inbox', ContributionType: 'Operations' })).ok).toBe(true);
  });
  it('needs a link for strategic types', () => {
    expect(canLeaveInbox(T({ id: 1, ContributionType: 'Milestone' })).ok).toBe(false);
    expect(canLeaveInbox(T({ id: 1, ContributionType: 'Milestone', MilestoneLookupId: 4 })).ok).toBe(true);
    expect(canLeaveInbox(T({ id: 1, ContributionType: 'Key result', KeyResultLookupId: 2 })).ok).toBe(true);
    expect(canLeaveInbox(T({ id: 1, ContributionType: 'Application' })).ok).toBe(false);
    expect(canLeaveInbox(T({ id: 1, ContributionType: 'Fundraising follow-up' })).ok).toBe(false);
    expect(canLeaveInbox(T({ id: 1, ContributionType: 'Relationship', PersonLookupId: 9 })).ok).toBe(true);
  });
  it('blocks Inbox to Next without type, Waiting without waiting-on, Dropped without reason', () => {
    expect(validateTransition(T({ id: 1, Status: 'Inbox' }), 'Next').ok).toBe(false);
    expect(validateTransition(T({ id: 1, Status: 'Inbox', DropReason: 'Duplicate' }), 'Dropped').ok).toBe(true);
    expect(validateTransition(T({ id: 1 }), 'Waiting').ok).toBe(false);
    expect(validateTransition(T({ id: 1, WaitingOn: 'Vendor' }), 'Waiting').ok).toBe(true);
    expect(validateTransition(T({ id: 1 }), 'Dropped').ok).toBe(false);
  });
});

describe('recurrence', () => {
  it('computes the next occurrence', () => {
    expect(nextOccurrence('daily', '2026-11-23')).toBe('2026-11-24');
    expect(nextOccurrence('weekly:MO,WE', '2026-11-23')).toBe('2026-11-25');
    expect(nextOccurrence('weekly:MO', '2026-11-23')).toBe('2026-11-30');
    expect(nextOccurrence('monthly:31', '2026-11-30')).toBe('2026-12-31');
    expect(nextOccurrence('nonsense', '2026-11-23')).toBeUndefined();
  });
  it('creates the next instance on completion, never in the past', () => {
    const c = completeTask(T({ id: 5, Recurrence: 'weekly:FR', DueDate: '2026-11-13', Priority: 'P1', ContributionType: 'Operations' }), TODAY, '2026-11-23T15:00:00Z');
    expect(c.update).toMatchObject({ Status: 'Done', CompletedAt: '2026-11-23T15:00:00Z' });
    expect(c.next).toMatchObject({ DueDate: '2026-11-27', Status: 'Next', Priority: 'P1', RecurrenceParentId: 5, Recurrence: 'weekly:FR' });
  });
  it('creates nothing for a one-off task', () => {
    expect(completeTask(T({ id: 1 }), TODAY, 'x').next).toBeUndefined();
  });
});

describe('Today and views', () => {
  it('caps Today and ranks by priority then due date', () => {
    const tasks = [
      T({ id: 1, Priority: 'P2', DueDate: '2026-11-20' }), T({ id: 2, Priority: 'P0', ThisWeek: true }), T({ id: 3, Priority: 'P1', DueDate: '2026-11-22' }),
      T({ id: 4, Priority: 'P1', DueDate: '2026-11-21' }), T({ id: 5, Priority: 'P3', DueDate: '2026-11-01' }), T({ id: 6, Status: 'Done', DueDate: '2026-11-01' }),
    ];
    expect(proposeToday(tasks, TODAY, 3).map((t) => t.id)).toEqual([2, 4, 3]);
    expect(proposeToday(tasks, TODAY, 10).map((t) => t.id)).not.toContain(6);
  });
  it('puts tasks pinned for today first and ignores Inbox and Waiting items that are merely due', () => {
    const tasks = [T({ id: 1, Priority: 'P0', DueDate: TODAY }), T({ id: 2, Priority: 'P3', TodayDate: TODAY }), T({ id: 3, Status: 'Inbox', DueDate: TODAY })];
    expect(proposeToday(tasks, TODAY).map((t) => t.id)).toEqual([2, 1]);
  });
  it('ranks strategic contributions ahead on ties', () => {
    const r = rankTasks([T({ id: 1, Priority: 'P1', DueDate: TODAY, ContributionType: 'Operations' }), T({ id: 2, Priority: 'P1', DueDate: TODAY, ContributionType: 'Milestone' })], TODAY);
    expect(r.map((t) => t.id)).toEqual([2, 1]);
  });
  it('lists done this week by completion date', () => {
    const d = doneThisWeek([T({ id: 1, Status: 'Done', CompletedAt: '2026-11-23T14:00:00Z' }), T({ id: 2, Status: 'Done', CompletedAt: '2026-11-20T14:00:00Z' })], TODAY);
    expect(d.map((t) => t.id)).toEqual([1]);
  });
  it('flags hygiene issues', () => {
    const created = (t: Task) => (t.id === 1 ? '2026-11-10' : t.id === 3 ? '2026-10-01' : '2026-11-22');
    const h = hygiene([T({ id: 1, Status: 'Inbox' }), T({ id: 2, Status: 'Inbox' }), T({ id: 3, Status: 'Next', ContributionType: 'Operations' }), T({ id: 4, Status: 'Next', ContributionType: 'Milestone' })], TODAY, created);
    expect(h.staleInbox.map((t) => t.id)).toEqual([1]);
    expect(h.undatedNext.map((t) => t.id)).toEqual([3]);
    expect(h.unlinkedStrategic.map((t) => t.id)).toEqual([4]);
  });
});
