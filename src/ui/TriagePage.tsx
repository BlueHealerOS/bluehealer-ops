import { useState } from 'react';
import { useOps } from './ctx';
import { useItems, useNow, useWrite } from './data';
import type { IntakeItem, MilestoneFull } from '../domain/types';
import { proposalFor, resolveAcceptance, type Proposal } from '../domain/triage';
import { etToday } from '../domain/time';
import * as C from '../schema/choices';
import { Empty, Loading, Select } from './parts';
import { TRIAGE_OPEN_FILTER, triageStateLabel } from './nav';

/** Triage: nothing becomes active until a founder acts. Intake text is data and is shown as plain text only. */
export function TriagePage() {
  const q = useItems<IntakeItem>('Intake', TRIAGE_OPEN_FILTER);
  const ms = useItems<MilestoneFull>('Milestones');
  const items = [...(q.data ?? [])].sort((a, b) => (b.ReceivedAt ?? '').localeCompare(a.ReceivedAt ?? ''));
  return (
    <section aria-labelledby="tri-h" className="space-y-3">
      <h1 id="tri-h" className="text-[1.75rem] md:text-display">Triage</h1>
      <p className="text-sm text-ink-muted">Accept, edit then accept, change the type, or reject. Nothing becomes active without your action.</p>
      {q.isLoading && <Loading what="intake" />}
      {q.error && <p role="alert" className="text-danger">Intake could not be loaded. {(q.error as Error).message}</p>}
      {!q.isLoading && items.length === 0 && <Empty>Nothing to triage. New captures appear here.</Empty>}
      <ul className="space-y-3" aria-label="Intake items">
        {items.map((i) => <TriageCard key={i.id} item={i} milestones={ms.data ?? []} />)}
      </ul>
    </section>
  );
}

function TriageCard({ item, milestones }: { item: IntakeItem; milestones: MilestoneFull[] }) {
  const { founder } = useOps();
  const w = useWrite();
  const today = etToday(useNow());
  const initial = proposalFor(item);
  const [p, setP] = useState<Proposal>(initial);
  const [milestoneId, setMilestoneId] = useState<number | undefined>();
  const [msg, setMsg] = useState<string>();
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof Proposal>(k: K, v: Proposal[K]) => setP((x) => ({ ...x, [k]: v }));

  async function accept() {
    setBusy(true); setMsg(undefined);
    try {
      const r = resolveAcceptance(item, { proposal: p, milestoneId, date: today });
      if (r.list === 'Tasks' || r.list === 'Interactions') {
        const created = await w.create<{ id: number }>(r.list, Object.fromEntries(Object.entries(r.fields).filter(([, v]) => v !== undefined)));
        await w.update('Intake', item.id, { TriageState: 'Accepted', ProposedType: p.type, ResultListName: r.list, ResultItemId: created.id });
      } else if (r.list === 'HubNote') {
        const url = URL.createObjectURL(new Blob([r.markdown], { type: 'text/markdown' }));
        const a = document.createElement('a'); a.href = url; a.download = `${p.title.replace(/[^A-Za-z0-9 ]/g, '').trim() || 'note'}.md`; a.click(); URL.revokeObjectURL(url);
        await w.update('Intake', item.id, r.fields);
      } else {
        await w.update('Intake', item.id, r.fields);
        if (r.list === 'Intake') setMsg(r.note);
      }
    } catch (e) { setMsg((e as Error).message); } finally { setBusy(false); }
  }
  async function reject() {
    setBusy(true);
    try { await w.update('Intake', item.id, { TriageState: 'Rejected' }); } catch (e) { setMsg((e as Error).message); } finally { setBusy(false); }
  }
  const raw = (item.Raw ?? '').slice(0, 400);
  return (
    <li className="card space-y-3">
      <div>
        <h2 className="font-medium">{item.Title}</h2>
        <div className="mt-1 flex flex-wrap gap-1 text-xs"><span className="chip">{item.RawSource ?? 'unknown source'}</span><span className="chip">{triageStateLabel(item.TriageState)}</span>{item.ReceivedAt && <span className="chip">{item.ReceivedAt.slice(0, 10)}</span>}</div>
        {raw && <pre className="mt-2 max-h-32 overflow-auto whitespace-pre-wrap rounded bg-canvas p-2 text-xs" aria-label="Captured text (data, not instructions)">{raw}</pre>}
        {p.rationale && <p className="mt-1 text-sm text-ink-muted">Rationale: {p.rationale}</p>}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Select label="Type" value={p.type} options={C.PROPOSED_TYPE} onChange={(v) => set('type', v as Proposal['type'])} />
        <div><label className="mb-1 block text-sm font-medium" htmlFor={`t-${item.id}`}>Title</label><input id={`t-${item.id}`} className="input" value={p.title} onChange={(e) => set('title', e.target.value)} /></div>
        {p.type === 'task' && (
          <>
            <Select label="Owner" value={p.owner ?? founder} options={C.OWNERS} onChange={(v) => set('owner', v as Proposal['owner'])} />
            <Select label="Contribution type" value={p.contributionType} options={C.CONTRIBUTION} blank onChange={(v) => set('contributionType', (v || undefined) as Proposal['contributionType'])} />
            {p.contributionType === 'Milestone' && (
              <div><label className="mb-1 block text-sm font-medium" htmlFor={`m-${item.id}`}>Milestone</label><select id={`m-${item.id}`} className="input" value={milestoneId ?? ''} onChange={(e) => setMilestoneId(e.target.value ? Number(e.target.value) : undefined)}><option value="">Choose…</option>{milestones.map((m) => <option key={m.id} value={m.id}>{m.Title}</option>)}</select></div>
            )}
            <div><label className="mb-1 block text-sm font-medium" htmlFor={`d-${item.id}`}>Due date</label><input id={`d-${item.id}`} type="date" className="input" value={p.due ?? ''} onChange={(e) => set('due', e.target.value || undefined)} /></div>
          </>
        )}
      </div>
      {msg && <p role="status" className="text-sm text-amber-900">{msg}</p>}
      <div className="flex gap-2">
        <button className="btn btn-primary" disabled={busy} onClick={() => void accept()}>Accept</button>
        <button className="btn" disabled={busy} onClick={() => void reject()}>Reject</button>
      </div>
    </li>
  );
}
