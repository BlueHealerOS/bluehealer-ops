import type { Column, ListDef } from '../schema/lists.ts';
import { fromGraphDate, toGraphDate } from '../domain/time.ts';

export interface RawItem {
  id: string;
  eTag?: string;
  createdDateTime?: string;
  lastModifiedDateTime?: string;
  fields: Record<string, unknown>;
}
export type Decoded<T> = T & { id: number; _created?: string; _modified?: string; _etag?: string };

/** Domain key for a column: lookups are exposed as `<Name>LookupId`. */
export const keyOf = (c: Column) => (c.type === 'lookup' ? `${c.name}LookupId` : c.name);

export function decodeItem<T>(list: ListDef, raw: RawItem): Decoded<T> {
  const f = raw.fields ?? {};
  const out: Record<string, unknown> = { id: Number(raw.id), Title: f.Title ?? '', _created: raw.createdDateTime, _modified: raw.lastModifiedDateTime, _etag: raw.eTag };
  for (const c of list.columns) {
    const k = keyOf(c);
    const v = f[k];
    if (v === undefined || v === null || v === '') continue;
    switch (c.type) {
      case 'date': out[k] = fromGraphDate(v); break;
      case 'lookup': out[k] = c.multiple ? (Array.isArray(v) ? v.map(Number) : [Number(v)]) : Number(v); break;
      case 'multichoice': out[k] = Array.isArray(v) ? v : [String(v)]; break;
      case 'url': out[k] = typeof v === 'object' ? (v as { Url?: string }).Url : String(v); break;
      case 'number': out[k] = Number(v); break;
      case 'boolean': out[k] = v === true || v === 'true'; break;
      default: out[k] = v;
    }
  }
  return out as Decoded<T>;
}

/** Encode only the keys present. `null` clears a value; `undefined` is skipped. */
export function encodeFields(list: ListDef, partial: Record<string, unknown>): Record<string, unknown> {
  const byKey = new Map(list.columns.map((c) => [keyOf(c), c]));
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(partial)) {
    if (v === undefined || k === 'id' || k.startsWith('_')) continue;
    if (k === 'Title') { out.Title = v; continue; }
    const c = byKey.get(k);
    if (!c) throw new Error(`Unknown column ${list.name}.${k}`);
    if (v === null) { out[k] = null; continue; }
    switch (c.type) {
      case 'date': out[k] = toGraphDate(String(v)); break;
      case 'multichoice': out[k] = v; out[`${k}@odata.type`] = 'Collection(Edm.String)'; break;
      case 'lookup': out[k] = v; if (c.multiple) out[`${k}@odata.type`] = 'Collection(Edm.Int32)'; break;
      case 'url': out[k] = { Url: String(v), Description: String(v) }; break;
      default: out[k] = v;
    }
  }
  return out;
}
