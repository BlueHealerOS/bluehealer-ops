// In-memory stand-in for the parts of Microsoft Graph the app uses. Shared by unit tests and Playwright.
// Fixtures are fictional. Nothing here resembles real data.
interface FCol { id: string; name: string; [k: string]: unknown }
interface FItem { id: number; created: string; modified: string; fields: Record<string, unknown>; etagSeq?: number; versions: { id: string; modified: string; fields: Record<string, unknown> }[] }
interface FList { id: string; displayName: string; columns: FCol[]; items: FItem[]; nextId: number }
export interface FakeState {
  forbidden: boolean;
  throttleNext: number;
  pageSize: number;
  lists: FList[];
  drafts: { subject: string; to: string[] }[];
  events: { id: string; subject: string; start: { dateTime: string } }[];
  requests: { method: string; path: string }[];
  now: () => string;
}
export interface Handled { status: number; body: unknown; headers?: Record<string, string> }

export function createFakeGraph(init: Partial<FakeState> = {}) {
  const state: FakeState = { forbidden: false, throttleNext: 0, pageSize: 200, lists: [], drafts: [], events: [], requests: [], now: () => new Date().toISOString(), ...init };
  let seq = 0;
  const err = (status: number, code: string): Handled => ({ status, body: { error: { code, message: code } } });

  function listById(id: string) { return state.lists.find((l) => l.id === id); }

  function matches(fields: Record<string, unknown>, filter: string | null): boolean {
    if (!filter) return true;
    return filter.split(/ and /i).every((clause) => {
      const m = clause.trim().match(/^fields\/(\w+)\s+(eq|ne|ge|le|gt|lt)\s+(?:'([^']*)'|(\S+))$/);
      if (!m) throw new Error(`fake graph: unsupported filter ${clause}`);
      const [, f, op, s, raw] = m;
      const want = s ?? raw!;
      const have = fields[f!] === undefined ? '' : String(fields[f!]);
      switch (op) {
        case 'eq': return have === want;
        case 'ne': return have !== want;
        case 'ge': return have !== '' && have >= want;
        case 'le': return have !== '' && have <= want;
        case 'gt': return have !== '' && have > want;
        default: return have !== '' && have < want;
      }
    });
  }

  const etagOf = (i: FItem) => `"${i.id},${i.etagSeq ?? 1}"`;
  const view = (i: FItem) => ({ id: String(i.id), eTag: etagOf(i), createdDateTime: i.created, lastModifiedDateTime: i.modified, fields: { ...i.fields, Title: i.fields.Title ?? '' } });

  function handle(method: string, fullUrl: string, body?: unknown, headers: Record<string, string> = {}): Handled {
    const u = new URL(fullUrl);
    const path = u.pathname.replace(/^\/v1\.0/, '');
    state.requests.push({ method, path });
    if (state.throttleNext > 0) { state.throttleNext--; return { status: 429, body: { error: { code: 'tooManyRequests' } }, headers: { 'Retry-After': '0' } }; }
    let m: RegExpMatchArray | null;

    if (method === 'POST' && path === '/$batch') {
      const reqs = (body as { requests: { id: string; method: string; url: string; body?: unknown }[] }).requests;
      return { status: 200, body: { responses: reqs.map((r) => { const h = handle(r.method, `https://graph.microsoft.com/v1.0${r.url}`, r.body); return { id: r.id, status: h.status, body: h.body }; }) } };
    }
    if (method === 'GET' && path === '/me/calendarView') return { status: 200, body: { value: state.events } };
    if (method === 'POST' && path === '/me/messages') {
      const b = body as { subject: string; toRecipients: { emailAddress: { address: string } }[] };
      state.drafts.push({ subject: b.subject, to: b.toRecipients.map((r) => r.emailAddress.address) });
      return { status: 201, body: { id: `draft-${state.drafts.length}`, webLink: 'https://outlook.example/draft' } };
    }
    if ((m = path.match(/^\/sites\/[^/]+:\/sites\/\w+$/)) && method === 'GET') {
      return state.forbidden ? err(403, 'accessDenied') : { status: 200, body: { id: 'site-1' } };
    }
    if (state.forbidden) return err(403, 'accessDenied');
    if (path === '/sites/site-1/lists' && method === 'GET') return { status: 200, body: { value: state.lists.map((l) => ({ id: l.id, displayName: l.displayName })) } };
    if (path === '/sites/site-1/lists' && method === 'POST') {
      const b = body as { displayName: string; columns: Record<string, unknown>[] };
      if (state.lists.some((l) => l.displayName === b.displayName)) return err(409, 'nameAlreadyExists');
      const list: FList = { id: `list-${++seq}`, displayName: b.displayName, columns: [{ id: `c-${++seq}`, name: 'Title' }], items: [], nextId: 1 };
      for (const c of b.columns ?? []) list.columns.push({ ...c, id: `c-${++seq}` } as FCol);
      state.lists.push(list);
      return { status: 201, body: { id: list.id, displayName: list.displayName } };
    }
    if ((m = path.match(/^\/sites\/site-1\/lists\/([^/]+)\/columns$/))) {
      const l = listById(m[1]!); if (!l) return err(404, 'itemNotFound');
      if (method === 'GET') return { status: 200, body: { value: l.columns } };
      if (method === 'POST') { const c = { ...(body as object), id: `c-${++seq}` } as FCol; l.columns.push(c); return { status: 201, body: c }; }
    }
    if ((m = path.match(/^\/sites\/site-1\/lists\/([^/]+)\/columns\/([^/]+)$/)) && method === 'PATCH') {
      const l = listById(m[1]!); const c = l?.columns.find((x) => x.id === m![2]); if (!l || !c) return err(404, 'itemNotFound');
      Object.assign(c, body); return { status: 200, body: c };
    }
    if ((m = path.match(/^\/sites\/site-1\/lists\/([^/]+)\/items$/))) {
      const l = listById(m[1]!); if (!l) return err(404, 'itemNotFound');
      if (method === 'GET') {
        const filter = u.searchParams.get('$filter');
        const all = l.items.filter((i) => matches(i.fields, filter));
        const top = Math.min(Number(u.searchParams.get('$top') ?? state.pageSize), state.pageSize);
        const skip = Number(u.searchParams.get('$skiptoken') ?? 0);
        const page = all.slice(skip, skip + top);
        const next = skip + top < all.length ? { '@odata.nextLink': `https://graph.microsoft.com/v1.0${path}?${(() => { const q = new URLSearchParams(u.searchParams); q.set('$skiptoken', String(skip + top)); return q.toString(); })()}` } : {};
        return { status: 200, body: { value: page.map(view), ...next } };
      }
      if (method === 'POST') {
        const f = { ...((body as { fields: Record<string, unknown> }).fields) };
        for (const c of l.columns) {
          const def = (c.defaultValue as { value?: string } | undefined)?.value;
          if (def && f[c.name] === undefined) f[c.name] = def;
        }
        const now = state.now();
        const item: FItem = { id: l.nextId++, created: now, modified: now, fields: f, versions: [{ id: '1.0', modified: now, fields: { ...f } }] };
        l.items.push(item);
        return { status: 201, body: view(item) };
      }
    }
    if ((m = path.match(/^\/sites\/site-1\/lists\/([^/]+)\/items\/(\d+)\/fields$/)) && method === 'PATCH') {
      const l = listById(m[1]!); const item = l?.items.find((i) => i.id === Number(m![2])); if (!l || !item) return err(404, 'itemNotFound');
      const ifMatch = headers['If-Match'] ?? headers['if-match'];
      if (ifMatch && ifMatch !== etagOf(item)) return err(412, 'preconditionFailed');
      for (const [k, v] of Object.entries(body as Record<string, unknown>)) { if (v === null) delete item.fields[k]; else item.fields[k] = v; }
      item.etagSeq = (item.etagSeq ?? 1) + 1;
      item.modified = state.now();
      item.versions.push({ id: `${item.versions.length + 1}.0`, modified: item.modified, fields: { ...item.fields } });
      return { status: 200, body: item.fields };
    }
    if ((m = path.match(/^\/sites\/site-1\/lists\/([^/]+)\/items\/(\d+)$/))) {
      const l = listById(m[1]!); const idx = l?.items.findIndex((i) => i.id === Number(m![2])) ?? -1;
      if (!l || idx < 0) return err(404, 'itemNotFound');
      if (method === 'GET') return { status: 200, body: view(l.items[idx]!) };
      if (method === 'DELETE') { l.items.splice(idx, 1); return { status: 204, body: null }; }
    }
    if ((m = path.match(/^\/sites\/site-1\/lists\/([^/]+)\/items\/(\d+)\/versions$/)) && method === 'GET') {
      const item = listById(m[1]!)?.items.find((i) => i.id === Number(m![2])); if (!item) return err(404, 'itemNotFound');
      return { status: 200, body: { value: [...item.versions].reverse().map((v) => ({ id: v.id, lastModifiedDateTime: v.modified, lastModifiedBy: { user: { displayName: 'Founder' } }, fields: v.fields })) } };
    }
    return err(404, 'notFound');
  }

  const fetchFn: typeof fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    const h = handle(init?.method ?? 'GET', url, init?.body ? JSON.parse(String(init.body)) : undefined, (init?.headers ?? {}) as Record<string, string>);
    return new Response(h.status === 204 ? null : JSON.stringify(h.body), { status: h.status, headers: { 'Content-Type': 'application/json', ...h.headers } });
  };

  /** Seed an item directly (bypasses the app). */
  function seed(listName: string, fields: Record<string, unknown>): number {
    const l = state.lists.find((x) => x.displayName === listName);
    if (!l) throw new Error(`seed: list ${listName} missing`);
    const now = state.now();
    const item: FItem = { id: l.nextId++, created: now, modified: now, fields, versions: [{ id: '1.0', modified: now, fields: { ...fields } }] };
    l.items.push(item);
    return item.id;
  }
  /** Make the next If-Match for this item fail, as if another founder had saved it. */
  function touch(listName: string, id: number) {
    const item = state.lists.find((x) => x.displayName === listName)?.items.find((i) => i.id === id);
    if (!item) throw new Error('touch: item missing');
    item.etagSeq = (item.etagSeq ?? 1) + 1;
  }
  return { state, handle, fetchFn, seed, touch };
}
export type FakeGraph = ReturnType<typeof createFakeGraph>;
