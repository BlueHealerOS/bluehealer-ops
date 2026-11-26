import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import type { Session } from './session';
import { ReviewQueue } from './ReviewQueue';
import { createReview } from './reviewStore';
import { modelFiles } from './load';
import type { Bundle } from './types';
import type { Placement } from './ModelViewer';

const ModelViewer = lazy(() => import('./ModelViewer'));

const hex = (b: ArrayBuffer) => Array.from(new Uint8Array(b), (x) => x.toString(16).padStart(2, '0')).join('');

function useModel(session: Session, bundle: Bundle) {
  const path = modelFiles(bundle)[0] ?? null;
  const expected = bundle.manifest.files.find((f) => f.path === path)?.sha256 ?? null;
  const [state, setState] = useState<{ bytes: ArrayBuffer | null; error: string | null; stale: boolean }>({ bytes: null, error: null, stale: false });
  useEffect(() => {
    if (!path || !session.fs) return;
    let live = true;
    session.fs.readBytes(path).then(async (bytes) => {
      const actual = hex(await crypto.subtle.digest('SHA-256', bytes));
      if (live) setState({ bytes, error: null, stale: expected !== null && actual !== expected });
    }).catch((e: Error) => { if (live) setState({ bytes: null, error: `The model ${path} could not be read: ${e.message}`, stale: false }); });
    return () => { live = false; };
  }, [path, expected, session.fs]);
  return { path, ...state };
}

export function ReviewPage({ session, bundle }: { session: Session; bundle: Bundle }) {
  const fs = session.fs!;
  const model = useModel(session, bundle);
  const [selected, setSelected] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ placement: Placement | null; title: string; text: string } | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const pins = useMemo(() => bundle.reviews
    .filter((r) => r.anchor.type === 'model' && r.anchor.point && r.status !== 'resolved' && r.status !== 'wont_fix')
    .map((r) => ({ id: r.id, title: r.title, point: r.anchor.point!, camera: r.anchor.camera ?? null, status: r.status })), [bundle.reviews]);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft || !model.path) return;
    const p = draft.placement;
    const r = await createReview(fs, {
      title: draft.title.trim(), text: draft.text.trim(),
      anchor: { type: 'model', file: model.path, part: p?.part ?? null, point: p?.point ?? null, camera: p?.camera ?? null, trace_id: null },
    });
    if (!r.ok) { setFormError(r.message); return; }
    setFormError(null); setDraft(null); setSelected(r.item.id); await session.reload();
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
      <section aria-labelledby="model-h" className="space-y-2" data-model-sha={model.bytes ? (bundle.manifest.files.find((f) => f.path === model.path)?.sha256 ?? '').slice(0, 12) : ''}>
        <h2 id="model-h" className="text-title">Model{model.path ? <span className="ml-2 text-sm font-normal text-ink-muted">{model.path}</span> : null}</h2>
        {model.stale && <p role="alert" className="rounded-control bg-danger-soft px-3 py-2 text-sm text-danger">This model does not match the hash in manifest.json. Regenerate the bundle.</p>}
        {model.error && <p role="alert" className="text-danger">{model.error}</p>}
        {!model.path && <p className="card text-sm">This bundle has no model file.</p>}
        {model.bytes && (
          <Suspense fallback={<p role="status" className="text-sm text-ink-muted">Loading the 3D view...</p>}>
            <ModelViewer glb={model.bytes} pins={pins} selectedId={selected}
              onPlace={(placement) => { setDraft({ placement, title: '', text: '' }); setFormError(null); }}
              onSelectPin={(id) => setSelected(id)} />
          </Suspense>
        )}
      </section>
      <div className="space-y-3">
        <ReviewQueue items={bundle.reviews} fs={fs} selectedId={selected} onSelect={(id) => setSelected(selected === id ? null : id)} reload={session.reload}>
          {draft ? (
            <form onSubmit={(e) => void save(e)} className="card space-y-2" aria-labelledby="new-h">
              <h3 id="new-h" className="text-sm font-semibold">New review item{draft.placement ? ` on ${draft.placement.part ?? 'the model'}` : ''}</h3>
              {draft.placement && <p className="text-xs text-ink-muted">Pin at {draft.placement.point.join(', ')} mm. The camera view is saved with it.</p>}
              <label className="block text-sm font-medium" htmlFor="new-title">Title</label>
              <input id="new-title" className="input" required value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} autoFocus />
              <label className="block text-sm font-medium" htmlFor="new-text">Comment</label>
              <textarea id="new-text" className="input" rows={3} required value={draft.text} onChange={(e) => setDraft({ ...draft, text: e.target.value })} />
              {formError && <p role="alert" className="text-sm text-danger">{formError}</p>}
              <div className="flex gap-2"><button className="btn btn-primary" type="submit" disabled={!fs.writable}>Save item</button><button type="button" className="btn" onClick={() => setDraft(null)}>Cancel</button></div>
            </form>
          ) : (
            <button className="btn w-full" disabled={!fs.writable || !model.path} onClick={() => setDraft({ placement: null, title: '', text: '' })}>Add item without a pin</button>
          )}
        </ReviewQueue>
      </div>
    </div>
  );
}
