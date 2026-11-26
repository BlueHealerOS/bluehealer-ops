import { useMemo, useState } from 'react';
import { useCrm } from './crmCtx';
import { Section } from './parts';
import { attention, orgNameOf } from './viewModel';

const LIMIT = 50;

export function NeedsAttention() {
  const { data, cfg, today, actions, notify } = useCrm();
  const [busy, setBusy] = useState(false);
  const a = useMemo(() => attention(data.people, data.interactions, today, cfg), [data, today, cfg]);
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
      <p className="text-sm text-ink-muted">Possible duplicates and merge arrive in a later stage.</p>
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
