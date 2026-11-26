import { lazy, Suspense, useRef } from 'react';
import { useEngineering } from './session';
import { ReviewPage } from './ReviewPage';
import { useHashRoute } from '../ui/router';
import { ENGINEERING_SECTIONS } from '../ui/nav';

const TraceGraph = lazy(() => import('./TraceGraph'));

export function EngineeringPage() {
  const s = useEngineering();
  const { segments } = useHashRoute();
  const section = segments[1] === 'graph' ? 'graph' : 'review';
  const fallback = useRef<HTMLInputElement>(null);

  const picker = (
    <div className="flex flex-wrap items-center gap-2">
      {s.canPick && <button className="btn btn-primary" onClick={() => void s.openFolder()}>{s.bundle ? 'Change folder' : 'Open bundle folder'}</button>}
      {s.bundle && <button className="btn" onClick={() => void s.reload()}>Reload</button>}
      <label className={`btn ${s.canPick ? '' : 'btn-primary'} cursor-pointer`}>
        {s.canPick ? 'Open read-only' : 'Open bundle folder (read-only)'}
        <input ref={fallback} type="file" className="sr-only" multiple {...{ webkitdirectory: '' }}
          onChange={(e) => { void s.openFiles(Array.from(e.target.files ?? [])); e.target.value = ''; }} />
      </label>
      {s.phase === 'ready' && s.canPick && <button className="btn btn-quiet" onClick={() => void s.forget()}>Forget folder</button>}
    </div>
  );

  return (
    <section aria-labelledby="eng-h" className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 id="eng-h" className="text-[1.75rem] md:text-display">{section === 'graph' ? 'Trace graph' : 'Review'}</h1>
          {s.bundle && <p className="text-sm text-ink-muted">{s.bundle.manifest.title} <span className="chip ml-1">{s.bundle.manifest.classification === 'private' ? 'Private' : 'Public fixture'}</span>{s.fs && !s.fs.writable && <span className="chip ml-1">Read-only</span>}</p>}
        </div>
        {picker}
      </div>
      <nav aria-label="Engineering sections" className="seg md:hidden">
        {ENGINEERING_SECTIONS.map(([k, label]) => <a key={k} href={`#/engineering/${k}`} aria-current={section === k ? 'page' : undefined}>{label}</a>)}
      </nav>
      {s.phase === 'loading' && <p role="status" className="text-sm text-ink-muted">Opening the folder...</p>}
      {s.phase === 'needs-permission' && (
        <div className="card space-y-2"><p className="text-sm">The browser needs your permission to open <strong>{s.folderName}</strong> again.</p>
          <button className="btn btn-primary" onClick={() => void s.reconnect()}>Allow access to {s.folderName}</button>
          {s.error && <p role="alert" className="text-sm text-danger">{s.error}</p>}</div>
      )}
      {s.phase === 'error' && <p role="alert" className="rounded-control bg-danger-soft px-3 py-2 text-sm text-danger">{s.error}</p>}
      {(s.phase === 'idle') && (
        <div className="card space-y-2 text-sm">
          <p>Open a bundle folder to inspect its model, review items and trace graph. Files stay on this device: the Engineering workspace sends nothing over the network.</p>
          {!s.canPick && <p>This browser cannot open a folder for writing, so the folder opens read-only. Use a Chromium browser to write review items.</p>}
        </div>
      )}
      {s.bundle && s.bundle.problems.length > 0 && (
        <details className="card text-sm" open><summary className="cursor-pointer font-semibold">{s.bundle.problems.length} file{s.bundle.problems.length === 1 ? '' : 's'} could not be used</summary>
          <ul className="mt-1 list-disc pl-5">{s.bundle.problems.map((p) => <li key={p}>{p}</li>)}</ul></details>
      )}
      {s.bundle && s.fs && (section === 'review'
        ? <ReviewPage session={s} bundle={s.bundle} />
        : <Suspense fallback={<p role="status" className="text-sm text-ink-muted">Loading the graph...</p>}><TraceGraph bundle={s.bundle} /></Suspense>)}
    </section>
  );
}
