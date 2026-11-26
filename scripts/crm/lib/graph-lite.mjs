// A small CrmRepo for scripts: list and create only, with the signed-in founder's own token, Microsoft Graph only.
// Plain JavaScript so Node can load it without a build step. The app itself uses src/crm/graph/graphRepo.ts.
import { decodeItem, encodeFields } from '../../../src/graph/codec.ts';
import { dealDataProblem } from '../../../src/domain/guards.ts';
import { crmListDef } from '../../../src/crm/schema.ts';

const BASE = 'https://graph.microsoft.com/v1.0';

export function createLiteRepo({ token, host, path }) {
  async function request(method, pathOrUrl, body) {
    const url = pathOrUrl.startsWith('http') ? pathOrUrl : BASE + pathOrUrl;
    if (!url.startsWith(BASE + '/')) throw new Error('Refusing a request outside Microsoft Graph.');
    for (let attempt = 0; ; attempt++) {
      const res = await fetch(url, { method, headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
      if (res.ok) return res.status === 204 ? undefined : res.json();
      if ((res.status === 429 || res.status === 503) && attempt < 5) { await new Promise((r) => setTimeout(r, (Number(res.headers.get('Retry-After')) || 2 ** attempt) * 1000)); continue; }
      let msg = res.statusText;
      try { msg = (await res.json()).error?.message ?? msg; } catch { /* not JSON */ }
      throw new Error(`${method} ${url.replace(BASE, '')} failed: ${res.status} ${msg}`);
    }
  }
  let base;
  const listBase = async (list) => {
    if (!base) {
      const site = await request('GET', `/sites/${host}:${path}?$select=id`);
      const lists = [];
      for (let next = `/sites/${site.id}/lists?$select=id,displayName&$top=100`; next;) { const page = await request('GET', next); lists.push(...page.value); next = page['@odata.nextLink']; }
      base = { site: site.id, ids: new Map(lists.map((l) => [l.displayName, l.id])) };
    }
    const id = base.ids.get(list);
    if (!id) throw new Error(`The list "${list}" does not exist. Provision the CRM lists first (docs/crm/provisioning-checklist.md).`);
    return `/sites/${base.site}/lists/${id}`;
  };
  const row = (list, raw) => {
    const d = decodeItem(crmListDef(list), raw);
    const fields = Object.fromEntries(Object.entries(d).filter(([k]) => k !== 'id' && !k.startsWith('_')));
    return { id: d.id, etag: d._etag, fields };
  };
  const unsupported = async () => { throw new Error('This script repository only lists and creates.'); };
  return {
    async listAll(list) {
      const out = [];
      for (let next = `${await listBase(list)}/items?$expand=fields&$top=200`; next;) { const page = await request('GET', next); out.push(...page.value.map((r) => row(list, r))); next = page['@odata.nextLink']; }
      return out;
    },
    async create(list, fields) {
      for (const v of Object.values(fields)) if (typeof v === 'string' && dealDataProblem(v)) throw new Error(dealDataProblem(v));
      const b = await listBase(list);
      const raw = await request('POST', `${b}/items`, { fields: encodeFields(crmListDef(list), fields) });
      return row(list, raw);
    },
    get: unsupported, update: unsupported, remove: unsupported, createTask: unsupported,
  };
}
