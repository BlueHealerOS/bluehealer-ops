import { useMemo, useState } from 'react';
import { effectiveness } from '../model/effectiveness.ts';
import { indicators } from '../model/indicators.ts';
import { rankToday, waitingLists } from '../model/ranking.ts';
import type { Ranked } from '../model/types.ts';
import { useCrm } from './crmCtx';
import { Section, plural } from './parts';
import { orgNameOf } from './viewModel';

export function IndicatorsStrip() {
  const { data, cfg, today } = useCrm();
  const ind = useMemo(() => indicators(data.people, today, cfg), [data.people, today, cfg]);
  const eff = useMemo(() => effectiveness(data.people, data.interactions, today, cfg, 4), [data, today, cfg]);
  const last = eff[0];
  const tile = (key: string, label: string, n: number, names: string[]) => (
    <li key={key} className={`card ${n > 0 ? 'border-danger bg-danger-soft' : ''}`}>
      <p className="text-sm font-medium">{label}</p>
      <p className={`text-2xl font-semibold ${n > 0 ? 'text-danger' : ''}`}>{n}{n > 0 && <span className="ml-2 text-sm font-medium">Needs action</span>}</p>
      {n > 0 ? <p className="text-xs">{names.join(', ')}</p> : <p className="text-xs text-ink-muted">Target is zero.</p>}
    </li>
  );
  return (
    <ul aria-label="Indicators" className="grid gap-3 sm:grid-cols-3">
      {tile('inv', `Investors overdue (over ${cfg.breachDays.investor} days)`, ind.investors.length, ind.investors.map((p) => p.name))}
      {tile('adv', `Advisors overdue (over ${cfg.breachDays.advisor} days)`, ind.advisors.length, ind.advisors.map((p) => p.name))}
      <li className="card">
        <p className="text-sm font-medium">Top 5 contacted within {plural(cfg.effectivenessWorkingDays, 'working day')}, last week</p>
        <p className="text-2xl font-semibold">{last?.share == null ? 'Not enough data' : `${Math.round(last.share * 100)}%`}</p>
        <p className="text-xs text-ink-muted">{last && last.top ? `${last.contacted} of ${last.top}. ` : ''}Approximate: uses current importance and stage.</p>
      </li>
    </ul>
  );
}

function DueCard({ r }: { r: Ranked }) {
  const { data, openSheet, actions, notify } = useCrm();
  const p = r.person;
  return (
    <li className="card">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <a className="text-base font-semibold underline-offset-2 hover:underline" href={`#/crm/person/${p.id}`}>{p.name}</a>
        <span className="chip" title="Priority score, 0 to 100">Priority {r.score}</span>
      </div>
      <p className="text-sm text-ink-muted">{[orgNameOf(data.orgs, p.organizationId), p.relationshipType, p.owner].filter(Boolean).join(', ')}</p>
      <p className="mt-2 text-sm">{r.reason}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button className="btn btn-primary" aria-label={`Log contact with ${p.name}`} onClick={() => openSheet({ kind: 'log', personId: p.id })}>Log contact</button>
        <button className="btn" aria-label={`Snooze ${p.name}`} onClick={() => openSheet({ kind: 'snooze', person: p })}>Snooze</button>
        <a className="btn" aria-label={`Open ${p.name}`} href={`#/crm/person/${p.id}`}>Open</a>
        <button className="btn btn-quiet" aria-label={`Mute ${p.name}`} onClick={() => void actions.mute(p).catch((e: Error) => notify(e.message))}>Mute</button>
      </div>
    </li>
  );
}

export function TodayView() {
  const { data, cfg, today, founder, reload } = useCrm();
  const [scope, setScope] = useState<'mine' | 'both'>('mine');
  const [all, setAll] = useState(false);
  const owner = scope === 'mine' ? founder : 'both';
  const r = useMemo(() => rankToday(data.people, today, cfg, { owner, interactions: data.interactions }), [data, today, cfg, owner]);
  const w = useMemo(() => waitingLists(data.people, today, cfg, owner), [data.people, today, cfg, owner]);
  const shown = all ? r.due : r.top;
  const seg = (k: 'mine' | 'both', label: string) => <button type="button" className={`btn ${scope === k ? 'btn-primary' : ''}`} aria-pressed={scope === k} onClick={() => setScope(k)}>{label}</button>;
  const nameLine = (p: { id: number; name: string; organizationId: number; lastTwoWayAt?: string }) => (
    <li key={p.id} className="flex flex-wrap justify-between gap-2 py-1 text-sm"><a className="underline-offset-2 hover:underline" href={`#/crm/person/${p.id}`}>{p.name}</a><span className="text-ink-muted">{orgNameOf(data.orgs, p.organizationId)}, last contact {p.lastTwoWayAt ?? 'none'}</span></li>
  );
  return (
    <section aria-labelledby="today-h" className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 id="today-h" className="text-[1.75rem] md:text-display">Today</h1>
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Whose list">
          {seg('mine', `Mine (${founder})`)}{seg('both', 'Both founders')}
          <button type="button" className="btn btn-quiet" onClick={() => void reload()}>Reload</button>
        </div>
      </div>
      <IndicatorsStrip />
      <Section id="due-h" title={all ? `All due (${r.due.length})` : `Top ${cfg.topN} due`} aside={r.due.length > cfg.topN && <button type="button" className="btn btn-quiet" aria-expanded={all} onClick={() => setAll((x) => !x)}>{all ? 'Show top five' : `Show all due (${r.due.length})`}</button>}>
        {shown.length ? <ol className="space-y-3" aria-label="Due">{shown.map((x) => <DueCard key={x.person.id} r={x} />)}</ol>
          : <p className="rounded-card border border-dashed border-hairline p-6 text-center text-sm text-ink-muted">Nobody is due. Check Upcoming below or switch to both founders.</p>}
      </Section>
      <Section id="wait-h" title="Waiting on">
        <p className="text-xs text-ink-muted">Accurate only for interactions that were logged.</p>
        <details className="card"><summary className="cursor-pointer font-medium">I am waiting on ({w.waitingOnThem.length})</summary><ul className="mt-2 divide-y divide-hairline" aria-label="I am waiting on">{w.waitingOnThem.map(nameLine)}</ul>{!w.waitingOnThem.length && <p className="mt-2 text-sm text-ink-muted">Nobody.</p>}</details>
        <details className="card"><summary className="cursor-pointer font-medium">Waiting on me ({w.waitingOnMe.length})</summary><ul className="mt-2 divide-y divide-hairline" aria-label="Waiting on me">{w.waitingOnMe.map(nameLine)}</ul>{!w.waitingOnMe.length && <p className="mt-2 text-sm text-ink-muted">Nobody.</p>}</details>
      </Section>
      <Section id="up-h" title={`Upcoming, next ${cfg.upcomingDays} days`}>
        {r.upcoming.length ? <ul className="card divide-y divide-hairline" aria-label="Upcoming">{r.upcoming.map((x) => <li key={x.person.id} className="flex flex-wrap justify-between gap-2 py-1 text-sm"><a className="underline-offset-2 hover:underline" href={`#/crm/person/${x.person.id}`}>{x.person.name}</a><span className="text-ink-muted">{x.nextCheckIn}</span></li>)}</ul>
          : <p className="text-sm text-ink-muted">Nobody is coming up.</p>}
      </Section>
      <p className="text-xs text-ink-muted">Ranking version {cfg.version}. Priority is 8 x importance, plus time since contact, plus 20 when due.</p>
    </section>
  );
}
