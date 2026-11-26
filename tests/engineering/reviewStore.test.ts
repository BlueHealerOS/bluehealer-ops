import { describe, expect, it } from 'vitest';
import { loadBundle } from '../../src/engineering/load';
import { CHANGED_MESSAGE, addReply, createReview, nextId, setChecked, setStatus } from '../../src/engineering/reviewStore';
import { fixtureFS, memoryFS } from './helpers';

describe('review writes follow the rev rule', () => {
  it('raises rev by one on every write', async () => {
    const fs = fixtureFS(); const item = (await loadBundle(fs)).reviews[0]!;
    const r1 = await setChecked(fs, item, true);
    expect(r1.ok && r1.item.rev).toBe(item.rev + 1);
    const r2 = await addReply(fs, r1.ok ? r1.item : item, 'Thanks.');
    expect(r2.ok && r2.item.rev).toBe(item.rev + 2);
    const saved = JSON.parse(await fs.readText('review/R-0001.json'));
    expect(saved.checked).toBe(true);
    expect(saved.thread.at(-1)).toMatchObject({ author: 'santiago', text: 'Thanks.' });
  });
  it('does not overwrite when the other side wrote first', async () => {
    const fs = fixtureFS(); const item = (await loadBundle(fs)).reviews[0]!;
    const claude = { ...item, rev: item.rev + 1, status: 'agent_replied', thread: [...item.thread, { author: 'claude', at: item.updated, text: 'Done.' }] };
    await fs.writeText('review/R-0001.json', JSON.stringify(claude));
    const res = await setChecked(fs, item, true);
    expect(res).toEqual({ ok: false, reason: 'changed', message: CHANGED_MESSAGE });
    expect(JSON.parse(await fs.readText('review/R-0001.json')).thread.at(-1).author).toBe('claude');
  });
  it('detects a change between the first re-read and the write', async () => {
    const fs = fixtureFS(); const item = (await loadBundle(fs)).reviews[0]!;
    const original = fs.readText.bind(fs); let reads = 0;
    fs.readText = async (p: string) => {
      if (p === 'review/R-0001.json' && ++reads === 2) await fs.writeText(p, JSON.stringify({ ...item, rev: item.rev + 1 }));
      return original(p);
    };
    expect((await setChecked(fs, item, true)).ok).toBe(false);
  });
  it('lets santiago set resolved and wont_fix', async () => {
    const fs = fixtureFS(); const item = (await loadBundle(fs)).reviews[0]!;
    const r = await setStatus(fs, item, 'resolved');
    expect(r.ok && r.item.status).toBe('resolved');
  });
  it('refuses to write to a read-only folder', async () => {
    const fs = memoryFS(fixtureFS().files, false); const item = (await loadBundle(fs)).reviews[0]!;
    expect(await setChecked(fs, item, true)).toMatchObject({ ok: false, reason: 'readonly' });
  });
  it('creates the next numbered item with a valid file', async () => {
    const fs = fixtureFS();
    const r = await createReview(fs, { title: 'New point', text: 'Look here.', anchor: { type: 'model', file: 'models/bracket.glb', part: 'bracket-arm', point: [1, 2, 3], camera: { position: [1, 2, 3], target: [0, 0, 0], fov: 45 }, trace_id: null } });
    expect(r.ok && r.item.id).toBe('R-0003');
    expect((await loadBundle(fs)).reviews).toHaveLength(3);
  });
  it('numbers items after the highest existing id', () => {
    expect(nextId(['R-0001.json', 'R-0007.json', 'notes.txt'])).toBe('R-0008');
    expect(nextId([])).toBe('R-0001');
  });
});
