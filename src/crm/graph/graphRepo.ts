import { decodeItem, encodeFields, type RawItem } from '../../graph/codec.ts';
import { GraphError } from '../../graph/client.ts';
import type { OpsStore } from '../../graph/store.ts';
import { crmListDef, type CrmListName } from '../schema.ts';
import { assertNoDealData, ConflictError, type CrmRepo, type Row, type TaskInput } from './repo.ts';

/**
 * CRM data through Microsoft Graph with the signed-in founder's own token. Records are never cached here.
 * Provisional: If-Match on `PATCH .../items/{id}/fields` is expected to return 412 for a stale eTag. If the first live test shows
 * otherwise, only `patchPath` below changes.
 */
export class GraphRepo implements CrmRepo {
  private store: OpsStore;
  constructor(store: OpsStore) { this.store = store; }

  private async base(list: CrmListName): Promise<string> {
    try { return `/sites/${await this.store.siteId()}/lists/${await this.store.listId(list)}`; } catch (e) {
      if (e instanceof Error && /does not exist yet/.test(e.message)) throw new Error(`The CRM list "${list}" does not exist yet. Provision the CRM lists first (docs/crm/provisioning-checklist.md).`, { cause: e });
      throw e;
    }
  }
  private patchPath = (base: string, id: number) => `${base}/items/${id}/fields`;

  private row(list: CrmListName, raw: RawItem): Row {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { id, _etag, _created, _modified, ...fields } = decodeItem<Record<string, unknown> & { id: number; _etag?: string; _created?: string; _modified?: string }>(crmListDef(list), raw);
    return { id, etag: _etag, fields };
  }

  async listAll(list: CrmListName) {
    const raws = await this.store.client.getAll<RawItem>(`${await this.base(list)}/items?$expand=fields&$top=200`);
    return raws.map((r) => this.row(list, r));
  }
  async get(list: CrmListName, id: number) {
    try { return this.row(list, await this.store.client.request<RawItem>('GET', `${await this.base(list)}/items/${id}?$expand=fields`)); } catch (e) {
      if (e instanceof GraphError && e.status === 404) return undefined;
      throw e;
    }
  }
  async create(list: CrmListName, fields: Record<string, unknown>) {
    assertNoDealData(list, fields);
    const raw = await this.store.client.request<RawItem>('POST', `${await this.base(list)}/items`, { body: { fields: encodeFields(crmListDef(list), fields) } });
    return raw.eTag ? this.row(list, raw) : (await this.get(list, Number(raw.id)))!;
  }
  async update(list: CrmListName, id: number, etag: string | undefined, fields: Record<string, unknown>) {
    assertNoDealData(list, fields);
    const base = await this.base(list);
    try {
      await this.store.client.request('PATCH', this.patchPath(base, id), { body: encodeFields(crmListDef(list), fields), ...(etag ? { headers: { 'If-Match': etag } } : {}) });
    } catch (e) {
      if (e instanceof GraphError && e.status === 412) throw new ConflictError();
      throw e;
    }
    const fresh = await this.get(list, id); // the PATCH response carries no item eTag, so read it back
    if (!fresh) throw new Error(`${list} item ${id} disappeared after saving`);
    return fresh;
  }
  async remove(list: CrmListName, id: number) {
    await this.store.client.request('DELETE', `${await this.base(list)}/items/${id}`); // goes to the SharePoint recycle bin
  }
  async createTask(task: TaskInput) {
    try { const t = await this.store.create<{ id: number }>('Tasks', { ...task }); return { id: t.id }; } catch (e) {
      if (e instanceof Error && /does not exist yet/.test(e.message)) return null;
      throw e;
    }
  }
}
