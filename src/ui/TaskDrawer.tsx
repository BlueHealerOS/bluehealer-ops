import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useOps } from './ctx';
import { useLookup, useTaskActions, useTasks, type TaskItem } from './data';
import type { Task } from '../domain/types';
import * as C from '../schema/choices';
import { DealDataError } from '../graph/store';
import { Select } from './parts';

const REQUIRED: Record<string, { key: keyof Task; list: 'Milestones' | 'KeyResults' | 'Applications' | 'People'; label: string } | undefined> = {
  Milestone: { key: 'MilestoneLookupId', list: 'Milestones', label: 'Milestone' },
  'Key result': { key: 'KeyResultLookupId', list: 'KeyResults', label: 'Key result' },
  Application: { key: 'ApplicationLookupId', list: 'Applications', label: 'Application' },
  'Fundraising follow-up': { key: 'PersonLookupId', list: 'People', label: 'Person' },
  Relationship: { key: 'PersonLookupId', list: 'People', label: 'Person' },
};

export function TaskDrawer({ id, onClose }: { id: number | 'new'; onClose: () => void }) {
  const tasks = useTasks();
  const actions = useTaskActions();
  const existing = id === 'new' ? undefined : tasks.data?.find((t) => t.id === id);
  const [draft, setDraft] = useState<Partial<Task>>(() => (existing ? { ...existing } : { Title: '', Status: 'Inbox', Priority: 'P2' }));
  const [error, setError] = useState<string>();
  const [tab, setTab] = useState<'edit' | 'history'>('edit');
  const [outcome, setOutcome] = useState('');

  useEffect(() => { if (existing && !draft.id) setDraft({ ...existing }); }, [existing, draft.id]);
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);

  const req = draft.ContributionType ? REQUIRED[draft.ContributionType] : undefined;
  const lookup = useLookup(req?.list ?? 'Milestones');
  const set = <K extends keyof Task>(k: K, v: Task[K] | undefined) => setDraft((d) => ({ ...d, [k]: v }));

  async function save() {
    setError(undefined);
    if (!draft.Title?.trim()) { setError('Please enter a title.'); return; }
    try {
      const changed: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(draft)) {
        if (k === 'id' || k.startsWith('_')) continue;
        const before = (existing as Record<string, unknown> | undefined)?.[k];
        const norm = v === '' ? undefined : v; // clearing a field means null so SharePoint removes the value
        if (JSON.stringify(norm) === JSON.stringify(before)) continue;
        changed[k] = norm === undefined ? null : norm;
      }
      for (const k of Object.keys(existing ?? {})) if (!(k in draft) && !k.startsWith('_') && k !== 'id') changed[k] = null;
      const clean = changed;
      await actions.save.mutateAsync({ id: id === 'new' ? null : id, before: existing, fields: clean as Partial<Task> });
      onClose();
    } catch (e) {
      setError(e instanceof DealDataError || e instanceof Error ? e.message : 'Could not save.');
    }
  }
  async function complete() {
    if (!existing) return;
    await actions.complete.mutateAsync({ task: { ...existing, ...draft } as TaskItem, outcome: outcome || undefined });
    onClose();
  }

  const lab = 'block text-sm font-medium text-slate-800 mb-1';
  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/40" role="presentation" onClick={onClose}>
      <aside role="dialog" aria-modal="true" aria-label={id === 'new' ? 'New task' : 'Edit task'} className="h-full w-full max-w-xl overflow-y-auto bg-white p-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold">{id === 'new' ? 'New task' : 'Task'}</h2>
          <button className="btn" onClick={onClose} aria-label="Close">Close</button>
        </div>
        {existing && (
          <div role="tablist" className="mb-3 flex gap-2">
            {(['edit', 'history'] as const).map((t) => (
              <button key={t} role="tab" aria-selected={tab === t} className={`btn ${tab === t ? 'btn-primary' : ''}`} onClick={() => setTab(t)}>{t === 'edit' ? 'Details' : 'History'}</button>
            ))}
          </div>
        )}
        {tab === 'history' && existing ? <History id={existing.id} /> : (
          <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); void save(); }}>
            <div><label className={lab} htmlFor="t-title">Title</label><input id="t-title" className="input" value={draft.Title ?? ''} onChange={(e) => set('Title', e.target.value)} autoFocus /></div>
            <div><label className={lab} htmlFor="t-desc">Description</label><textarea id="t-desc" className="input" rows={3} value={draft.Description ?? ''} onChange={(e) => set('Description', e.target.value)} /></div>
            <div className="grid grid-cols-2 gap-3">
              <Select label="Status" value={draft.Status} options={C.TASK_STATUS} onChange={(v) => set('Status', v as Task['Status'])} />
              <Select label="Priority" value={draft.Priority} options={C.PRIORITY} onChange={(v) => set('Priority', v as Task['Priority'])} />
              <Select label="Owner" value={draft.Owner} options={C.OWNERS} onChange={(v) => set('Owner', v as Task['Owner'])} blank />
              <Select label="Contribution type" value={draft.ContributionType} options={C.CONTRIBUTION} onChange={(v) => set('ContributionType', v as Task['ContributionType'])} blank />
            </div>
            {req && (
              <div>
                <label className={lab} htmlFor="t-link">{req.label} link (required)</label>
                <select id="t-link" className="input" value={String(draft[req.key] ?? '')} onChange={(e) => set(req.key, (e.target.value ? Number(e.target.value) : undefined) as never)}>
                  <option value="">Choose…</option>
                  {(lookup.data ?? []).map((m) => <option key={m.id} value={m.id}>{m.Title}</option>)}
                </select>
                {lookup.data?.length === 0 && <p className="mt-1 text-xs text-slate-600">No {req.list} records exist yet. Add one first, or choose Operations.</p>}
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div><label className={lab} htmlFor="t-due">Due date</label><input id="t-due" type="date" className="input" value={draft.DueDate ?? ''} onChange={(e) => set('DueDate', e.target.value)} /></div>
              <div><label className={lab} htmlFor="t-start">Start date</label><input id="t-start" type="date" className="input" value={draft.StartDate ?? ''} onChange={(e) => set('StartDate', e.target.value)} /></div>
              <div><label className={lab} htmlFor="t-est">Estimate (minutes)</label><input id="t-est" type="number" min={0} className="input" value={draft.EstimateMinutes ?? ''} onChange={(e) => set('EstimateMinutes', e.target.value === '' ? undefined : Number(e.target.value))} /></div>
              <div><label className={lab} htmlFor="t-rec">Recurrence</label><input id="t-rec" className="input" placeholder="daily, weekly:MO,WE, monthly:15" value={draft.Recurrence ?? ''} onChange={(e) => set('Recurrence', e.target.value)} /></div>
            </div>
            {draft.Status === 'Waiting' && (
              <div className="grid grid-cols-2 gap-3">
                <div><label className={lab} htmlFor="t-wo">Waiting on</label><input id="t-wo" className="input" value={draft.WaitingOn ?? ''} onChange={(e) => set('WaitingOn', e.target.value)} /></div>
                <div><label className={lab} htmlFor="t-we">Expected by</label><input id="t-we" type="date" className="input" value={draft.WaitingExpected ?? ''} onChange={(e) => set('WaitingExpected', e.target.value)} /></div>
              </div>
            )}
            {draft.Status === 'Dropped' && (
              <div><label className={lab} htmlFor="t-dr">Reason for dropping</label><input id="t-dr" className="input" value={draft.DropReason ?? ''} onChange={(e) => set('DropReason', e.target.value)} /></div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <Select label="Context" value={draft.Context} options={C.CONTEXT} onChange={(v) => set('Context', v as Task['Context'])} blank />
              <Select label="Effort" value={draft.Effort} options={C.EFFORT} onChange={(v) => set('Effort', v as Task['Effort'])} blank />
              <Select label="Sensitivity" value={draft.Sensitivity ?? 'normal'} options={C.SENSITIVITY} onChange={(v) => set('Sensitivity', v as Task['Sensitivity'])} />
              <div><label className={lab} htmlFor="t-labels">Tags (separated by semicolons)</label><input id="t-labels" className="input" value={draft.Labels ?? ''} onChange={(e) => set('Labels', e.target.value)} /></div>
            </div>
            <fieldset>
              <legend className={lab}>Track</legend>
              <div className="flex flex-wrap gap-2">
                {C.TRACKS.map((t) => (
                  <label key={t} className="chip cursor-pointer gap-1"><input type="checkbox" checked={(draft.Track ?? []).includes(t)} onChange={(e) => set('Track', e.target.checked ? [...(draft.Track ?? []), t] : (draft.Track ?? []).filter((x) => x !== t))} />{t}</label>
                ))}
              </div>
            </fieldset>
            <div className="flex gap-4">
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!draft.ThisWeek} onChange={(e) => set('ThisWeek', e.target.checked)} /> This week</label>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!draft.Agenda} onChange={(e) => set('Agenda', e.target.checked)} /> Flag for agenda</label>
            </div>
            {error && <p role="alert" className="rounded-md bg-red-50 p-2 text-sm text-red-800">{error}</p>}
            <div className="flex flex-wrap items-center gap-2 pt-2">
              <button type="submit" className="btn btn-primary" disabled={actions.save.isPending}>Save</button>
              {existing && existing.Status !== 'Done' && (
                <>
                  <input aria-label="Outcome note (optional)" className="input max-w-56" placeholder="Outcome note (optional)" value={outcome} onChange={(e) => setOutcome(e.target.value)} />
                  <button type="button" className="btn" onClick={() => void complete()}>Mark done</button>
                </>
              )}
            </div>
          </form>
        )}
        <p className="mt-4 text-xs text-slate-600">{existing?._modified ? `Last modified ${existing._modified.slice(0, 16).replace('T', ' ')} UTC` : ''}</p>
      </aside>
    </div>
  );
}

function History({ id }: { id: number }) {
  const { store } = useOps();
  const q = useQuery({ queryKey: ['versions', id], queryFn: () => store.versions('Tasks', id) });
  if (q.isLoading) return <p>Loading history…</p>;
  if (q.error) return <p role="alert">History is not available for this record.</p>;
  const vs = q.data ?? [];
  return (
    <ol className="space-y-2" aria-label="Version history">
      {vs.map((v, i) => {
        const prev = vs[i + 1];
        const changed = Object.keys(v.fields).filter((k) => !k.startsWith('@') && JSON.stringify(v.fields[k]) !== JSON.stringify(prev?.fields[k]));
        return (
          <li key={v.id} className="card text-sm">
            <div className="font-medium">Version {v.id} · {v.modified?.slice(0, 16).replace('T', ' ')} UTC · {v.by ?? 'unknown'}</div>
            <div className="text-slate-700">{prev ? (changed.length ? `Changed: ${changed.join(', ')}` : 'No field changes') : 'Created'}</div>
          </li>
        );
      })}
    </ol>
  );
}
