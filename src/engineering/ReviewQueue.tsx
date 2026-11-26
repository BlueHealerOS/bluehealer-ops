import { useState } from 'react';
import type { BundleFS } from './fs';
import { addReply, setChecked, setStatus, type WriteResult } from './reviewStore';
import type { ReviewItem, ReviewStatus } from './types';

export const STATUS_LABEL: Record<ReviewStatus, string> = {
  open: 'Open', agent_replied: 'Claude replied', proposed_resolved: 'Proposed resolved', resolved: 'Resolved', wont_fix: "Won't fix",
};
const CHIP: Record<ReviewStatus, string> = {
  open: 'chip', agent_replied: 'chip chip-on', proposed_resolved: 'chip chip-on', resolved: 'chip', wont_fix: 'chip',
};
const done = (s: ReviewStatus) => s === 'resolved' || s === 'wont_fix';
const when = (iso: string) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? iso : d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }); };

export function ReviewQueue({ items, fs, selectedId, onSelect, reload, children }: {
  items: ReviewItem[]; fs: BundleFS; selectedId: string | null; onSelect: (id: string) => void; reload: () => Promise<void>; children?: React.ReactNode;
}) {
  const [showDone, setShowDone] = useState(false);
  const [error, setError] = useState<{ message: string; changed: boolean } | null>(null);
  const shown = items.filter((i) => showDone || !done(i.status));

  // Text of a reply lives here, outside the bundle, so a reload from polling never loses what was typed.
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  const run = async (op: Promise<WriteResult>) => {
    const r = await op;
    if (!r.ok) { setError({ message: r.message, changed: r.reason === 'changed' }); return false; }
    setError(null); await reload(); return true;
  };

  return (
    <section aria-labelledby="queue-h" className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 id="queue-h" className="text-title">Review queue</h2>
        <label className="flex items-center gap-1.5 text-sm"><input type="checkbox" checked={showDone} onChange={(e) => setShowDone(e.target.checked)} />Show resolved</label>
      </div>
      {children}
      {!fs.writable && <p className="card text-sm" role="note">This folder is open read-only. You can read items but not change them.</p>}
      {error && (
        <p role="alert" className="rounded-control bg-danger-soft px-3 py-2 text-sm text-danger">
          {error.message}{error.changed && <> <button className="underline" onClick={() => { setError(null); void reload(); }}>Reload</button></>}
        </p>
      )}
      <ul className="space-y-2">
        {shown.map((it) => {
          const open = it.id === selectedId;
          return (
            <li key={it.id} className={`card !p-3 ${open ? 'ring-2 ring-primary' : ''}`}>
              <div className="flex items-start gap-2">
                <input type="checkbox" className="mt-1 h-5 w-5" checked={it.checked} disabled={!fs.writable} aria-label={`Seen: ${it.id} ${it.title}`}
                  onChange={(e) => void run(setChecked(fs, it, e.target.checked))} />
                <button className="min-w-0 flex-1 text-left" aria-expanded={open} onClick={() => onSelect(it.id)}>
                  <span className="block text-xs text-ink-muted">{it.id}{it.anchor.part ? ` on ${it.anchor.part}` : it.anchor.trace_id ? ` on ${it.anchor.trace_id}` : ''}</span>
                  <span className="block text-sm font-semibold">{it.title}</span>
                </button>
                <span className={CHIP[it.status]}>{STATUS_LABEL[it.status]}</span>
              </div>
              {open && (
                <div className="mt-3 space-y-3 border-t border-hairline pt-3">
                  <ol className="space-y-2 text-sm" aria-label={`Thread for ${it.id}`}>
                    {it.thread.map((m, i) => (
                      <li key={i} className="rounded-control bg-canvas px-3 py-2">
                        <p className="text-xs text-ink-muted"><span className="font-semibold text-ink">{m.author === 'claude' ? 'Claude' : 'Santiago'}</span> · {when(m.at)}</p>
                        <p className="whitespace-pre-wrap">{m.text}</p>
                        {m.links && m.links.length > 0 && <p className="mt-1 text-xs text-ink-muted">Files: {m.links.join(', ')}</p>}
                      </li>
                    ))}
                  </ol>
                  <form onSubmit={(e) => { e.preventDefault(); const text = (drafts[it.id] ?? '').trim(); if (!text) return; void run(addReply(fs, it, text)).then((ok) => { if (ok) setDrafts((d) => ({ ...d, [it.id]: '' })); }); }}>
                    <label className="mb-1 block text-sm font-medium" htmlFor={`reply-${it.id}`}>Reply</label>
                    <textarea id={`reply-${it.id}`} className="input" rows={3} value={drafts[it.id] ?? ''} disabled={!fs.writable} onChange={(e) => setDrafts((d) => ({ ...d, [it.id]: e.target.value }))} />
                    <div className="mt-2 flex flex-wrap gap-2">
                      <button className="btn btn-primary" type="submit" disabled={!fs.writable || !(drafts[it.id] ?? '').trim()}>Send reply</button>
                      {!done(it.status) ? (
                        <>
                          <button type="button" className="btn" disabled={!fs.writable} onClick={() => void run(setStatus(fs, it, 'resolved'))}>Resolve</button>
                          <button type="button" className="btn" disabled={!fs.writable} onClick={() => void run(setStatus(fs, it, 'wont_fix'))}>Won&apos;t fix</button>
                        </>
                      ) : (
                        <button type="button" className="btn" disabled={!fs.writable} onClick={() => void run(setStatus(fs, it, 'open'))}>Reopen</button>
                      )}
                    </div>
                  </form>
                </div>
              )}
            </li>
          );
        })}
        {shown.length === 0 && <li className="text-sm text-ink-muted">{items.length === 0 ? 'No review items yet. Drop a pin on the model or add an item.' : 'Nothing active. Tick "Show resolved" to see closed items.'}</li>}
      </ul>
    </section>
  );
}
