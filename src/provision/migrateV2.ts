// Applies the v2 status migration from the Admin page (docs/PLAN-v2.md section 6.2). Dry run first; never run by a flow or a routine.
import type { OpsStore } from '../graph/store';
import type { Task } from '../domain/types';
import { planMigrationV2, restoreUpdates, rollbackReport, type MigrationPlan, type RollbackReport } from '../domain/migrateV2';

/** Columns the migration writes. They exist once provisioning has been applied. */
export const V2_COLUMNS = ['SortKey', 'LastTouched', 'Kind', 'CheckAgain'] as const;
const CHUNK = 100; // `updateMany` sends these in $batch calls of 20

export interface PreparedMigration {
  plan: MigrationPlan;
  /** The rollback report to download before applying. */
  rollback: RollbackReport;
}

/** Reads every task and works out the changes. Writes nothing. */
export async function prepareMigrationV2(store: OpsStore, now = new Date()): Promise<PreparedMigration> {
  for (const c of V2_COLUMNS) {
    if (!(await store.hasColumn('Tasks', c))) {
      throw new Error('The new columns are not in the Tasks list yet. Please run the dry run and apply under Lists first, then come back.');
    }
  }
  const plan = planMigrationV2(await store.items<Task>('Tasks'));
  return { plan, rollback: rollbackReport(plan, now) };
}

async function writeAll(store: OpsStore, updates: { id: number; fields: Record<string, unknown> }[], onProgress: (m: string) => void): Promise<number> {
  let done = 0;
  for (let i = 0; i < updates.length; i += CHUNK) {
    done += await store.updateMany('Tasks', updates.slice(i, i + CHUNK));
    onProgress(`Updated ${done} of ${updates.length} cards.`);
  }
  return done;
}

/** Writes the planned changes, then records the run in Settings. Safe to run again: finished cards are skipped by the planner. */
export async function applyMigrationV2(store: OpsStore, plan: MigrationPlan, now = new Date(), onProgress: (m: string) => void = () => {}): Promise<string> {
  const updates = plan.rows.map((r) => ({ id: r.id, fields: r.changes }));
  const done = await writeAll(store, updates, onProgress);
  const value = JSON.stringify({ date: now.toISOString(), updated: done, planned: updates.length });
  const [existing] = await store.items<{ Key?: string }>('Settings', { filter: "fields/Key eq 'migrationV2'" });
  const fields = { Title: 'migrationV2', Key: 'migrationV2', ValueJson: value, Scope: 'global' };
  if (existing) await store.update('Settings', existing.id, fields);
  else await store.create('Settings', fields);
  return done === updates.length
    ? `Updated ${done} of ${updates.length} cards.`
    : `Updated ${done} of ${updates.length} cards. Some were skipped (for example while Microsoft slowed requests down). Run the dry run again and apply to finish them.`;
}

/** Puts the previous Status back on every card in a downloaded report. Added columns are left in place. */
export async function restoreMigrationV2(store: OpsStore, report: RollbackReport, onProgress: (m: string) => void = () => {}): Promise<string> {
  const updates = restoreUpdates(report);
  const done = await writeAll(store, updates, onProgress);
  return `Restored the previous status on ${done} of ${updates.length} cards.`;
}
