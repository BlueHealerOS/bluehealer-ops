import { mostRestrictive } from './defaults.ts';
import type { CrmPerson } from './types.ts';

/** Fields a founder can choose between when merging two people. System fields are recomputed, never chosen. */
export const MERGE_FIELDS = ['name', 'organizationId', 'relationshipType', 'owner', 'email', 'importance', 'comfort', 'agreedCheckIn', 'stage', 'sensitivity'] as const;
export type MergeField = (typeof MERGE_FIELDS)[number];
export type MergeChoice = 'keep' | 'lose';
export type MergeChoices = Partial<Record<MergeField, MergeChoice>>;

const blank = (v: unknown) => v === undefined || v === null || v === '';

/** The record that survives keeps its values, except a blank field takes the other record's value. Founders can override each field. */
export function defaultChoices(keep: CrmPerson, lose: CrmPerson): MergeChoices {
  const out: MergeChoices = {};
  for (const f of MERGE_FIELDS) out[f] = blank(keep[f]) && !blank(lose[f]) ? 'lose' : 'keep';
  return out;
}

/** The values to write on the surviving record: only fields whose chosen value differs. A merged record is never less restrictive than either record. */
export function mergedPatch(keep: CrmPerson, lose: CrmPerson, choices: MergeChoices): { [K in MergeField]?: CrmPerson[K] | null } {
  const patch: { [K in MergeField]?: CrmPerson[K] | null } = {};
  const chosen = (f: MergeField) => ((choices[f] ?? 'keep') === 'lose' ? lose[f] : keep[f]);
  for (const f of MERGE_FIELDS) {
    const v = f === 'sensitivity' ? mostRestrictive([keep.sensitivity, lose.sensitivity]) : chosen(f);
    if (v === keep[f]) continue;
    (patch as Record<string, unknown>)[f] = blank(v) ? null : v;
  }
  return patch;
}

/** What Undo merge needs: the whole losing record, the surviving record's values before the merge, and each re-pointed interaction's people. */
export interface MergeSnapshot {
  v: 1;
  kind: 'person';
  lose: Omit<CrmPerson, 'etag'>;
  /** Values of the fields the merge changed on the surviving record; null means the field was empty. */
  keepBefore: { [K in MergeField]?: CrmPerson[K] | null };
  links: { interactionId: number; peopleIds: number[] }[];
}

export function parseSnapshot(json: string | undefined): MergeSnapshot | null {
  try {
    const s = JSON.parse(json ?? '') as Partial<MergeSnapshot>;
    return s && s.v === 1 && s.kind === 'person' && s.lose && typeof s.lose.id === 'number' && Array.isArray(s.links) && s.keepBefore ? (s as MergeSnapshot) : null;
  } catch { return null; }
}

/** Replace one person id by another in an interaction's people, keeping order and removing duplicates. */
export function repoint(peopleIds: number[], from: number, to: number): number[] {
  const out: number[] = [];
  for (const id of peopleIds) { const x = id === from ? to : id; if (!out.includes(x)) out.push(x); }
  return out;
}
