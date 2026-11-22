import type { MilestoneFull, Task } from './types';
import { diffDays } from './time';

/** Share of linked tasks done. Dropped tasks are ignored. The owner's status stays authoritative. */
export function progress(milestoneId: number, tasks: Pick<Task, 'Status' | 'MilestoneLookupId'>[]) {
  const linked = tasks.filter((t) => t.MilestoneLookupId === milestoneId && t.Status !== 'Dropped');
  const done = linked.filter((t) => t.Status === 'Done').length;
  return { done, total: linked.length, pct: linked.length ? Math.round((done / linked.length) * 100) : 0 };
}

/** A target that moves keeps its baseline: set it once, never overwrite. */
export function withBaseline(before: Pick<MilestoneFull, 'TargetDate' | 'BaselineDate'> | undefined, nextTarget: string | undefined): { BaselineDate?: string } {
  if (before?.BaselineDate) return {};
  const d = before?.TargetDate ?? nextTarget;
  return d ? { BaselineDate: d } : {};
}

export const slipDays = (m: Pick<MilestoneFull, 'TargetDate' | 'BaselineDate'>) =>
  m.TargetDate && m.BaselineDate ? diffDays(m.TargetDate, m.BaselineDate) : 0;

/** The end-of-February 2027 milestones, seeded as drafts for founder confirmation. */
export const FEBRUARY_TARGET = '2027-02-26';
export const SEED_MILESTONES: { Title: string; Owner: 'Santiago' | 'Jay' | 'Both'; Track: string[] }[] = [
  { Title: 'Money in the bank (friends and family round)', Owner: 'Jay', Track: ['Pitch and Investors'] },
  { Title: 'Cadaver testing underway', Owner: 'Santiago', Track: ['Research and Development'] },
  { Title: 'Clarity on customers', Owner: 'Both', Track: ['Clinical and Customer Evidence'] },
  { Title: 'Trial design', Owner: 'Santiago', Track: ['Clinical and Customer Evidence'] },
  { Title: 'Reimbursement and regulatory pathway with benchtop data', Owner: 'Santiago', Track: ['Regulatory and Quality', 'Reimbursement'] },
  { Title: 'Light QMS and risk framework', Owner: 'Santiago', Track: ['Regulatory and Quality'] },
];
