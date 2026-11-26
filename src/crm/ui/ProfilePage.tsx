import { nextCheckIn, reason } from '../model/ranking.ts';
import { waitingOn } from '../model/ranking.ts';
import { lastInteractions } from '../model/derived.ts';
import { useCrm } from './crmCtx';
import { fmtDate } from './parts';
import { interactionsOf, orgNameOf, safeHttpUrl } from './viewModel';

export function ProfilePage({ id }: { id: number }) {
  const { data, cfg, today, openSheet, actions, notify } = useCrm();
  const p = data.people.find((x) => x.id === id);
  if (!p) return <p className="card text-sm">This person was not found. They may have been deleted. <a className="underline" href="#/crm/people">Back to people</a></p>;
  const ints = interactionsOf(p.id, data.interactions);
  const next = nextCheckIn(p, today, cfg);
  const wait = waitingOn(p, today, cfg);
  const last = lastInteractions(data.interactions).get(p.id);
  const nameOf = (pid: number) => data.people.find((x) => x.id === pid)?.name ?? 'Unknown';
  const row = (k: string, v: string | number | undefined) => <div className="flex justify-between gap-3 py-1 text-sm"><dt className="text-ink-muted">{k}</dt><dd className="text-right font-medium">{v ?? 'None'}</dd></div>;
  const dormant = p.stage === 'Dormant';
  return (
    <section aria-labelledby="person-h" className="space-y-5">
      <p className="text-sm"><a className="underline" href="#/crm/people">People</a></p>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 id="person-h" className="text-[1.75rem] md:text-display">{p.name}</h1>
          <p className="text-sm text-ink-muted"><a className="underline" href={`#/crm/org/${p.organizationId}`}>{orgNameOf(data.orgs, p.organizationId)}</a>, {p.relationshipType}</p>
          {p.sensitivity === 'Restricted' && <p className="mt-1"><span className="chip chip-danger">Restricted: left out of Today and indicators</span></p>}
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="btn btn-primary" onClick={() => openSheet({ kind: 'log', personId: p.id })}>Log contact</button>
          <button className="btn" onClick={() => openSheet({ kind: 'snooze', person: p })}>Snooze</button>
          {dormant ? <button className="btn" onClick={() => void actions.setStage(p, 'Active').then(() => notify(`${p.name} is active again.`)).catch((e: Error) => notify(e.message))}>Make active</button>
            : <button className="btn" onClick={() => void actions.mute(p).catch((e: Error) => notify(e.message))}>Mute</button>}
          <button className="btn" onClick={() => openSheet({ kind: 'person', person: p })}>Edit</button>
        </div>
      </div>
      <section aria-labelledby="next-h" className="card space-y-1">
        <h2 id="next-h" className="text-base font-semibold">Next check-in</h2>
        <p className="text-sm">{next ? `${next}${next <= today ? ' (due)' : ''}` : 'No date yet: this person has not been contacted and is not in an active stage.'}</p>
        {next && <p className="text-sm text-ink-muted">{reason(p, today, cfg, last)}</p>}
        {wait && <p className="text-sm">{wait === 'them' ? 'I am waiting on them.' : 'They are waiting on me.'} Accurate only for logged interactions.</p>}
      </section>
      <section aria-labelledby="details-h" className="card">
        <h2 id="details-h" className="mb-1 text-base font-semibold">Details</h2>
        <dl className="divide-y divide-hairline">
          {row('Owner', p.owner)}{row('Stage', p.stage)}{row('Importance', p.importance ?? cfg.defaultImportance)}{row('Comfort', p.comfort)}{row('Email', p.email)}
          {row('Agreed check-in', p.agreedCheckIn)}{row('Last two-way contact', fmtDate(p.lastTwoWayAt))}{row('Last touch', fmtDate(p.lastTouchAt))}{row('Sensitivity', p.sensitivity)}
        </dl>
      </section>
      <section aria-labelledby="hist-h" className="space-y-2">
        <h2 id="hist-h" className="text-base font-semibold">Interaction history ({ints.length})</h2>
        {ints.length ? (
          <ul className="space-y-2" aria-label="Interaction history">
            {ints.map((i) => {
              const href = safeHttpUrl(i.sourceLink);
              return (
                <li key={i.id} className="card text-sm">
                  <p><strong>{i.date}</strong>, {i.type}, {i.direction}{i.peopleIds.length > 1 ? `, with ${i.peopleIds.filter((x) => x !== p.id).map(nameOf).join(', ')}` : ''}</p>
                  <p>{i.summary}</p>
                  {i.sourceLink && <p className="text-xs">{href ? <a className="underline" href={href} target="_blank" rel="noreferrer noopener">Source</a> : i.sourceLink}</p>}
                </li>
              );
            })}
          </ul>
        ) : <p className="text-sm text-ink-muted">No interactions yet. Use Log contact to add the first.</p>}
      </section>
    </section>
  );
}
