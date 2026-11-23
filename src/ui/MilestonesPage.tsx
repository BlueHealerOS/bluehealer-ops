import { useState } from 'react';
import { useOps } from './ctx';
import { useAllTasksForProgress, useItems, useNow, useWrite } from './data';
import type { MilestoneFull } from '../domain/types';
import { progress, slipDays, withBaseline } from '../domain/milestones';
import { addDays, diffDays, etToday } from '../domain/time';
import * as C from '../schema/choices';
import { Empty, Loading, Select } from './parts';

const STATUS_COLOR: Record<string, string> = { 'not started': '#64748b', 'on track': '#15803d', 'at risk': '#b45309', late: '#b91c1c', done: '#1d4ed8' };

export function MilestonesPage() {
  const { founder } = useOps();
  const q = useItems<MilestoneFull>('Milestones');
  const { tasks } = useAllTasksForProgress();
  const today = etToday(useNow());
  const [editing, setEditing] = useState<MilestoneFull | 'new' | null>(null);
  const ms = [...(q.data ?? [])].sort((a, b) => (a.TargetDate ?? '9').localeCompare(b.TargetDate ?? '9'));
  const tracks = [...new Set(ms.map((m) => m.Track?.[0] ?? 'No track'))];

  return (
    <section aria-labelledby="ms-h" className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 id="ms-h" className="text-[1.75rem] md:text-display">Milestones</h1>
        <button className="btn btn-primary" onClick={() => setEditing('new')}>New milestone</button>
      </div>
      {q.isLoading && <Loading what="milestones" />}
      {!q.isLoading && ms.length === 0 && <Empty>No milestones yet. An administrator can seed the end-of-February drafts under Settings, in lists and imports.</Empty>}
      {ms.length > 0 && <Timeline ms={ms} today={today} />}
      {tracks.map((tr) => (
        <section key={tr} aria-label={tr}>
          <h2 className="mb-1 font-semibold">{tr}</h2>
          <ul className="space-y-2">
            {ms.filter((m) => (m.Track?.[0] ?? 'No track') === tr).map((m) => {
              const p = progress(m.id, tasks);
              const slip = slipDays(m);
              return (
                <li key={m.id} className="card flex flex-wrap items-center gap-3">
                  <button className="min-w-0 flex-1 text-left" onClick={() => setEditing(m)}>
                    <span className="block font-medium">{m.Title}</span>
                    <span className="mt-1 flex flex-wrap gap-1 text-xs">
                      <span className="chip" style={{ color: STATUS_COLOR[m.Status ?? 'not started'] }}>{m.Status ?? 'not started'}</span>
                      <span className="chip">{m.Owner ?? 'Unassigned'}</span>
                      {m.TargetDate && <span className="chip">Target {m.TargetDate}</span>}
                      {slip > 0 && <span className="chip bg-amber-100 text-amber-900">Moved {slip} day(s)</span>}
                      {m.ApprovalGate && m.ApprovalGate !== 'none' && <span className="chip">Approval: {m.ApprovalGate}{m.ApprovedDate ? ` (${m.ApprovedDate})` : ' pending'}</span>}
                    </span>
                  </button>
                  <div className="w-40" aria-label={`Task progress ${p.done} of ${p.total}`}>
                    <div className="h-2 rounded bg-canvas"><div className="h-2 rounded bg-primary" style={{ width: `${p.pct}%` }} /></div>
                    <div className="mt-1 text-xs text-ink-muted">{p.total ? `${p.done} of ${p.total} tasks done` : 'No linked tasks'}</div>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
      {editing && <MilestoneForm m={editing === 'new' ? undefined : editing} defaultOwner={founder} onClose={() => setEditing(null)} />}
    </section>
  );
}

function Timeline({ ms, today }: { ms: MilestoneFull[]; today: string }) {
  const dated = ms.filter((m) => m.TargetDate);
  if (!dated.length) return null;
  const start = addDays(today, -14);
  const end = addDays(dated.reduce((a, m) => (m.TargetDate! > a ? m.TargetDate! : a), today), 30);
  const span = Math.max(30, diffDays(end, start));
  const x = (d: string) => 160 + (Math.max(0, Math.min(span, diffDays(d, start))) / span) * 620;
  const months: string[] = [];
  for (let d = start.slice(0, 7) + '-01'; d <= end; d = new Date(Date.UTC(+d.slice(0, 4), +d.slice(5, 7), 1)).toISOString().slice(0, 10)) months.push(d);
  return (
    <div className="card overflow-x-auto">
      <svg role="img" aria-label={`Timeline of ${dated.length} milestones with baseline and target dates`} viewBox={`0 0 800 ${40 + dated.length * 28}`} className="min-w-[640px]">
        {months.map((d) => <g key={d}><line x1={x(d)} x2={x(d)} y1={20} y2={30 + dated.length * 28} stroke="#cbd5e1" /><text x={x(d) + 3} y={14} fontSize="10" fill="#475569">{d.slice(0, 7)}</text></g>)}
        <line x1={x(today)} x2={x(today)} y1={20} y2={30 + dated.length * 28} stroke="#1d4ed8" strokeDasharray="4 3" />
        {dated.map((m, i) => {
          const y = 40 + i * 28;
          const color = STATUS_COLOR[m.Status ?? 'not started'] ?? '#64748b';
          return (
            <g key={m.id}>
              <text x={4} y={y + 4} fontSize="11" fill="#0f172a">{m.Title.length > 24 ? m.Title.slice(0, 23) + '…' : m.Title}</text>
              {m.BaselineDate && m.BaselineDate !== m.TargetDate && <><line x1={x(m.BaselineDate)} x2={x(m.TargetDate!)} y1={y} y2={y} stroke={color} strokeDasharray="3 3" /><circle cx={x(m.BaselineDate)} cy={y} r={5} fill="#fff" stroke={color} strokeWidth="2" /></>}
              <rect x={x(m.TargetDate!) - 6} y={y - 6} width={12} height={12} transform={`rotate(45 ${x(m.TargetDate!)} ${y})`} fill={color} />
            </g>
          );
        })}
      </svg>
      <p className="mt-1 text-xs text-ink-muted">Filled diamond: target date. Hollow circle: baseline when the target has moved. Dashed blue line: today.</p>
    </div>
  );
}

function MilestoneForm({ m, defaultOwner, onClose }: { m?: MilestoneFull; defaultOwner: string; onClose: () => void }) {
  const w = useWrite();
  const [d, setD] = useState<Partial<MilestoneFull>>(m ?? { Status: 'not started', Owner: defaultOwner as MilestoneFull['Owner'], ApprovalGate: 'none' });
  const [err, setErr] = useState<string>();
  const set = <K extends keyof MilestoneFull>(k: K, v: MilestoneFull[K] | undefined) => setD((x) => ({ ...x, [k]: v }));
  async function save() {
    if (!d.Title?.trim()) { setErr('Please enter a title.'); return; }
    try {
      const fields: Record<string, unknown> = { Title: d.Title, Description: d.Description ?? null, Owner: d.Owner, Status: d.Status, TargetDate: d.TargetDate ?? null, ApprovalGate: d.ApprovalGate, ApprovedDate: d.ApprovedDate ?? null, EvidenceLinks: d.EvidenceLinks ?? null, Sensitivity: d.Sensitivity ?? 'normal' };
      Object.assign(fields, withBaseline(m, d.TargetDate));
      if (m) await w.update('Milestones', m.id, fields); else await w.create('Milestones', { Source: 'manual', ...Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== null)) });
      onClose();
    } catch (e) { setErr((e as Error).message); }
  }
  const lab = 'mb-1 block text-sm font-medium';
  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/40" role="presentation" onClick={onClose}>
      <aside role="dialog" aria-modal="true" aria-label="Milestone" className="h-full w-full max-w-lg overflow-y-auto bg-white p-4" onClick={(e) => e.stopPropagation()}>
        <h2 className="mb-3 text-lg font-semibold">{m ? 'Milestone' : 'New milestone'}</h2>
        <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); void save(); }}>
          <div><label className={lab} htmlFor="m-t">Title</label><input id="m-t" className="input" value={d.Title ?? ''} onChange={(e) => set('Title', e.target.value)} /></div>
          <div><label className={lab} htmlFor="m-d">Description</label><textarea id="m-d" className="input" rows={3} value={d.Description ?? ''} onChange={(e) => set('Description', e.target.value)} /></div>
          <div className="grid grid-cols-2 gap-3">
            <Select label="Owner" value={d.Owner} options={C.OWNERS} onChange={(v) => set('Owner', v as MilestoneFull['Owner'])} />
            <Select label="Status (owner's call)" value={d.Status} options={C.MILESTONE_STATUS} onChange={(v) => set('Status', v as MilestoneFull['Status'])} />
            <div><label className={lab} htmlFor="m-td">Target date</label><input id="m-td" type="date" className="input" value={d.TargetDate ?? ''} onChange={(e) => set('TargetDate', e.target.value)} /></div>
            <div><label className={lab}>Baseline date</label><p className="input bg-canvas">{m?.BaselineDate ?? d.TargetDate ?? 'Set on save'}</p></div>
            <Select label="Approval gate" value={d.ApprovalGate} options={C.APPROVAL_GATE} onChange={(v) => set('ApprovalGate', v)} />
            <div><label className={lab} htmlFor="m-ad">Approval date</label><input id="m-ad" type="date" className="input" value={d.ApprovedDate ?? ''} onChange={(e) => set('ApprovedDate', e.target.value)} /></div>
            <Select label="Sensitivity" value={d.Sensitivity ?? 'normal'} options={C.SENSITIVITY} onChange={(v) => set('Sensitivity', v as MilestoneFull['Sensitivity'])} />
          </div>
          <div><label className={lab} htmlFor="m-e">Evidence links (SharePoint or hub paths, one per line)</label><textarea id="m-e" className="input" rows={3} value={d.EvidenceLinks ?? ''} onChange={(e) => set('EvidenceLinks', e.target.value)} /></div>
          {err && <p role="alert" className="rounded-md bg-danger-soft p-2 text-sm text-danger">{err}</p>}
          <div className="flex gap-2"><button className="btn btn-primary" type="submit">Save</button><button className="btn" type="button" onClick={onClose}>Cancel</button></div>
        </form>
      </aside>
    </div>
  );
}
