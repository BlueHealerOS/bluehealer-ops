// Test helpers for the write queue: a clock the test advances by hand, and a tiny stand-in for one SharePoint list.
import type { Fields } from '../../src/data/merge';
import type { WriteDeps } from '../../src/data/writeQueue';

export const tick = () => new Promise<void>((r) => setTimeout(r, 0));

export function manualClock() {
  let now = 0;
  let seq = 0;
  const tasks: { id: number; at: number; fn: () => void; cancelled: boolean }[] = [];
  const schedule = (fn: () => void, ms: number) => {
    const t = { id: seq++, at: now + ms, fn, cancelled: false };
    tasks.push(t);
    return () => { t.cancelled = true; };
  };
  /** Run everything due within `ms`, letting promises settle between timers. */
  async function advance(ms: number) {
    const end = now + ms;
    for (;;) {
      const next = tasks.filter((t) => !t.cancelled).sort((a, b) => a.at - b.at || a.id - b.id)[0];
      if (!next || next.at > end) break;
      now = next.at;
      next.cancelled = true;
      next.fn();
      await tick();
    }
    now = end;
    await tick();
  }
  return { schedule, advance, pending: () => tasks.filter((t) => !t.cancelled).map((t) => t.at - now) };
}

export interface FakeServer {
  fields: Fields;
  etagSeq: number;
  writes: { patch: Fields; ifMatch?: string }[];
  reads: number;
  /** Change the card as another founder would. */
  external(patch: Fields): void;
  deps(extra?: Partial<WriteDeps> & { returnEtag?: boolean }): WriteDeps;
  failNext: unknown[];
}

export function fakeServer(initial: Fields = {}): FakeServer {
  const s: FakeServer = {
    fields: { ...initial }, etagSeq: 1, writes: [], reads: 0, failNext: [],
    external(patch) { Object.assign(s.fields, patch); s.etagSeq++; },
    deps(extra = {}) {
      const { returnEtag = true, ...rest } = extra;
      return {
        update: async (_id, patch, opts) => {
          const failure = s.failNext.shift();
          if (failure) throw failure;
          s.writes.push({ patch, ifMatch: opts.ifMatch });
          if (opts.ifMatch && opts.ifMatch !== `"${s.etagSeq}"`) throw Object.assign(new Error('precondition failed'), { status: 412 });
          for (const [k, v] of Object.entries(patch)) { if (v === null) delete s.fields[k]; else s.fields[k] = v; }
          s.etagSeq++;
          return returnEtag ? { etag: `"${s.etagSeq}"` } : {};
        },
        getItem: async () => { s.reads++; return { etag: `"${s.etagSeq}"`, fields: { ...s.fields } }; },
        ...rest,
      };
    },
  };
  return s;
}
