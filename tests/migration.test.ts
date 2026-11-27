import { describe, expect, it } from 'vitest';
import { provisioned } from './helpers';
import type { Task } from '../src/domain/types';
import { applyMigrationV2, prepareMigrationV2, restoreMigrationV2 } from '../src/provision/migrateV2';
import { isMigrated, parseRollbackReport, planMigrationV2, targetStatus } from '../src/domain/migrateV2';

const OLD = '2026-11-01T09:00:00.000Z';
const NEW = '2026-12-01T15:00:00.000Z';

async function seeded() {
  const env = await provisioned({ now: () => OLD });
  const f = env.fake;
  const ids = {
    inboxP1: f.seed('Tasks', { Title: 'Fictional inbox item', Status: 'Inbox', Priority: 'P1' }),
    inboxP3: f.seed('Tasks', { Title: 'Fictional low item', Status: 'Inbox', Priority: 'P3' }),
    nextWeek: f.seed('Tasks', { Title: 'Fictional this-week item', Status: 'Next', ThisWeek: true, Priority: 'P0' }),
    next: f.seed('Tasks', { Title: 'Fictional next item', Status: 'Next', Priority: 'P2' }),
    doing: f.seed('Tasks', { Title: 'Fictional in-progress item', Status: 'In progress' }),
    waiting: f.seed('Tasks', { Title: 'Fictional waiting item', Status: 'Waiting', WaitingOn: 'Example Vendor', WaitingExpected: '2026-12-04T12:00:00Z' }),
    done: f.seed('Tasks', { Title: 'Fictional done item', Status: 'Done', CompletedAt: '2026-11-20T10:00:00Z' }),
    dropped: f.seed('Tasks', { Title: 'Fictional dropped item', Status: 'Dropped', DropReason: 'Not needed' }),
    proposed: f.seed('Tasks', { Title: 'Fictional suggestion', Status: 'Proposed' }),
    restricted: f.seed('Tasks', { Title: 'Fictional restricted item', Status: 'Inbox', Sensitivity: 'restricted' }),
  };
  f.state.now = () => NEW; // later writes carry a newer modified time
  return { ...env, ids };
}

const statusOf = async (env: Awaited<ReturnType<typeof seeded>>, id: number) => (await env.store.getItem<Task>('Tasks', id)).Status;

describe('status mapping', () => {
  it('maps Inbox and Next as agreed, and leaves the rest', () => {
    expect(targetStatus({ Status: 'Inbox' })).toBe('Backlog');
    expect(targetStatus({ Status: 'Next', ThisWeek: true })).toBe('This week');
    expect(targetStatus({ Status: 'Next', ThisWeek: false })).toBe('Backlog');
    expect(targetStatus({ Status: 'Next' })).toBe('Backlog');
    for (const s of ['In progress', 'Waiting', 'Done', 'Dropped', 'Proposed', 'Backlog', 'This week'] as const) expect(targetStatus({ Status: s })).toBe(s);
  });
});

describe('dry run', () => {
  it('reports every row of the mapping and writes nothing', async () => {
    const env = await seeded();
    const before = env.fake.state.requests.length;
    const { plan } = await prepareMigrationV2(env.store, new Date(NEW));
    const writes = env.fake.state.requests.slice(before).filter((r) => r.method !== 'GET');
    expect(writes).toEqual([]);
    expect(plan.report).toMatchObject({
      'Tasks scanned': 10,
      'Inbox to Backlog': 3,
      'Next (this week) to This week': 1,
      'Next (other) to Backlog': 1,
      'In progress (unchanged)': 1,
      'Waiting (unchanged)': 1,
      'Waiting: check-again date copied from the expected date': 1,
      'Waiting: no "waiting for" text yet (flagged)': 1,
      'Done and Dropped (left alone)': 2,
      'Proposed (not a board column)': 1,
      'Already migrated (skipped)': 0,
      'Cards without a workstream after migration': 8,
      'Restricted records included (updated, never cached)': 1,
      'Cards to update': 8,
      'Batches of 20': 1,
    });
  });

  it('refuses to run before the new columns exist', async () => {
    const env = await seeded();
    const tasks = env.fake.state.lists.find((l) => l.displayName === 'Tasks')!;
    tasks.columns = tasks.columns.filter((c) => c.name !== 'SortKey');
    env.store.invalidate();
    await expect(prepareMigrationV2(env.store)).rejects.toThrow(/new columns are not in the Tasks list/);
  });

  it('puts no titles in the rollback report', async () => {
    const env = await seeded();
    const { rollback } = await prepareMigrationV2(env.store, new Date(NEW));
    expect(JSON.stringify(rollback)).not.toContain('Fictional');
    expect(rollback.entries).toHaveLength(8);
    expect(parseRollbackReport(JSON.stringify(rollback)).entries).toHaveLength(8);
  });
});

