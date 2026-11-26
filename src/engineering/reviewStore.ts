import type { BundleFS } from './fs';
import type { ReviewItem, ReviewStatus, Vec3 } from './types';
import { checkVersion, validateAgainst } from './validate';

export type WriteResult = { ok: true; item: ReviewItem } | { ok: false; reason: 'changed' | 'readonly' | 'missing' | 'invalid'; message: string };

export const CHANGED_MESSAGE = 'This item changed. Reload to see the update.';
export const HUMAN_ONLY: ReviewStatus[] = ['resolved', 'wont_fix'];

const path = (id: string) => `review/${id}.json`;
const stamp = () => new Date().toISOString();

async function read(fs: BundleFS, id: string): Promise<ReviewItem | null> {
  try {
    const raw = JSON.parse(await fs.readText(path(id))) as unknown;
    checkVersion('review', raw, path(id));
    return validateAgainst<ReviewItem>('review', raw, path(id));
  } catch { return null; }
}

/**
 * The rev rule (context section 9): re-read the file right before writing. If `rev` is not the one the user was looking
 * at, do not overwrite. Every write raises `rev` by one.
 */
export async function updateReview(fs: BundleFS, id: string, loadedRev: number, mutate: (latest: ReviewItem) => ReviewItem): Promise<WriteResult> {
  if (!fs.writable) return { ok: false, reason: 'readonly', message: 'This folder was opened read-only.' };
  const latest = await read(fs, id);
  if (!latest) return { ok: false, reason: 'missing', message: `${id} could not be read.` };
  if (latest.rev !== loadedRev) return { ok: false, reason: 'changed', message: CHANGED_MESSAGE };
  const next = { ...mutate(structuredClone(latest)), rev: latest.rev + 1, updated: stamp() };
  try { validateAgainst<ReviewItem>('review', next, path(id)); } catch (e) { return { ok: false, reason: 'invalid', message: (e as Error).message }; }
  const again = await read(fs, id); // second re-read, immediately before the write
  if (!again || again.rev !== loadedRev) return { ok: false, reason: 'changed', message: CHANGED_MESSAGE };
  await fs.writeText(path(id), JSON.stringify(next, null, 2) + '\n');
  return { ok: true, item: next };
}

export const setChecked = (fs: BundleFS, item: ReviewItem, checked: boolean) => updateReview(fs, item.id, item.rev, (r) => ({ ...r, checked }));

export const addReply = (fs: BundleFS, item: ReviewItem, text: string) =>
  updateReview(fs, item.id, item.rev, (r) => ({ ...r, thread: [...r.thread, { author: 'santiago', at: stamp(), text }] }));

/** Only santiago sets resolved or wont_fix; this tab acts as santiago. Reopening is also his. */
export const setStatus = (fs: BundleFS, item: ReviewItem, status: ReviewStatus) => updateReview(fs, item.id, item.rev, (r) => ({ ...r, status }));

export interface NewItem { title: string; text: string; anchor: ReviewItem['anchor'] }

export const nextId = (existing: string[]): string => {
  const n = existing.map((e) => /^R-(\d+)\.json$/.exec(e)?.[1]).filter(Boolean).map(Number);
  return `R-${String((n.length ? Math.max(...n) : 0) + 1).padStart(4, '0')}`;
};

export async function createReview(fs: BundleFS, draft: NewItem): Promise<WriteResult> {
  if (!fs.writable) return { ok: false, reason: 'readonly', message: 'This folder was opened read-only.' };
  const at = stamp();
  const id = nextId(await fs.list('review'));
  const item: ReviewItem = { schema: 'review/0.1', id, title: draft.title, status: 'open', checked: false, anchor: draft.anchor, thread: [{ author: 'santiago', at, text: draft.text }], rev: 1, updated: at };
  try { validateAgainst<ReviewItem>('review', item, path(id)); } catch (e) { return { ok: false, reason: 'invalid', message: (e as Error).message }; }
  if (await read(fs, id)) return { ok: false, reason: 'changed', message: CHANGED_MESSAGE };
  await fs.writeText(path(id), JSON.stringify(item, null, 2) + '\n');
  return { ok: true, item };
}

export const roundPoint = (p: Vec3): Vec3 => p.map((v) => Math.round(v * 100) / 100) as Vec3;
