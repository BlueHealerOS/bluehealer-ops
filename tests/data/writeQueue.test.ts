import { describe, expect, it } from 'vitest';
import { BACKOFF_MS, MAX_ATTEMPTS, WriteQueue } from '../../src/data/writeQueue';
import { closeTask } from '../../src/domain/closeTask';
import type { Task } from '../../src/domain/types';
import { fakeServer, manualClock, tick } from './support';

const known = (s: ReturnType<typeof fakeServer>) => ({ etag: `"${s.etagSeq}"`, fields: { ...s.fields } });
const make = (init = { Title: 'Reply', Status: 'Backlog', Priority: 'P2' }, extra: Parameters<ReturnType<typeof fakeServer>['deps']>[0] = {}) => {
  const server = fakeServer(init);
  const clock = manualClock();
  const q = new WriteQueue({ ...server.deps(extra), schedule: clock.schedule });
  return { server, clock, q };
};

describe('write queue: coalescing and ETag', () => {
  it('waits 400 ms and sends one PATCH for several edits, with If-Match', async () => {
    const { server, clock, q } = make();
    q.enqueue(1, { Status: 'This week' }, { known: known(server) });
    await clock.advance(300);
    q.enqueue(1, { Priority: 'P1' }, { known: known(server) });
    await clock.advance(300);
    expect(server.writes).toHaveLength(0); // the second edit restarted the 400 ms window
    await clock.advance(200);
    expect(server.writes).toEqual([{ patch: { Status: 'This week', Priority: 'P1' }, ifMatch: '"1"' }]);
    expect(q.unsaved()).toBe(0);
  });

  it('uses the ETag from the response for the next write', async () => {
    const { server, clock, q } = make();
    q.enqueue(1, { Priority: 'P1' }, { known: known(server) });
    await clock.advance(400);
    q.enqueue(1, { Priority: 'P0' }, { known: known(server) });
    await clock.advance(400);
    expect(server.writes.map((w) => w.ifMatch)).toEqual(['"1"', '"2"']);
  });

  it('reads the ETag when the response does not carry one', async () => {
    const { server, clock, q } = make(undefined, { returnEtag: false });
    q.enqueue(1, { Priority: 'P1' }, { known: known(server) });
    await clock.advance(400);
    q.enqueue(1, { Priority: 'P0' }, { known: known(server) });
    await clock.advance(400);
    expect(server.reads).toBe(2);
    expect(server.writes.map((w) => w.ifMatch)).toEqual(['"1"', '"2"']);
    expect(server.writes).toHaveLength(2);
  });

  it('collects edits made while a write is in flight into the next write', async () => {
    const { server, clock } = make();
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    const deps = server.deps();
    const slow = { ...deps, update: async (id: number, p: Record<string, unknown>, o: { ifMatch?: string }) => { await gate; return deps.update(id, p, o); }, schedule: clock.schedule };
    const q = new WriteQueue(slow);
    q.enqueue(1, { Priority: 'P1' }, { known: known(server) });
    await clock.advance(400);
    expect(q.getSnapshot().items[1]?.state).toBe('saving');
    q.enqueue(1, { Status: 'In progress' }, { known: known(server) });
    release();
    await q.flush();
    expect(server.writes.map((w) => w.patch)).toEqual([{ Priority: 'P1' }, { Status: 'In progress' }]);
    expect(q.unsaved()).toBe(0);
  });

  it('adds a stamp such as LastTouched to every write', async () => {
    const server = fakeServer({ Title: 'Reply' });
    const clock = manualClock();
    const q = new WriteQueue({ ...server.deps(), schedule: clock.schedule, stamp: () => ({ LastTouched: '2026-12-01T10:00:00Z' }) });
    q.enqueue(1, { Priority: 'P1' }, { known: known(server) });
    await clock.advance(400);
    expect(server.writes[0]?.patch).toEqual({ Priority: 'P1', LastTouched: '2026-12-01T10:00:00Z' });
  });

  it('notifies subscribers and counts unsaved cards', async () => {
    const { server, clock, q } = make();
    const seen: number[] = [];
    q.subscribe(() => seen.push(q.getSnapshot().unsaved));
    q.enqueue(1, { Priority: 'P1' }, { known: known(server) });
    q.enqueue(2, { Priority: 'P1' }, { known: known(server) });
    expect(q.unsaved()).toBe(2);
    await clock.advance(400);
    expect(q.unsaved()).toBe(0);
    expect(seen[0]).toBe(1);
    expect(seen.at(-1)).toBe(0);
  });

  it('flush writes at once', async () => {
    const { server, q } = make();
    q.enqueue(1, { Priority: 'P1' }, { known: known(server) });
    await q.flush();
    expect(server.writes).toHaveLength(1);
  });
});

