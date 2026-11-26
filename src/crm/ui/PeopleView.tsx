import { useMemo, useState } from 'react';
import { useHashRoute } from '../../ui/router';
import { nextCheckIn } from '../model/ranking.ts';
import { RELATIONSHIP_TYPES, STAGES } from '../schema.ts';
import { useCrm } from './crmCtx';
import { Pick, TextField } from './parts';
import { filterPeople, filtersFromQuery, orgNameOf, type PeopleFilters } from './viewModel';

export function PeopleView() {
  const { data, cfg, today, openSheet } = useCrm();
  const { query } = useHashRoute();
  const [f, setF] = useState<PeopleFilters>(() => filtersFromQuery(query));
  const set = (patch: Partial<PeopleFilters>) => setF((x) => ({ ...x, ...patch }));
  const rows = useMemo(() => filterPeople(data.people, data.orgs, f), [data, f]);
  const orgOptions = [...data.orgs].sort((a, b) => a.name.localeCompare(b.name)).map((o) => ({ value: o.id, label: o.name }));
  return (
    <section aria-labelledby="people-h" className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h1 id="people-h" className="text-[1.75rem] md:text-display">People</h1>
        <button className="btn btn-primary" onClick={() => openSheet({ kind: 'person' })}>Add person</button>
      </div>
      <form className="grid grid-cols-2 gap-3 md:grid-cols-6" role="search" aria-label="Filter people" onSubmit={(e) => e.preventDefault()}>
        <div className="col-span-2 md:col-span-2"><TextField label="Search name, organization or email" type="search" value={f.search} onChange={(v) => set({ search: v })} /></div>
        <Pick label="Organization" value={f.organizationId} blank="All" options={orgOptions} onChange={(v) => set({ organizationId: v ? Number(v) : undefined })} />
        <Pick label="Relationship type" value={f.relationshipType} blank="All" options={RELATIONSHIP_TYPES} onChange={(v) => set({ relationshipType: v || undefined })} />
        <Pick label="Owner" value={f.owner} blank="Both" options={['Santiago', 'Jay']} onChange={(v) => set({ owner: (v || undefined) as PeopleFilters['owner'] })} />
        <Pick label="Stage" value={f.stage} blank="All" options={STAGES} onChange={(v) => set({ stage: v || undefined })} />
        <Pick label="Importance" value={f.importance} blank="Any" options={['1', '2', '3', '4', '5']} onChange={(v) => set({ importance: v ? Number(v) : undefined })} />
      </form>
      <p role="status" className="text-sm text-ink-muted">{rows.length} of {data.people.length} people</p>
      {rows.length === 0 ? <p className="rounded-card border border-dashed border-hairline p-6 text-center text-sm text-ink-muted">No one matches. Clear a filter or add a person.</p> : (
        <ul className="space-y-2" aria-label="People">
          {rows.map((p) => {
            const next = nextCheckIn(p, today, cfg);
            return (
              <li key={p.id} className="card grid gap-2 md:grid-cols-[minmax(0,1.4fr)_minmax(0,2fr)_auto] md:items-center">
                <div className="min-w-0">
                  <a className="font-medium underline-offset-2 hover:underline" href={`#/crm/person/${p.id}`}>{p.name}</a>
                  <p className="truncate text-sm text-ink-muted">{orgNameOf(data.orgs, p.organizationId)}{p.email ? `, ${p.email}` : ''}</p>
                </div>
                <p className="flex flex-wrap gap-1 text-xs">
                  <span className="chip">{p.relationshipType}</span><span className="chip">{p.owner}</span><span className="chip">{p.stage}</span><span className="chip">Importance {p.importance ?? 3}</span>
                  <span className="chip">Last contact {p.lastTwoWayAt ?? 'none'}</span>{next && <span className="chip">Next {next}</span>}
                  {p.sensitivity === 'Restricted' && <span className="chip chip-danger">Restricted</span>}
                </p>
                <button className="btn" aria-label={`Log contact with ${p.name}`} onClick={() => openSheet({ kind: 'log', personId: p.id })}>Log contact</button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
