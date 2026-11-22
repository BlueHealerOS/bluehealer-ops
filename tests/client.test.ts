import { describe, expect, it } from 'vitest';
import { GraphClient, GraphError } from '../src/graph/client';
import { createFakeGraph } from './support/fakeGraph';
import { provisioned } from './helpers';

describe('GraphClient', () => {
  it('retries throttled requests, honouring Retry-After', async () => {
    const fake = createFakeGraph({ throttleNext: 2 });
    const sleeps: number[] = [];
    const c = new GraphClient({ getToken: async () => 't', fetchFn: fake.fetchFn, sleep: async (ms) => { sleeps.push(ms); } });
    const r = await c.request<{ id: string }>('GET', '/sites/h.example:/sites/Ops');
    expect(r.id).toBe('site-1');
    expect(sleeps).toHaveLength(2);
  });
  it('gives up after the retry budget and throws a GraphError', async () => {
    const fake = createFakeGraph({ throttleNext: 99 });
    const c = new GraphClient({ getToken: async () => 't', fetchFn: fake.fetchFn, sleep: async () => {}, maxRetries: 2 });
    await expect(c.request('GET', '/sites/h.example:/sites/Ops')).rejects.toMatchObject({ status: 429 });
  });
  it('turns a 403 into a GraphError with the code', async () => {
    const fake = createFakeGraph({ forbidden: true });
    const c = new GraphClient({ getToken: async () => 't', fetchFn: fake.fetchFn });
    const e = await c.request('GET', '/sites/h.example:/sites/Ops').catch((x) => x);
    expect(e).toBeInstanceOf(GraphError);
    expect(e).toMatchObject({ status: 403, code: 'accessDenied' });
  });
  it('follows paging', async () => {
    const env = await provisioned({ pageSize: 2 });
    for (let i = 1; i <= 5; i++) env.fake.seed('Tasks', { Title: `T${i}`, Status: 'Next' });
    expect(await env.store.items('Tasks')).toHaveLength(5);
  });
  it('never runs more than 4 requests at once', async () => {
    let active = 0, peak = 0;
    const fetchFn: typeof fetch = async () => {
      active++; peak = Math.max(peak, active);
      await new Promise((r) => setTimeout(r, 5));
      active--;
      return new Response('{}', { status: 200 });
    };
    const c = new GraphClient({ getToken: async () => 't', fetchFn });
    await Promise.all(Array.from({ length: 12 }, () => c.request('GET', '/x')));
    expect(peak).toBeLessThanOrEqual(4);
  });
  it('batches in chunks of 20 and retries throttled sub-requests', async () => {
    const env = await provisioned();
    const lid = await env.store.listId('Tasks');
    const reqs = Array.from({ length: 45 }, (_, i) => ({ id: String(i), method: 'POST', url: `/sites/site-1/lists/${lid}/items`, body: { fields: { Title: `T${i}` } } }));
    const res = await env.client.batch(reqs);
    expect(res.every((r) => r.status === 201)).toBe(true);
    expect((await env.store.items('Tasks')).length).toBe(45);
  });
});
