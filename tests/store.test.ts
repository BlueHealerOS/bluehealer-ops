import { describe, expect, it } from 'vitest';
import { createDraft, DealDataError } from '../src/graph/store';
import type { Task } from '../src/domain/types';
import { makeEnv, provisioned } from './helpers';

describe('OpsStore', () => {
  it('reports denied for a non-founder (403) and ok for a founder', async () => {
    expect(await makeEnv({ forbidden: true }).store.probe()).toBe('denied');
    expect(await makeEnv().store.probe()).toBe('ok');
  });
  it('round-trips dates, lookups, multichoice, booleans and defaults', async () => {
    const { store } = await provisioned();
    const t = await store.create<Task>('Tasks', {
      Title: 'Draft plan', DueDate: '2026-12-01', MilestoneLookupId: 7, Track: ['Operations', 'Reimbursement'], ThisWeek: true, EstimateMinutes: 30, Priority: 'P1',
    });
    expect(t).toMatchObject({ Title: 'Draft plan', DueDate: '2026-12-01', MilestoneLookupId: 7, ThisWeek: true, EstimateMinutes: 30, Status: 'Inbox' });
    const [back] = await store.items<Task>('Tasks');
    expect(back?.Track).toEqual(['Operations', 'Reimbursement']);
    await store.update('Tasks', back!.id, { Status: 'Next', DueDate: null });
    const [after] = await store.items<Task>('Tasks');
    expect(after).toMatchObject({ Status: 'Next' });
    expect(after?.DueDate).toBeUndefined();
  });
  it('filters on one indexed column', async () => {
    const { store } = await provisioned();
    await store.create('Tasks', { Title: 'a', Status: 'Next' });
    await store.create('Tasks', { Title: 'b', Status: 'Done' });
    const open = await store.items<Task>('Tasks', { filter: "fields/Status ne 'Done' and fields/Status ne 'Dropped'" });
    expect(open.map((t) => t.Title)).toEqual(['a']);
  });
  it('rejects currency figures in free text (no deal data)', async () => {
    const { store } = await provisioned();
    await expect(store.create('Interactions', { Title: 'Call', Summary: 'They offered $250,000 at a cap' })).rejects.toBeInstanceOf(DealDataError);
    await expect(store.update('People', 1, { NextStep: 'Send USD 5000 wire' })).rejects.toBeInstanceOf(DealDataError);
    await expect(store.create('Interactions', { Title: 'Call', Summary: 'Discussed trial design.' })).resolves.toBeTruthy();
  });
  it('refuses unknown columns instead of writing them', async () => {
    const { store } = await provisioned();
    await expect(store.create('Tasks', { Title: 'x', InvestmentAmount: 5 })).rejects.toThrow(/Unknown column/);
  });
  it('reads version history for a record', async () => {
    const { store } = await provisioned();
    const t = await store.create<Task>('Tasks', { Title: 'v1' });
    await store.update('Tasks', t.id, { Title: 'v2' });
    const v = await store.versions('Tasks', t.id);
    expect(v).toHaveLength(2);
    expect(v[0]?.by).toBe('Founder');
  });
  it('explains a missing list', async () => {
    await expect(makeEnv().store.items('Tasks')).rejects.toThrow(/provisioning/);
  });
});

describe('Outlook drafts', () => {
  it('creates a draft through /me/messages and never calls a send endpoint', async () => {
    const { client, fake } = makeEnv();
    const d = await createDraft(client, { subject: 'Hello', bodyHtml: '<p>Hi</p>', to: ['person@example.com'] });
    expect(d.id).toBe('draft-1');
    expect(fake.state.drafts).toEqual([{ subject: 'Hello', to: ['person@example.com'] }]);
    expect(fake.state.requests.map((r) => r.path).some((p) => /send/i.test(p))).toBe(false);
  });
});
