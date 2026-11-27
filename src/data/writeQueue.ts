// Optimistic writes (docs/PLAN-v2.md section 5.3). The caller updates the screen at once and enqueues the patch here; the queue
// writes it to SharePoint in the background. It never reverts the screen: a write that cannot be saved stays visible as "failed"
// and can be retried, and a write another founder got in front of becomes a conflict a person resolves.
//
//  - Edits to one card within `debounceMs` become one PATCH. One write is in flight per card.
//  - Every write sends If-Match with the card's ETag. HTTP 412 means someone else saved first: the card is re-read and my edit is
//    merged field by field; if a field changed on both sides, nothing is written for it until a founder chooses.
//  - Transient failures (network, 429, 503, 504 after the Graph client's own retries) are retried 1, 2, 4, 8, 16, 32 and 60 seconds.
//  - Only a card closed through closeTask() may be written as Done.
//  - The queue is memory only. Nothing is persisted for offline editing.
import { applyPatch, mergeWrite, type FieldConflict, type Fields } from './merge';
import { assertCloseAllowed, type FounderClose } from '../domain/closeTask';

export type ItemWriteState = 'pending' | 'saving' | 'retrying' | 'failed' | 'conflict';

export interface ItemStatus {
  state: ItemWriteState;
  /** Failed attempts since the last success. */
  attempts: number;
  /** Message of the last failure (state failed or retrying). */
  error?: string;
  /** Fields changed by both founders (state conflict). */
  conflicts?: FieldConflict[];
  /** The other founder's version of the card (state conflict), for the screen to show. */
  theirs?: Fields;
}

export interface QueueSnapshot {
  items: Readonly<Record<number, ItemStatus>>;
  /** Cards with a change not yet saved. */
  unsaved: number;
}

export interface KnownState {
  /** ETag of the card as last read or written. Without one, the card is re-read before the first write. */
  etag?: string;
  /** Fields of the card at that ETag: the base for merging. */
  fields: Fields;
}

export interface WriteDeps {
  update(id: number, patch: Fields, opts: { ifMatch?: string }): Promise<{ etag?: string }>;
  getItem(id: number): Promise<{ etag?: string; fields: Fields }>;
  /** Runs `fn` after `ms`; returns a function that cancels it. Injected so tests control time. */
  schedule?(fn: () => void, ms: number): () => void;
  /** Extra fields added to every outgoing patch, for example LastTouched. */
  stamp?(): Fields;
  debounceMs?: number;
}

export const BACKOFF_MS = [1000, 2000, 4000, 8000, 16000, 32000, 60000] as const;
export const MAX_ATTEMPTS = 8;

interface Entry {
  id: number;
  patch: Fields;
  known: KnownState;
  state: ItemWriteState;
  attempts: number;
  error?: string;
  conflicts?: FieldConflict[];
  theirs?: Fields;
  /** My values for the conflicting fields, kept until a founder chooses. */
  mine: Fields;
  noEtag: boolean;
  running: boolean;
  cancel?: () => void;
}

type Outcome = 'ok' | 'reconciled' | 'conflict' | 'stopped';

const defaultSchedule = (fn: () => void, ms: number) => {
  const h = setTimeout(fn, ms);
  return () => clearTimeout(h);
};

/** HTTP statuses that will not succeed by trying again. 408, 412 and 429 are handled separately. */
const permanent = (status: number | undefined) => status !== undefined && status >= 400 && status < 500 && ![408, 412, 429].includes(status);

export class WriteQueue {
  private entries = new Map<number, Entry>();
  private listeners = new Set<() => void>();
  private snapshot: QueueSnapshot = { items: {}, unsaved: 0 };
  private runs = new Set<Promise<void>>();
  private schedule: (fn: () => void, ms: number) => () => void;
  private debounceMs: number;

  constructor(private deps: WriteDeps) {
    this.schedule = deps.schedule ?? defaultSchedule;
    this.debounceMs = deps.debounceMs ?? 400;
  }

  /**
   * Queue an edit. `known` is the card as the screen last saw it from the server (ETag and fields before this edit).
   * A patch that sets Status to Done throws unless `close` came from closeTask().
   */
  enqueue(id: number, patch: Fields, opts: { known: KnownState; close?: FounderClose }): void {
    assertCloseAllowed(patch, opts.close);
    let e = this.entries.get(id);
    if (!e) {
      e = { id, patch: {}, known: opts.known, state: 'pending', attempts: 0, mine: {}, noEtag: false, running: false };
      this.entries.set(id, e);
    }
    e.patch = { ...e.patch, ...patch };
    // A card waiting to be written restarts its 400 ms window. A card that is saving, waiting to retry, failed or in conflict just collects the edit.
    if (e.state === 'pending') this.arm(e);
    this.notify();
  }

