export type TokenProvider = (scopes: string[]) => Promise<string>;

export const SCOPES = {
  core: ['User.Read', 'Sites.Selected'],
  mail: ['Mail.ReadWrite'],
  calendar: ['Calendars.Read'],
} as const;

export class GraphError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

export interface GraphClientOptions {
  getToken: TokenProvider;
  fetchFn?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  baseUrl?: string;
  maxConcurrent?: number;
  maxRetries?: number;
}
export interface BatchRequest { id: string; method: string; url: string; body?: unknown }
export interface BatchResponse { id: string; status: number; body: unknown }

const RETRYABLE = new Set([429, 503, 504]);

export class GraphClient {
  private fetchFn: typeof fetch;
  private sleep: (ms: number) => Promise<void>;
  private baseUrl: string;
  private maxRetries: number;
  private active = 0;
  private waiters: (() => void)[] = [];
  private maxConcurrent: number;

  constructor(private o: GraphClientOptions) {
    this.fetchFn = o.fetchFn ?? ((...a) => fetch(...a));
    this.sleep = o.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
    this.baseUrl = o.baseUrl ?? 'https://graph.microsoft.com/v1.0';
    this.maxRetries = o.maxRetries ?? 5;
    this.maxConcurrent = o.maxConcurrent ?? 4;
  }

  private async slot<T>(fn: () => Promise<T>): Promise<T> {
    if (this.active >= this.maxConcurrent) await new Promise<void>((r) => this.waiters.push(r));
    this.active++;
    try {
      return await fn();
    } finally {
      this.active--;
      this.waiters.shift()?.();
    }
  }

  async request<T = unknown>(method: string, pathOrUrl: string, opts: { body?: unknown; scopes?: readonly string[]; headers?: Record<string, string> } = {}): Promise<T> {
    const url = pathOrUrl.startsWith('http') ? pathOrUrl : this.baseUrl + pathOrUrl;
    return this.slot(async () => {
      for (let attempt = 0; ; attempt++) {
        const token = await this.o.getToken([...(opts.scopes ?? SCOPES.core)]);
        const res = await this.fetchFn(url, {
          method,
          headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', ...(opts.body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...opts.headers },
          ...(opts.body !== undefined ? { body: JSON.stringify(opts.body) } : {}),
        });
        if (res.ok) return (res.status === 204 ? undefined : await res.json()) as T;
        if (RETRYABLE.has(res.status) && attempt < this.maxRetries) {
          const ra = Number(res.headers.get('Retry-After'));
          const backoff = Number.isFinite(ra) && ra > 0 ? ra * 1000 : Math.min(30_000, 500 * 2 ** attempt);
          await this.sleep(backoff + Math.floor(Math.random() * 250));
          continue;
        }
        let code = String(res.status), message = res.statusText;
        try {
          const j = (await res.json()) as { error?: { code?: string; message?: string } };
          code = j.error?.code ?? code;
          message = j.error?.message ?? message;
        } catch { /* body not JSON */ }
        throw new GraphError(res.status, code, message);
      }
    });
  }

  /** Follow @odata.nextLink until exhausted. */
  async getAll<T>(path: string, opts: { headers?: Record<string, string> } = {}): Promise<T[]> {
    const out: T[] = [];
    let next: string | undefined = path;
    while (next) {
      const page: { value: T[]; '@odata.nextLink'?: string } = await this.request('GET', next, opts);
      out.push(...page.value);
      next = page['@odata.nextLink'];
    }
    return out;
  }

  /** $batch in chunks of 20. Throttled sub-requests are retried. */
  async batch(reqs: BatchRequest[]): Promise<BatchResponse[]> {
    const results = new Map<string, BatchResponse>();
    let pending = reqs;
    for (let round = 0; pending.length && round <= this.maxRetries; round++) {
      if (round > 0) await this.sleep(Math.min(30_000, 500 * 2 ** round));
      const retry: BatchRequest[] = [];
      for (let i = 0; i < pending.length; i += 20) {
        const chunk = pending.slice(i, i + 20);
        const res = await this.request<{ responses: BatchResponse[] }>('POST', '/$batch', {
          body: { requests: chunk.map((r) => ({ ...r, ...(r.body !== undefined ? { headers: { 'Content-Type': 'application/json' } } : {}) })) },
        });
        for (const r of res.responses) {
          if (RETRYABLE.has(r.status)) retry.push(chunk.find((c) => c.id === r.id)!);
          else results.set(r.id, r);
        }
      }
      pending = retry;
    }
    return reqs.map((r) => results.get(r.id) ?? { id: r.id, status: 429, body: null });
  }
}
