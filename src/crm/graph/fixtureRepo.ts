import type { CrmInteraction, CrmOrg, CrmPerson } from '../model/types.ts';
import { CRM_INTERACTIONS, CRM_ORGANIZATIONS, CRM_PEOPLE, crmListDef, type CrmListName } from '../schema.ts';
import { interactionToFields, orgToFields, personToFields } from './mappers.ts';
import { assertNoDealData, ConflictError, type CrmRepo, type Row, type TaskInput } from './repo.ts';

export interface FixtureSeed { orgs: CrmOrg[]; people: CrmPerson[]; interactions: CrmInteraction[] }
interface Stored { fields: Record<string, unknown>; seq: number }

/** In-memory repository for fixture mode and tests. Same contract as the Graph repository, including eTags. Holds only what it is given. */
export class FixtureRepo implements CrmRepo {
  private lists = new Map<CrmListName, { rows: Map<number, Stored>; next: number }>();
  readonly tasks: (TaskInput & { id: number })[] = [];
  /** Set false to behave like a site with no Tasks list. */
  hasTasksList = true;
  /** Every call, in order, so tests can assert what was written. */
  readonly log: { op: string; list?: CrmListName; id?: number }[] = [];

  constructor(seed: Partial<FixtureSeed> = {}) {
    for (const n of [CRM_ORGANIZATIONS, CRM_PEOPLE, CRM_INTERACTIONS, 'CRM Merge Log'] as CrmListName[]) this.lists.set(n, { rows: new Map(), next: 1 });
    const load = (list: CrmListName, id: number, fields: Record<string, unknown>) => {
      const l = this.lists.get(list)!;
      l.rows.set(id, { fields, seq: 1 });
      l.next = Math.max(l.next, id + 1);
    };
    for (const o of seed.orgs ?? []) load(CRM_ORGANIZATIONS, o.id, orgToFields(o));
    for (const p of seed.people ?? []) load(CRM_PEOPLE, p.id, personToFields(p));
    for (const i of seed.interactions ?? []) load(CRM_INTERACTIONS, i.id, interactionToFields(i));
  }

  private list(n: CrmListName) { return this.lists.get(n)!; }
  private view(id: number, s: Stored): Row { return { id, etag: `"${id},${s.seq}"`, fields: structuredClone(s.fields) }; }

  async listAll(list: CrmListName) { this.log.push({ op: 'listAll', list }); return [...this.list(list).rows].map(([id, s]) => this.view(id, s)); }
  async get(list: CrmListName, id: number) { const s = this.list(list).rows.get(id); return s ? this.view(id, s) : undefined; }
  async create(list: CrmListName, fields: Record<string, unknown>) {
    assertNoDealData(list, fields);
    const l = this.list(list), id = l.next++;
    const s: Stored = { fields: structuredClone(fields), seq: 1 };
    for (const c of crmListDef(list).columns) if (c.default && s.fields[c.name] === undefined) s.fields[c.name] = c.default; // as SharePoint does
    l.rows.set(id, s);
    this.log.push({ op: 'create', list, id });
    return this.view(id, s);
  }
  async update(list: CrmListName, id: number, etag: string | undefined, fields: Record<string, unknown>) {
    assertNoDealData(list, fields);
    const s = this.list(list).rows.get(id);
    if (!s) throw new Error(`${list} item ${id} not found`);
    if (etag && etag !== `"${id},${s.seq}"`) throw new ConflictError();
    for (const [k, v] of Object.entries(fields)) { if (v === null) delete s.fields[k]; else s.fields[k] = structuredClone(v); }
    s.seq++;
    this.log.push({ op: 'update', list, id });
    return this.view(id, s);
  }
  async remove(list: CrmListName, id: number) { this.list(list).rows.delete(id); this.log.push({ op: 'remove', list, id }); }
  async createTask(task: TaskInput) {
    if (!this.hasTasksList) return null;
    const t = { ...task, id: this.tasks.length + 1 };
    this.tasks.push(t);
    return { id: t.id };
  }

  /** Test helper: another founder saved this item, so the next write with the old eTag conflicts. */
  touch(list: CrmListName, id: number) { const s = this.list(list).rows.get(id); if (s) s.seq++; }
}
