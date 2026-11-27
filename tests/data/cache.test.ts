import { describe, expect, it } from 'vitest';
import { CACHE_MAX_AGE_MS, clearCache, clearIfSignedOut, loadCache, memoryCacheStore, saveCache, withoutRestricted, type CacheStore } from '../../src/data/cache';

const now = new Date('2026-12-01T12:00:00Z');
const collections = {
  tasks: [
    { id: 1, Title: 'Prepare summary', Sensitivity: 'normal' },
    { id: 2, Title: 'Placeholder restricted item', Sensitivity: 'restricted' },
    { id: 3, Title: 'No sensitivity field' },
  ],
  workstreams: [{ id: 9, Value: 'Hardware', Sensitivity: 'restricted' }, { id: 10, Value: 'Regulatory', Sensitivity: 'normal' }],
};
const input = { account: 'acct-1', version: 'abc1234', now };

describe('cache', () => {
  it('never stores a restricted record', async () => {
    const store = memoryCacheStore();
    await saveCache(store, { ...input, collections });
    const raw = await store.read();
    expect(JSON.stringify(raw)).not.toContain('restricted item');
    expect(raw?.collections.tasks?.map((r) => r.id)).toEqual([1, 3]);
    expect(raw?.collections.workstreams?.map((r) => r.id)).toEqual([10]);
  });

  it('filters restricted records again on the way out, even from an older snapshot', async () => {
    const store = memoryCacheStore();
    await store.write({ account: 'acct-1', version: 'abc1234', savedAt: now.toISOString(), collections });
    const s = await loadCache(store, input);
    expect(s?.collections.tasks?.map((r) => r.id)).toEqual([1, 3]);
  });

  it('returns a fresh snapshot for the same account and build', async () => {
    const store = memoryCacheStore();
    await saveCache(store, { ...input, collections });
    const s = await loadCache(store, { ...input, now: new Date(now.getTime() + 60_000) });
    expect(s?.collections.tasks).toHaveLength(2);
  });

  it('drops and clears a snapshot for another account', async () => {
    const store = memoryCacheStore();
    await saveCache(store, { ...input, collections });
    expect(await loadCache(store, { ...input, account: 'acct-2' })).toBeUndefined();
    expect(await store.read()).toBeUndefined();
  });

  it('drops and clears a snapshot from another app version', async () => {
    const store = memoryCacheStore();
    await saveCache(store, { ...input, collections });
    expect(await loadCache(store, { ...input, version: 'def5678' })).toBeUndefined();
    expect(await store.read()).toBeUndefined();
  });

  it('expires after 24 hours', async () => {
    const store = memoryCacheStore();
    await saveCache(store, { ...input, collections });
    expect(await loadCache(store, { ...input, now: new Date(now.getTime() + CACHE_MAX_AGE_MS - 1000) })).toBeDefined();
    expect(await loadCache(store, { ...input, now: new Date(now.getTime() + CACHE_MAX_AGE_MS + 1000) })).toBeUndefined();
    expect(await store.read()).toBeUndefined();
  });

  it('is cleared on sign-out and at start-up when nobody is signed in', async () => {
    const store = memoryCacheStore();
    await saveCache(store, { ...input, collections });
    await clearIfSignedOut(store, true);
    expect(await store.read()).toBeDefined();
    await clearIfSignedOut(store, false);
    expect(await store.read()).toBeUndefined();
    await saveCache(store, { ...input, collections });
    await clearCache(store);
    expect(await store.read()).toBeUndefined();
  });

  it('works without storage: failures are swallowed', async () => {
    const broken: CacheStore = { read: async () => { throw new Error('blocked'); }, write: async () => { throw new Error('full'); }, clear: async () => { throw new Error('blocked'); } };
    await expect(saveCache(broken, { ...input, collections })).resolves.toBeUndefined();
    await expect(loadCache(broken, input)).resolves.toBeUndefined();
    await expect(clearCache(broken)).resolves.toBeUndefined();
  });

  it('withoutRestricted does not change its input', () => {
    withoutRestricted(collections);
    expect(collections.tasks).toHaveLength(3);
  });
});