describe('apply', () => {
  it('moves cards, orders each column by priority and due date, and keeps the time of the last real edit', async () => {
    const env = await seeded();
    const { plan } = await prepareMigrationV2(env.store, new Date(NEW));
    expect(await applyMigrationV2(env.store, plan, new Date(NEW))).toBe('Updated 8 of 8 cards.');
    const get = (id: number) => env.store.getItem<Task>('Tasks', id);
    expect(await statusOf(env, env.ids.inboxP1)).toBe('Backlog');
    expect(await statusOf(env, env.ids.nextWeek)).toBe('This week');
    expect(await statusOf(env, env.ids.next)).toBe('Backlog');
    expect(await statusOf(env, env.ids.done)).toBe('Done'); // closed cards are not touched
    const backlog = (await Promise.all([env.ids.inboxP1, env.ids.inboxP3, env.ids.next, env.ids.restricted].map(get))).sort((a, b) => a.SortKey! - b.SortKey!);
    expect(backlog.map((t) => t.Title)).toEqual(['Fictional inbox item', 'Fictional next item', 'Fictional restricted item', 'Fictional low item']); // P1, P2, P2 (restricted: default P2, later id), P3
    expect(backlog.map((t) => t.SortKey)).toEqual([1024, 2048, 3072, 4096]);
    const w = await get(env.ids.waiting);
    expect(w).toMatchObject({ Status: 'Waiting', CheckAgain: '2026-12-04', Kind: 'Task', LastTouched: OLD });
    expect((await get(env.ids.doing)).LastTouched).toBe(OLD); // not the migration time
    expect((await get(env.ids.proposed)).SortKey).toBeUndefined(); // Proposed is not a board column
    expect((await get(env.ids.done)).Kind).toBeUndefined();
  });

  it('records the run in Settings', async () => {
    const env = await seeded();
    const { plan } = await prepareMigrationV2(env.store, new Date(NEW));
    await applyMigrationV2(env.store, plan, new Date(NEW));
    const [row] = await env.store.items<{ Key?: string; ValueJson?: string }>('Settings', { filter: "fields/Key eq 'migrationV2'" });
    expect(JSON.parse(row!.ValueJson!)).toEqual({ date: NEW, updated: 8, planned: 8 });
  });

  it('is idempotent: a second run finds nothing to do and writes nothing', async () => {
    const env = await seeded();
    const first = await prepareMigrationV2(env.store, new Date(NEW));
    await applyMigrationV2(env.store, first.plan, new Date(NEW));
    const again = await prepareMigrationV2(env.store, new Date(NEW));
    expect(again.plan.rows).toEqual([]);
    expect(again.plan.report['Already migrated (skipped)']).toBe(8);
  });

  it('adds new cards after the keys already in a column', () => {
    const base = { id: 0, Title: 't', Status: 'Backlog', Kind: 'Task', LastTouched: OLD } as never;
    const tasks = [
      { ...(base as object), id: 1, SortKey: 5000 },
      { ...(base as object), id: 2, SortKey: undefined, Status: 'Inbox', Kind: undefined, LastTouched: undefined, _modified: OLD },
    ] as never[];
    const plan = planMigrationV2(tasks);
    expect(plan.rows).toHaveLength(1);
    expect(plan.rows[0]?.changes.SortKey).toBe(6024);
  });

  it('knows when a card is already migrated', () => {
    expect(isMigrated({ Status: 'Backlog', Kind: 'Task', LastTouched: OLD, SortKey: 1024 } as never)).toBe(true);
    expect(isMigrated({ Status: 'Inbox', Kind: 'Task', LastTouched: OLD, SortKey: 1024 } as never)).toBe(false);
    expect(isMigrated({ Status: 'Backlog', Kind: 'Task', LastTouched: OLD } as never)).toBe(false);
    expect(isMigrated({ Status: 'Proposed', Kind: 'Task', LastTouched: OLD } as never)).toBe(true);
  });
});

describe('restore', () => {
  it('puts the previous status back from the downloaded report', async () => {
    const env = await seeded();
    const { plan, rollback } = await prepareMigrationV2(env.store, new Date(NEW));
    await applyMigrationV2(env.store, plan, new Date(NEW));
    expect(await statusOf(env, env.ids.inboxP1)).toBe('Backlog');
    expect(await restoreMigrationV2(env.store, parseRollbackReport(JSON.stringify(rollback)))).toBe('Restored the previous status on 5 of 5 cards.'); // 3 Inbox and 2 Next cards changed status
    expect(await statusOf(env, env.ids.inboxP1)).toBe('Inbox');
    expect(await statusOf(env, env.ids.nextWeek)).toBe('Next');
    expect(await statusOf(env, env.ids.doing)).toBe('In progress');
  });

  it('refuses a file that is not a migration report', () => {
    expect(() => parseRollbackReport('{"hello":1}')).toThrow(/not a migration report/);
    expect(() => parseRollbackReport('nope')).toThrow(/not a migration report/);
  });
});
