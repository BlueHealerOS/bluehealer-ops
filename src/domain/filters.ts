import type { Task } from './types';
import { addDays } from './time';

export const DUE_WINDOWS = ['overdue', 'today', 'this week', 'next 14 days', 'no date'] as const;
export type DueWindow = (typeof DUE_WINDOWS)[number];

/** Structured facets. AND across facets, OR within a facet. */
export interface FacetState {
  owner?: string[]; status?: string[]; priority?: string[]; contribution?: string[]; track?: string[];
  source?: string[]; context?: string[]; effort?: string[]; sensitivity?: string[]; due?: string[]; label?: string[];
}
export const FACET_KEYS = ['owner', 'status', 'priority', 'contribution', 'track', 'source', 'context', 'effort', 'sensitivity', 'due', 'label'] as const;
export type FacetKey = (typeof FACET_KEYS)[number];

export function dueWindowOf(due: string | undefined, today: string): DueWindow {
  if (!due) return 'no date';
  if (due < today) return 'overdue';
  if (due === today) return 'today';
  if (due <= addDays(today, 6)) return 'this week';
  if (due <= addDays(today, 14)) return 'next 14 days';
  return 'no date'; // beyond the window; matches no facet value except via explicit list view
}

const matchOne = (vals: string[] | undefined, v: string | undefined) => !vals?.length || (v !== undefined && vals.includes(v));

export function applyFacets(tasks: Task[], f: FacetState, today: string): Task[] {
  return tasks.filter((t) => {
    if (!matchOne(f.owner, t.Owner)) return false;
    if (!matchOne(f.status, t.Status)) return false;
    if (!matchOne(f.priority, t.Priority)) return false;
    if (!matchOne(f.contribution, t.ContributionType)) return false;
    if (!matchOne(f.source, t.Source)) return false;
    if (!matchOne(f.context, t.Context)) return false;
    if (!matchOne(f.effort, t.Effort)) return false;
    if (!matchOne(f.sensitivity, t.Sensitivity ?? 'normal')) return false;
    if (f.track?.length && !(t.Track ?? []).some((x) => f.track!.includes(x))) return false;
    if (f.label?.length) {
      const tags = (t.Labels ?? '').split(';').map((s) => s.trim().toLowerCase()).filter(Boolean);
      if (!f.label.some((l) => tags.includes(l.toLowerCase()))) return false;
    }
    if (f.due?.length && !f.due.includes(dueWindowOf(t.DueDate, today))) return false;
    return true;
  });
}

/** View URLs carry facet values only, never record content. */
export function facetsToQuery(f: FacetState): string {
  const p = new URLSearchParams();
  for (const k of FACET_KEYS) if (f[k]?.length) p.set(k, f[k]!.join(','));
  return p.toString();
}
export function facetsFromQuery(q: string): FacetState {
  const p = new URLSearchParams(q);
  const out: FacetState = {};
  for (const k of FACET_KEYS) {
    const v = p.get(k);
    if (v) out[k] = v.split(',').map((s) => s.trim()).filter(Boolean);
  }
  return out;
}

/** Default saved views (stored in Settings). */
export const DEFAULT_VIEWS: { name: string; path: string }[] = [
  { name: 'My Today', path: '/tasks/today' },
  { name: 'Jay this week', path: '/tasks/week?owner=Jay,Both' },
  { name: 'Overdue', path: '/tasks/list?due=overdue' },
  { name: 'Waiting on others', path: '/tasks/waiting' },
  { name: 'Proposed', path: '/tasks/proposed' },
  { name: 'Restricted', path: '/tasks/list?sensitivity=restricted' },
];
