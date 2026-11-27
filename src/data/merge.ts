// Three-way merge of field edits, used when SharePoint refuses a write with HTTP 412 because another founder saved the card first
// (docs/PLAN-v2.md section 5.3, item 6). Nothing is ever overwritten silently: a field both founders changed becomes a conflict.

export type Fields = Record<string, unknown>;

export interface FieldConflict {
  field: string;
  mine: unknown;
  theirs: unknown;
}

export interface MergeResult {
  /** My edits that touch no field the other founder changed; safe to write. */
  apply: Fields;
  /** Fields both founders changed to different values; a founder chooses. */
  conflicts: FieldConflict[];
}

/** `null`, `undefined` and an empty string all mean "no value" in a list item. */
const norm = (v: unknown) => (v === null || v === undefined || v === '' ? null : v);
const same = (a: unknown, b: unknown) => JSON.stringify(norm(a)) === JSON.stringify(norm(b));

/**
 * @param base   the card's fields at the ETag my edit was made against
 * @param mine   my pending edit (a field set to null clears it)
 * @param theirs the card's fields on the server now
 */
export function mergeWrite(base: Fields, mine: Fields, theirs: Fields): MergeResult {
  const apply: Fields = {};
  const conflicts: FieldConflict[] = [];
  for (const [field, value] of Object.entries(mine)) {
    if (same(theirs[field], base[field])) apply[field] = value; // the other founder left this field alone
    else if (same(theirs[field], value)) continue; // both made the same change; nothing to write
    else conflicts.push({ field, mine: value, theirs: theirs[field] ?? null });
  }
  return { apply, conflicts };
}

/** Fields after a successful write: `null` removes a field, anything else replaces it. */
export function applyPatch(fields: Fields, patch: Fields): Fields {
  const out: Fields = { ...fields };
  for (const [k, v] of Object.entries(patch)) {
    if (v === null) delete out[k];
    else out[k] = v;
  }
  return out;
}
