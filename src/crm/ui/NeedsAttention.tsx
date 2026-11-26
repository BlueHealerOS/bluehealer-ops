import { useMemo, useState } from 'react';
import { duplicateOrgs, duplicatePeople } from '../model/dedupe.ts';
import { parseSnapshot } from '../model/merge.ts';
import { useCrm } from './crmCtx';
import { Section } from './parts';
import { attention, orgNameOf } from './viewModel';

const LIMIT = 50;

export function NeedsAttention() {
  const { data, cfg, today, actions, notify, openSheet } = useCrm();
  const [busy, setBusy] = useState(false);
  const a = useMemo(() => attention(data.people, data.interactions, today, cfg), [data, today, cfg]);
  const dupPeople = useMemo(() => duplicatePeople(data.people, cfg), [data.people, cfg]);
  const dupOrgs = useMemo(() => duplicateOrgs(data.orgs, cfg), [data.orgs, cfg]);
  const merges = useMemo(() => data.mergeLog.filter((e) => !e.undone && parseSnapshot(e.snapshot)).sort((x, y) => (y.mergedAt ?? '').localeCompare(x.mergedAt ?? '') || y.id - x.id).slice(0, 10), [data.mergeLog]);
  const list = (label: string, people: { id: number; name: string; organizationId: number }[], empty: string) => (
    <ul className="card divide-y divide-hairline" aria-label={label}>
      {people.slice(0, LIMIT).map((p) => <li key={p.id} className="flex flex-wrap justify-between gap-2 py-1 text-sm"><a className="underline-offset-2 hover:underline" href={`#/crm/person/${p.id}`}>{p.name}</a><span className="text-ink-muted">{orgNameOf(data.orgs, p.organizationId)}</span></li>)}
      {people.length > LIMIT && <li className="py-1 text-sm text-ink-muted">and {people.length - LIMIT} more</li>}
      {!people.length && <li className="py-1 text-sm text-ink-muted">{empty}</li>}
    </ul>
  );
  async function recompute() {
    setBusy(true);
    try { const r = await actions.recompute(); notify(`Recomputed ${r.updated} ${r.updated === 1 ? 'person' : 'people'}.${r.failed.length ? ` ${r.failed.length} changed meanwhile: reload and run it again.` : ''}`); } catch (e) { notify((e as Error).message); } finally { setBusy(false); }
  }
  return (
    <section aria-labelledby="att-h" className="space-y-5">
      <h1 id="att-h" className="text-[1.75rem] md:text-display">Needs attention</h1>
      <Section id="dup-h" title={`Possible duplicates (${dupPeople.length})`}>
        <p className="text-xs text-ink-muted">Same email, or the same name in the same organization. Nothing is merged automatically.</p>
        <ul className="space-y-2" aria-label="Possible duplicate people">
          {dupPeople.map((d) => (
            <li key={`${d.a.id}-${d.b.id}`} className="card flex flex-wrap items-center justify-between gap-2 text-sm">
              <span><a className="underline" href={`#/crm/person/${d.a.id}`}>{d.a.name}</a> and <a className="underline" href={`#/crm/person/${d.b.id}`}>{d.b.name}</a>, {d.reason}</span>
              <button className="btn" aria-label={`Merge ${d.a.name} and ${d.b.name}`} onClick={() => openSheet({ kind: 'merge', aId: d.a.id, bId: d.b.id })}>Merge</button>
            </li>
          ))}
          {!dupPeople.length && <li className="card text-sm text-ink-muted">No possible duplicates.</li>}
        </ul>
        {dupOrgs.length > 0 && (
          <div><h3 className="text-sm font-medium">Organizations that share a web domain (suggestion only)</h3>
            <ul className="card divide-y divide-hairline" aria-label="Possible duplicate organizations">{dupOrgs.map((d) => <li key={`${d.a.id}-${d.b.id}`} className="py-1 text-sm"><a className="underline" href={`#/crm/org/${d.a.id}`}>{d.a.name}</a> and <a className="underline" href={`#/crm/org/${d.b.id}`}>{d.b.name}</a></li>)}</ul></div>
        )}
      </Section>
      <Section id="merges-h" title={`Recent merges (${merges.length})`}>
        <ul className="space-y-2" aria-label="Recent merges">
          {merges.map((m) => (
            <li key={m.id} className="card flex flex-wrap items-center justify-between gap-2 text-sm">
              <span>{m.title}<span className="block text-xs text-ink-muted">{m.mergedAt?.slice(0, 10)} by {m.mergedBy}</span></span>
              <button className="btn" aria-label={`Undo merge: ${m.title}`} onClick={() => void actions.undoMerge(m.id).then(() => notify('Merge undone. Both records are back.')).catch((e: Error) => notify(e.message, undefined, 10_000))}>Undo merge</button>
            </li>
          ))}
          {!merges.length && <li className="card text-sm text-ink-muted">No merges to undo.</li>}
        </ul>
      </Section>
      <Section id="stale-h" title={`System fields out of date (${a.stale.length})`} aside={<button className="btn" disabled={busy || !a.stale.length} onClick={() => void recompute()}>Recompute</button>}>
        <p className="text-xs text-ink-muted">Last contact dates and direction are kept on each person for speed. Recompute rebuilds them from the logged interactions.</p>
        {list('System fields out of date', a.stale.map((s) => s.person), 'All up to date.')}
      </Section>
      <Section id="nodate-h" title={`Never contacted, no check-in date (${a.noCheckInDate.length})`}>{list('No check-in date', a.noCheckInDate, 'None.')}</Section>
      <Section id="noint-h" title={`No interaction logged (${a.noInteraction.length})`}>{list('No interaction', a.noInteraction, 'Everyone has at least one.')}</Section>
      <Section id="noemail-h" title={`Missing email (${a.missingEmail.length})`}>{list('Missing email', a.missingEmail, 'None.')}</Section>
      <Section id="restricted-h" title={`Restricted records (${a.restricted.length})`}>
        <p className="text-xs text-ink-muted">Left out of Today, indicators and exports. Visible to founders only.</p>
        {list('Restricted records', a.restricted, 'None.')}
      </Section>
    </section>
  );
}
