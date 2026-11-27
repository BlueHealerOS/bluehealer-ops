import { GraphClient, GraphError, SCOPES } from './client';
import { decodeItem, encodeFields, type Decoded, type RawItem } from './codec';
import { LISTS, type ListDef } from '../schema/lists';
import { dealDataProblem } from '../domain/guards';

export interface SiteConfig { siteHostname: string; sitePath: string }

/** Text that is raw capture or machine JSON is exempt from the deal-data text guard. */
const GUARD_EXEMPT = new Set(['Intake.Raw', 'Intake.ProposalJson', 'Settings.ValueJson', 'Tasks.Links', 'Tasks.Checklist']);

export class DealDataError extends Error {}

export class OpsStore {
  private siteIdP?: Promise<string>;
  private listIds?: Promise<Map<string, string>>;

  constructor(public client: GraphClient, private site: SiteConfig) {}

  siteId(): Promise<string> {
    this.siteIdP ??= this.client
      .request<{ id: string }>('GET', `/sites/${this.site.siteHostname}:${this.site.sitePath}?$select=id`)
      .then((s) => s.id)
      .catch((e) => { this.siteIdP = undefined; throw e; });
    return this.siteIdP;
  }

  /** The access probe. A 403 or 404 means this account has no rights on the ops site. */
  async probe(): Promise<'ok' | 'denied'> {
    try {
      await this.siteId();
      return 'ok';
    } catch (e) {
      if (e instanceof GraphError && (e.status === 401 || e.status === 403 || e.status === 404)) return 'denied';
      throw e;
    }
  }

  invalidate() { this.listIds = undefined; this.columns.clear(); }

  private columns = new Map<string, Promise<Set<string>>>();
  /**
   * Whether a list already has a column. The v2 columns arrive when an administrator runs provisioning, which can happen after the
   * app code is deployed, so code that writes a v2 column checks here first. One read per list per session.
   */
  async hasColumn(list: string, column: string): Promise<boolean> {
    let p = this.columns.get(list);
    if (!p) {
      p = (async () => {
        const cols = await this.client.getAll<{ name: string }>(`${await this.base(list)}/columns?$top=200`);
        return new Set(cols.map((c) => c.name));
      })().catch((e) => { this.columns.delete(list); throw e; });
      this.columns.set(list, p);
    }
    return (await p).has(column);
  }

  async listId(name: string): Promise<string> {
    this.listIds ??= (async () => {
      const sid = await this.siteId();
      const ls = await this.client.getAll<{ id: string; displayName: string }>(`/sites/${sid}/lists?$select=id,displayName&$top=100`);
      return new Map(ls.map((l) => [l.displayName, l.id]));
    })().catch((e) => { this.listIds = undefined; throw e; });
    const id = (await this.listIds).get(name);
    if (!id) throw new Error(`List "${name}" does not exist yet. Run provisioning on the Admin page.`);
    return id;
  }

  private def(name: string): ListDef {
    const d = LISTS.find((l) => l.name === name);
    if (!d) throw new Error(`Unknown list ${name}`);
    return d;
  }
  private async base(name: string) { return `/sites/${await this.siteId()}/lists/${await this.listId(name)}`; }

  /** Single indexed-column filter at most. The extra header lets SharePoint answer without a hard failure. */
  async items<T>(name: string, opts: { filter?: string; top?: number } = {}): Promise<Decoded<T>[]> {
    const q = `$expand=fields&$top=${opts.top ?? 200}${opts.filter ? `&$filter=${encodeURIComponent(opts.filter)}` : ''}`;
    const raws = await this.client.getAll<RawItem>(`${await this.base(name)}/items?${q}`, {
      headers: { Prefer: 'HonorNonIndexedQueriesWarningMayFailRandomly' },
    });
    const def = this.def(name);
    return raws.map((r) => decodeItem<T>(def, r));
  }