describe('write queue: conflicts (HTTP 412)', () => {
  it('merges my edit when the other founder changed different fields, and retries with the new ETag', async () => {
    const { server, clock, q } = make();
    const k = known(server);
    server.external({ Priority: 'P0' }); // another founder saved first
    q.enqueue(1, { Status: 'This week' }, { known: k });
    await clock.advance(400);
    expect(server.writes.map((w) => ({ patch: w.patch, ifMatch: w.ifMatch }))).toEqual([
      { patch: { Status: 'This week' }, ifMatch: '"1"' }, // refused
      { patch: { Status: 'This week' }, ifMatch: '"2"' }, // merged, with theirs
    ]);
    expect(server.fields).toMatchObject({ Priority: 'P0', Status: 'This week' }); // nothing of theirs lost
    expect(q.unsaved()).toBe(0);
  });

  it('writes nothing when both founders made the same change', async () => {
    const { server, clock, q } = make();
    const k = known(server);
    server.external({ Status: 'This week' });
    q.enqueue(1, { Status: 'This week' }, { known: k });
    await clock.advance(400);
    expect(server.writes.filter((w) => w.ifMatch === '"2"')).toHaveLength(0);
    expect(q.unsaved()).toBe(0);
  });

  it('stops on a field both changed, keeps theirs on screen and writes only after a founder chooses', async () => {
    const { server, clock, q } = make();
    const k = known(server);
    server.external({ Status: 'In progress' });
    q.enqueue(1, { Status: 'This week', Priority: 'P1' }, { known: k });
    await clock.advance(400);
    const s = q.getSnapshot().items[1];
    expect(s?.state).toBe('conflict');
    expect(s?.conflicts).toEqual([{ field: 'Status', mine: 'This week', theirs: 'In progress' }]);
    expect(s?.theirs).toMatchObject({ Status: 'In progress' });
    expect(server.fields.Status).toBe('In progress'); // nothing overwritten
    q.resolveConflict(1, 'mine');
    await q.flush();
    expect(server.fields).toMatchObject({ Status: 'This week', Priority: 'P1' });
    expect(q.unsaved()).toBe(0);
  });

  it('keeps theirs when a founder chooses theirs, and still writes the uncontested fields', async () => {
    const { server, clock, q } = make();
    const k = known(server);
    server.external({ Status: 'In progress' });
    q.enqueue(1, { Status: 'This week', Priority: 'P1' }, { known: k });
    await clock.advance(400);
    q.resolveConflict(1, 'theirs');
    await q.flush();
    expect(server.fields).toMatchObject({ Status: 'In progress', Priority: 'P1' });
  });

  it('reads the card first when it has no ETag, and merges', async () => {
    const { server, clock, q } = make();
    server.external({ Priority: 'P0' });
    q.enqueue(1, { Status: 'This week' }, { known: { fields: { Title: 'Reply', Status: 'Backlog', Priority: 'P2' } } });
    await clock.advance(400);
    expect(server.reads).toBeGreaterThan(0);
    expect(server.fields).toMatchObject({ Priority: 'P0', Status: 'This week' });
  });
});

