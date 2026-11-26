import { useMemo, useState } from 'react';
import { ORG_TYPES } from '../schema.ts';
import { useCrm } from './crmCtx';
import { Pick, TextField } from './parts';
import { interactionsOfOrg, orgPeople, orgSummaries } from './viewModel';

export function OrganizationsView() {
  const { data, openSheet } = useCrm();
  const [type, setType] = useState('');
  const [search, setSearch] = useState('');
  const rows = useMemo(() => orgSummaries(data.orgs, data.people, type || undefined, search), [data, type, search]);
  return (
    <section aria-labelledby="orgs-h" className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h1 id="orgs-h" className="text-[1.75rem] md:text-display">Organizations</h1>
        <button className="btn btn-primary" onClick={() => openSheet({ kind: 'org' })}>Add organization</button>
      </div>
      <form className="grid grid-cols-2 gap-3 md:max-w-xl" role="search" aria-label="Filter organizations" onSubmit={(e) => e.preventDefault()}>
        <TextField label="Search organizations" type="search" value={search} onChange={setSearch} />
        <Pick label="Type" value={type} blank="All" options={ORG_TYPES} onChange={setType} />
      </form>
      {rows.length === 0 ? <p className="rounded-card border border-dashed border-hairline p-6 text-center text-sm text-ink-muted">No organizations match.</p> : (
        <ul className="space-y-2" aria-label="Organizations">
          {rows.map(({ org, people, lastContact }) => (
            <li key={org.id} className="card flex flex-wrap items-center justify-between gap-2">
              <div><a className="font-medium underline-offset-2 hover:underline" href={`#/crm/org/${org.id}`}>{org.name}</a><p className="text-sm text-ink-muted">{org.orgType ?? 'No type'}{org.domain ? `, ${org.domain}` : ''}</p></div>
              <p className="flex flex-wrap gap-1 text-xs"><span className="chip">{people} {people === 1 ? 'person' : 'people'}</span><span className="chip">Last contact {lastContact ?? 'none'}</span></p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function OrgPage({ id }: { id: number }) {
  const { data, openSheet } = useCrm();
  const org = data.orgs.find((o) => o.id === id);
  if (!org) return <p className="card text-sm">This organization was not found. It may have been deleted. <a className="underline" href="#/crm/organizations">Back to organizations</a></p>;
  const people = orgPeople(org, data.people);
  const ints = interactionsOfOrg(org.id, data.people, data.interactions);
  return (
    <section aria-labelledby="org-h" className="space-y-5">
      <p className="text-sm"><a className="underline" href="#/crm/organizations">Organizations</a></p>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div><h1 id="org-h" className="text-[1.75rem] md:text-display">{org.name}</h1><p className="text-sm text-ink-muted">{[org.orgType, org.relationshipToBH, org.domain].filter(Boolean).join(', ')}</p></div>
        <button className="btn btn-primary" onClick={() => openSheet({ kind: 'person', organizationId: org.id })}>Add person here</button>
      </div>
      <section aria-labelledby="org-people-h" className="space-y-2">
        <h2 id="org-people-h" className="text-base font-semibold">People ({people.length})</h2>
        {people.length ? (
          <ul className="space-y-2" aria-label="People at this organization">
            {people.map((p) => (
              <li key={p.id} className="card flex flex-wrap items-center justify-between gap-2">
                <a className="font-medium underline-offset-2 hover:underline" href={`#/crm/person/${p.id}`}>{p.name}</a>
                <p className="flex flex-wrap gap-1 text-xs"><span className="chip">Importance {p.importance ?? 3}</span><span className="chip">Last contact {p.lastTwoWayAt ?? 'none'}</span><span className="chip">{p.stage}</span></p>
              </li>
            ))}
          </ul>
        ) : <p className="text-sm text-ink-muted">No people yet.</p>}
      </section>
      <section aria-labelledby="org-int-h" className="space-y-2">
        <h2 id="org-int-h" className="text-base font-semibold">Interactions ({ints.length})</h2>
        {ints.length ? <ul className="card divide-y divide-hairline" aria-label="Organization interactions">{ints.slice(0, 50).map((i) => <li key={i.id} className="py-1 text-sm"><strong>{i.date}</strong> {i.type}: {i.summary}</li>)}</ul> : <p className="text-sm text-ink-muted">No interactions yet.</p>}
      </section>
    </section>
  );
}