  getSnapshot = (): QueueSnapshot => this.snapshot;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };

  /** Number of cards with a change not yet saved, for the toolbar count and the unload warning. */
  unsaved(): number {
    return this.entries.size;
  }

  /** Try a failed card again now. */
  retry(id: number): void {
    const e = this.entries.get(id);
    if (!e || e.state !== 'failed') return;
    e.attempts = 0;
    e.error = undefined;
    e.state = 'pending';
    this.notify();
    this.start(e);
  }

  /** For the browser's `online` event: try every failed or waiting card now. */
  retryAll(): void {
    for (const e of [...this.entries.values()]) {
      if (e.state === 'failed') this.retry(e.id);
      else if (e.state === 'retrying' && !e.running) { e.cancel?.(); e.cancel = undefined; this.start(e); }
    }
  }

  /** Settle a conflict: keep the other founder's value for the contested fields, or keep mine. Uncontested fields are written either way. */
  resolveConflict(id: number, choice: 'theirs' | 'mine'): void {
    const e = this.entries.get(id);
    if (!e || e.state !== 'conflict') return;
    if (choice === 'mine') e.patch = { ...e.patch, ...e.mine };
    e.mine = {};
    e.conflicts = undefined;
    e.theirs = undefined;
    e.state = 'pending';
    this.notify();
    this.start(e);
  }

  /** Write everything now and wait. Used before sign-out and in tests. */
  async flush(): Promise<void> {
    for (const e of [...this.entries.values()]) {
      if (e.state === 'pending' || (e.state === 'retrying' && !e.running)) { e.cancel?.(); e.cancel = undefined; this.start(e); }
    }
    while (this.runs.size) await Promise.all([...this.runs]);
  }

  // ---- internals ----

  private arm(e: Entry) {
    e.cancel?.();
    e.state = 'pending';
    e.cancel = this.schedule(() => { e.cancel = undefined; this.start(e); }, this.debounceMs);
  }

  private start(e: Entry) {
    if (e.running) return;
    const p = this.run(e).finally(() => { this.runs.delete(p); });
    this.runs.add(p);
  }

  private async run(e: Entry): Promise<void> {
    e.running = true;
    e.cancel?.();
    e.cancel = undefined;
    try {
      for (let round = 0; ; round++) {
        const sent = this.take(e);
        if (!sent) { this.settle(e); return; }
        e.state = 'saving';
        this.notify();
        const out = await this.attempt(e, sent);
        if (out === 'ok') {
          if (Object.keys(e.patch).length === 0) { this.settle(e); return; }
          continue;
        }
        if (out === 'reconciled') {
          if (round >= 2) { this.fail(e, new Error('This card keeps changing. Please try again in a moment.'), undefined); return; }
          continue;
        }
        return; // conflict or stopped: the state is already set
      }
    } finally {
      e.running = false;
    }
  }

  /** The edit to send now, plus any stamp; the pending patch is emptied so edits made during the write form the next one. */
  private take(e: Entry): Fields | undefined {
    if (Object.keys(e.patch).length === 0) return undefined;
    const sent = { ...e.patch, ...(this.deps.stamp?.() ?? {}) };
    e.patch = {};
    return sent;
  }

  private async attempt(e: Entry, sent: Fields): Promise<Outcome> {
    try {
      if (e.known.etag === undefined && !e.noEtag) {
        e.patch = { ...sent, ...e.patch };
        return await this.reconcile(e);
      }
      const res = await this.deps.update(e.id, sent, e.known.etag ? { ifMatch: e.known.etag } : {});
      let etag = res.etag;
      if (etag === undefined) {
        try { etag = (await this.deps.getItem(e.id)).etag; } catch { /* the next write reads it first */ }
      }
      e.known = { etag, fields: applyPatch(e.known.fields, sent) };
      e.attempts = 0;
      e.error = undefined;
      return 'ok';
    } catch (err) {
      e.patch = { ...sent, ...e.patch }; // keep the edit; edits made meanwhile win
      if ((err as { status?: number }).status === 412) return this.reconcile(e);
      return this.fail(e, err, (err as { status?: number }).status);
    }
  }

  /** Another founder saved first: re-read the card and merge. */
  private async reconcile(e: Entry): Promise<Outcome> {
    try {
      const cur = await this.deps.getItem(e.id);
      const r = mergeWrite(e.known.fields, e.patch, cur.fields);
      e.known = { etag: cur.etag, fields: cur.fields };
      if (cur.etag === undefined) e.noEtag = true;
      if (r.conflicts.length) {
        e.mine = Object.fromEntries(r.conflicts.map((c) => [c.field, c.mine]));
        e.patch = r.apply;
        e.conflicts = r.conflicts;
        e.theirs = cur.fields;
        e.state = 'conflict';
        this.notify();
        return 'conflict';
      }
      e.patch = r.apply;
      return 'reconciled';
    } catch (err) {
      return this.fail(e, err, (err as { status?: number }).status);
    }
  }

  private fail(e: Entry, err: unknown, status: number | undefined): 'stopped' {
    e.error = err instanceof Error ? err.message : 'Could not save.';
    e.attempts += 1;
    if (permanent(status) || e.attempts >= MAX_ATTEMPTS) {
      e.state = 'failed';
    } else {
      e.state = 'retrying';
      e.cancel = this.schedule(() => { e.cancel = undefined; this.start(e); }, BACKOFF_MS[Math.min(e.attempts - 1, BACKOFF_MS.length - 1)]!);
    }
    this.notify();
    return 'stopped';
  }

  private settle(e: Entry) {
    this.entries.delete(e.id);
    this.notify();
  }

  private notify() {
    const items: Record<number, ItemStatus> = {};
    for (const e of this.entries.values()) {
      items[e.id] = { state: e.state, attempts: e.attempts, ...(e.error ? { error: e.error } : {}), ...(e.conflicts ? { conflicts: e.conflicts, theirs: e.theirs } : {}) };
    }
    this.snapshot = { items, unsaved: this.entries.size };
    for (const l of this.listeners) l();
  }
}