describe('write queue: failures', () => {
  it('retries a network failure after 1, 2 and 4 seconds, then saves and resets', async () => {
    const { server, clock, q } = make();
    server.failNext = [new TypeError('Failed to fetch'), new TypeError('Failed to fetch'), new TypeError('Failed to fetch')];
    q.enqueue(1, { Priority: 'P1' }, { known: known(server) });
    await clock.advance(400);
    expect(q.getSnapshot().items[1]).toMatchObject({ state: 'retrying', attempts: 1 });
    expect(clock.pending()).toEqual([1000]);
    await clock.advance(1000);
    expect(clock.pending()).toEqual([2000]);
    await clock.advance(2000);
    expect(clock.pending()).toEqual([4000]);
    await clock.advance(4000);
    expect(server.fields.Priority).toBe('P1');
    expect(q.unsaved()).toBe(0);
  });

  it('keeps the edit visible as failed after 8 attempts, and a retry saves it', async () => {
    const { server, clock, q } = make();
    server.failNext = Array.from({ length: MAX_ATTEMPTS }, () => Object.assign(new Error('Service unavailable'), { status: 503 }));
    q.enqueue(1, { Priority: 'P1' }, { known: known(server) });
    await clock.advance(400);
    for (const ms of BACKOFF_MS.slice(0, MAX_ATTEMPTS - 1)) await clock.advance(ms);
    const s = q.getSnapshot().items[1];
    expect(s).toMatchObject({ state: 'failed', attempts: MAX_ATTEMPTS, error: 'Service unavailable' });
    expect(q.unsaved()).toBe(1); // still counted: nothing is lost quietly
    q.retry(1);
    await q.flush();
    expect(server.fields.Priority).toBe('P1');
    expect(q.unsaved()).toBe(0);
  });

  it('does not retry an error that cannot succeed (access denied)', async () => {
    const { server, clock, q } = make();
    server.failNext = [Object.assign(new Error('Access denied'), { status: 403 })];
    q.enqueue(1, { Priority: 'P1' }, { known: known(server) });
    await clock.advance(400);
    expect(q.getSnapshot().items[1]).toMatchObject({ state: 'failed', attempts: 1 });
    expect(clock.pending()).toEqual([]);
  });

  it('retryAll tries failed cards again, as when the browser comes back online', async () => {
    const { server, clock, q } = make();
    server.failNext = [Object.assign(new Error('Access denied'), { status: 403 })];
    q.enqueue(1, { Priority: 'P1' }, { known: known(server) });
    await clock.advance(400);
    q.retryAll();
    await q.flush();
    expect(server.fields.Priority).toBe('P1');
  });

  it('keeps edits made while a card is failed and sends them with the retry', async () => {
    const { server, clock, q } = make();
    server.failNext = [Object.assign(new Error('Access denied'), { status: 403 })];
    q.enqueue(1, { Priority: 'P1' }, { known: known(server) });
    await clock.advance(400);
    q.enqueue(1, { Status: 'This week' }, { known: known(server) });
    expect(q.getSnapshot().items[1]?.state).toBe('failed');
    q.retry(1);
    await q.flush();
    expect(server.fields).toMatchObject({ Priority: 'P1', Status: 'This week' });
  });
});

describe('write queue: only a founder closes a card', () => {
  const task = { id: 1, Title: 'Reply', Status: 'In progress' } as Task;

  it('refuses a Done write without a close token', () => {
    const { server, q } = make();
    expect(() => q.enqueue(1, { Status: 'Done' }, { known: known(server) })).toThrow(/Only a founder/);
    expect(q.unsaved()).toBe(0);
  });

  it('refuses a look-alike token that closeTask did not issue', () => {
    const { server, q } = make();
    const forged = { founder: 'Jay', at: '2026-12-01T10:00:00Z' } as never;
    expect(() => q.enqueue(1, { Status: 'Done' }, { known: known(server), close: forged })).toThrow(/Only a founder/);
  });

  it('writes Done with the founder and time when closeTask issued the token', async () => {
    const { server, clock, q } = make();
    const c = closeTask(task, 'Jay', '2026-12-01', '2026-12-01T15:00:00.000Z');
    q.enqueue(1, c.update as Record<string, unknown>, { known: known(server), close: c.close });
    await clock.advance(400);
    expect(server.fields).toMatchObject({ Status: 'Done', ClosedBy: 'Jay', CompletedAt: '2026-12-01T15:00:00.000Z' });
  });

  it('does not need a token for any other status change', async () => {
    const { server, clock, q } = make();
    q.enqueue(1, { Status: 'Waiting' }, { known: known(server) });
    await clock.advance(400);
    expect(server.fields.Status).toBe('Waiting');
  });
});

describe('closeTask', () => {
  it('records who closed it, and creates the next instance of a recurring card', () => {
    const t = { id: 5, Title: 'Weekly review', Status: 'Next', Recurrence: 'weekly:MO', DueDate: '2026-12-01', Owner: 'Santiago' } as Task;
    const c = closeTask(t, 'Santiago', '2026-12-01', '2026-12-01T14:00:00.000Z', 'Sent');
    expect(c.update).toMatchObject({ Status: 'Done', ClosedBy: 'Santiago', CompletedAt: '2026-12-01T14:00:00.000Z', OutcomeNote: 'Sent' });
    expect(c.next).toMatchObject({ Title: 'Weekly review', DueDate: '2026-12-07', RecurrenceParentId: 5 });
  });
  it('is the only issuer of tokens', async () => {
    const { isFounderClose } = await import('../../src/domain/closeTask');
    const c = closeTask({ id: 1, Title: 'x', Status: 'Next' } as Task, 'Jay', '2026-12-01', '2026-12-01T00:00:00Z');
    expect(isFounderClose(c.close)).toBe(true);
    expect(isFounderClose({ ...c.close })).toBe(false);
    expect(isFounderClose(null)).toBe(false);
    await tick();
  });
});