  private guard(name: string, partial: Record<string, unknown>) {
    for (const [k, v] of Object.entries(partial)) {
      if (typeof v !== 'string' || GUARD_EXEMPT.has(`${name}.${k}`)) continue;
      const p = dealDataProblem(v);
      if (p) throw new DealDataError(p);
    }
  }

  async create<T>(name: string, partial: Record<string, unknown>): Promise<Decoded<T>> {
    this.guard(name, partial);
    const raw = await this.client.request<RawItem>('POST', `${await this.base(name)}/items`, { body: { fields: encodeFields(this.def(name), partial) } });
    return decodeItem<T>(this.def(name), raw);
  }

  /** Create many items with $batch (20 per request). Returns one result per input, in order. */
  async createMany(name: string, partials: Record<string, unknown>[]): Promise<{ id: number | null; status: number }[]> {
    const def = this.def(name);
    const base = await this.base(name);
    for (const p of partials) this.guard(name, p);
    const res = await this.client.batch(partials.map((p, i) => ({ id: String(i), method: 'POST', url: `${base}/items`, body: { fields: encodeFields(def, p) } })));
    return res.map((r) => ({ status: r.status, id: r.status < 300 ? Number((r.body as { id: string }).id) : null }));
  }

  async updateMany(name: string, updates: { id: number; fields: Record<string, unknown> }[]): Promise<number> {
    const def = this.def(name);
    const base = await this.base(name);
    for (const u of updates) this.guard(name, u.fields);
    const res = await this.client.batch(updates.map((u, i) => ({ id: String(i), method: 'PATCH', url: `${base}/items/${u.id}/fields`, body: encodeFields(def, u.fields) })));
    return res.filter((r) => r.status < 300).length;
  }

  /**
   * Update fields. With `ifMatch`, SharePoint refuses the write with HTTP 412 when someone else changed the item first, and nothing is written.
   * Returns the new ETag when the response carries one; otherwise call `getItem` to read it.
   */
  async update(name: string, id: number, partial: Record<string, unknown>, opts: { ifMatch?: string } = {}): Promise<{ etag?: string }> {
    this.guard(name, partial);
    const res = await this.client.request<Record<string, unknown> | undefined>('PATCH', `${await this.base(name)}/items/${id}/fields`, {
      body: encodeFields(this.def(name), partial),
      ...(opts.ifMatch ? { headers: { 'If-Match': opts.ifMatch } } : {}),
    });
    const etag = res?.['@odata.etag'] ?? res?.eTag;
    return { etag: typeof etag === 'string' ? etag : undefined };
  }

  /** Read one item with its fields and ETag. */
  async getItem<T>(name: string, id: number): Promise<Decoded<T>> {
    const raw = await this.client.request<RawItem>('GET', `${await this.base(name)}/items/${id}?$expand=fields`);
    return decodeItem<T>(this.def(name), raw);
  }

  /** Version history of one record (SharePoint list versioning). */
  async versions(name: string, id: number): Promise<{ id: string; modified?: string; by?: string; fields: Record<string, unknown> }[]> {
    const res = await this.client.request<{ value: { id: string; lastModifiedDateTime?: string; lastModifiedBy?: { user?: { displayName?: string } }; fields?: Record<string, unknown> }[] }>(
      'GET', `${await this.base(name)}/items/${id}/versions`,
    );
    return res.value.map((v) => ({ id: v.id, modified: v.lastModifiedDateTime, by: v.lastModifiedBy?.user?.displayName, fields: v.fields ?? {} }));
  }
}

/** Create an Outlook draft. Never sends. The app holds no send path. */
export async function createDraft(client: GraphClient, msg: { subject: string; bodyHtml: string; to: string[] }): Promise<{ id: string; webLink?: string }> {
  return client.request('POST', '/me/messages', {
    scopes: SCOPES.mail,
    body: { subject: msg.subject, body: { contentType: 'HTML', content: msg.bodyHtml }, toRecipients: msg.to.map((a) => ({ emailAddress: { address: a } })) },
  });
}
