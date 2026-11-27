// Browser cache for first paint (docs/PLAN-v2.md section 5.2). Rules that tests enforce:
//  - Restricted records are never written to it. They may sit in memory for display and are re-read from Graph.
//  - It is cleared on sign-out, on an account change, at start-up when nobody is signed in, after 24 hours and on an app version change.
//  - Nothing is cached for offline editing; the write queue is memory only.
// The storage is behind an interface so unit tests use memory and Playwright covers the real IndexedDB.

export type CachedRecord = Record<string, unknown>;

export interface CacheSnapshot {
  /** Stable id of the signed-in account; a snapshot for another account is never returned. */
  account: string;
  /** ISO time of the save. */
  savedAt: string;
  /** App version (commit hash). A different build starts with an empty cache. */
  version: string;
  collections: Record<string, CachedRecord[]>;
}

export interface CacheStore {
  read(): Promise<CacheSnapshot | undefined>;
  write(snapshot: CacheSnapshot): Promise<void>;
  clear(): Promise<void>;
}

export const CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000;
export const CACHE_DB = 'ops-cache-v1';

const isRestricted = (r: CachedRecord) => r.Sensitivity === 'restricted';

/** Copy of the collections without restricted records. */
export function withoutRestricted(collections: Record<string, CachedRecord[]>): Record<string, CachedRecord[]> {
  return Object.fromEntries(Object.entries(collections).map(([name, rows]) => [name, rows.filter((r) => !isRestricted(r))]));
}

export async function saveCache(store: CacheStore, input: { account: string; version: string; now: Date; collections: Record<string, CachedRecord[]> }): Promise<void> {
  try {
    await store.write({ account: input.account, version: input.version, savedAt: input.now.toISOString(), collections: withoutRestricted(input.collections) });
  } catch {
    // Storage can be blocked or full. The app works without a cache.
  }
}

/** The saved snapshot, or undefined when it is missing, for another account or build, or older than 24 hours. */
export async function loadCache(store: CacheStore, input: { account: string; version: string; now: Date; maxAgeMs?: number }): Promise<CacheSnapshot | undefined> {
  try {
    const s = await store.read();
    if (!s) return undefined;
    const age = input.now.getTime() - new Date(s.savedAt).getTime();
    if (s.account !== input.account || s.version !== input.version || !(age >= 0) || age > (input.maxAgeMs ?? CACHE_MAX_AGE_MS)) {
      await store.clear();
      return undefined;
    }
    // Defence in depth: a snapshot written by an older build is filtered again on the way out.
    return { ...s, collections: withoutRestricted(s.collections) };
  } catch {
    return undefined;
  }
}

export async function clearCache(store: CacheStore): Promise<void> {
  try { await store.clear(); } catch { /* nothing to clear */ }
}

/** At start-up, with nobody signed in, anything left over is removed. */
export async function clearIfSignedOut(store: CacheStore, signedIn: boolean): Promise<void> {
  if (!signedIn) await clearCache(store);
}

/** Memory implementation for unit tests and for browsers without IndexedDB. */
export function memoryCacheStore(): CacheStore {
  let snap: CacheSnapshot | undefined;
  return {
    read: async () => (snap ? structuredClone(snap) : undefined),
    write: async (s) => { snap = structuredClone(s); },
    clear: async () => { snap = undefined; },
  };
}

/** IndexedDB implementation. One record holds the whole snapshot, so a save is atomic. Resolves harmlessly when IndexedDB is unavailable. */
export function indexedDbCacheStore(factory: IDBFactory | undefined = typeof indexedDB === 'undefined' ? undefined : indexedDB): CacheStore {
  const KEY = 'current';
  const open = () => new Promise<IDBDatabase | undefined>((resolve) => {
    if (!factory) return resolve(undefined);
    try {
      const req = factory.open(CACHE_DB, 1);
      req.onupgradeneeded = () => { req.result.createObjectStore('snapshots'); };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(undefined);
      req.onblocked = () => resolve(undefined);
    } catch { resolve(undefined); }
  });
  const run = <T,>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>) => new Promise<T | undefined>((resolve) => {
    void open().then((db) => {
      if (!db) return resolve(undefined);
      try {
        const tx = db.transaction('snapshots', mode);
        const req = fn(tx.objectStore('snapshots'));
        tx.oncomplete = () => { db.close(); resolve(req.result); };
        tx.onerror = tx.onabort = () => { db.close(); resolve(undefined); };
      } catch { db.close(); resolve(undefined); }
    });
  });
  return {
    read: async () => (await run<CacheSnapshot | undefined>('readonly', (s) => s.get(KEY))) ?? undefined,
    write: async (snap) => { await run('readwrite', (s) => s.put(snap, KEY)); },
    clear: () => new Promise<void>((resolve) => {
      if (!factory) return resolve();
      try {
        const req = factory.deleteDatabase(CACHE_DB);
        req.onsuccess = req.onerror = req.onblocked = () => resolve();
      } catch { resolve(); }
    }),
  };
}
