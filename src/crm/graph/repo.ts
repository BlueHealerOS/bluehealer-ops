import { dealDataProblem } from '../../domain/guards.ts';
import { CRM_MERGE_LOG, type CrmListName } from '../schema.ts';

/** A stale write: the record changed since it was loaded (HTTP 412 from SharePoint). */
export class ConflictError extends Error {
  constructor() { super('This record changed. Reload to see the update.'); this.name = 'ConflictError'; }
}
/** Input that cannot be saved. The message is safe to show. */
export class CrmValidationError extends Error {
  constructor(message: string, public field?: string) { super(message); this.name = 'CrmValidationError'; }
}

/** One list item. `fields` use SharePoint names: Title and the column names, with lookups as `<Name>LookupId` (an array for multi-lookups). */
export interface Row { id: number; etag?: string; fields: Record<string, unknown> }

export interface TaskInput {
  Title: string; Status: 'Next'; Priority: 'P2'; DueDate: string; ContributionType: 'Relationship'; Owner: string; ExtId: string; Source: 'manual'; Description?: string;
}

/**
 * The only door to CRM data. One implementation talks to Microsoft Graph, one is in memory for fixture mode and tests.
 * Writes carry the item's eTag; a stale eTag raises ConflictError. Nothing here is cached outside memory.
 */
export interface CrmRepo {
  listAll(list: CrmListName): Promise<Row[]>;
  get(list: CrmListName, id: number): Promise<Row | undefined>;
  create(list: CrmListName, fields: Record<string, unknown>): Promise<Row>;
  /** `null` clears a field. Without an eTag the write is unconditional. */
  update(list: CrmListName, id: number, etag: string | undefined, fields: Record<string, unknown>): Promise<Row>;
  remove(list: CrmListName, id: number): Promise<void>;
  /** Creates a Tasks item for a follow-up. Resolves to null when there is no Tasks list. */
  createTask(task: TaskInput): Promise<{ id: number } | null>;
}

/** JSON snapshots are machine text and exempt from the currency check; every other text field is checked (D27). */
const EXEMPT = new Set([`${CRM_MERGE_LOG}.Snapshot`]);
export function assertNoDealData(list: CrmListName, fields: Record<string, unknown>): void {
  for (const [k, v] of Object.entries(fields)) {
    if (typeof v !== 'string' || EXEMPT.has(`${list}.${k}`)) continue;
    const p = dealDataProblem(v);
    if (p) throw new CrmValidationError(p, k);
  }
}
