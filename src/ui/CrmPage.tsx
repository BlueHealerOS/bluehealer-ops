import { useState } from 'react';
import { useOps } from './ctx';
import { useItems, useNow, useWrite } from './data';
import type { Interaction, OrgFull, PersonFull } from '../domain/types';
import { EMAIL_TEMPLATES, findDuplicates, followUpsDueThisWeek, investorBoard, planInteraction, renderTemplate, stagesFor } from '../domain/crm';
import { overdueContacts } from '../reminders/rules';
import { etToday } from '../domain/time';
import * as C from '../schema/choices';
import { createDraft, DealDataError } from '../graph/store';
import { navigate, useHashRoute } from './router';
import { Empty, Loading, Select } from './parts';

const TABS = [['people', 'People'], ['organizations', 'Organizations'], ['investors', 'Investor follow-ups'], ['overdue', 'Overdue contacts'], ['due', 'Follow-ups due this week']] as const;

export function CrmPage() {
  const { segments } = useHashRoute();
  const tab = segments[1] ?? 'people';
  const { search } = useOps();
  const today = etToday(useNow());
  const people = useItems<PersonFull>('People');
  const orgs = useItems<OrgFull>('Organizations');
  const [open, setOpen] = useState<number | 'new' | null>(null);
  const orgName = new Map((orgs.data ?? []).map((o) => [o.id, o.Title]));
  const all = people.data ?? [];
  const match = (p: PersonFull) => !search || `${p.Title} ${p.Email ?? ''} ${orgName.get(p.OrganizationLookupId ?? -1) ?? ''}`.toLowerCase().includes(search.toLowerCase());

  return (
    <section aria-labelledby="crm-h" className="space-y-3">
      <div className="flex items-center justify-between">
        <h1 id="crm-h" className="text-[1.75rem] md:text-display">Relationships</h1>
        <button className="btn btn-primary" onClick={() => setOpen('new')}>New person</button>
      </div>
      <nav aria-label="Relationship views" className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1">
        {TABS.map(([k, label]) => <a key={k} href={`#/crm/${k}`} aria-current={tab === k ? 'page' : undefined} className={`btn whitespace-nowrap ${tab === k ? 'btn-primary' : ''}`}>{label}</a>)}
      </nav>
      {(people.isLoading || orgs.isLoading) && <Loading what="relationships" />}
      {people.error && <p role="alert" className="text-danger">Relationships could not be loaded. {(people.error as Error).message}</p>}
      {tab === 'people' && <PeopleList people={all.filter(match)} orgName={orgName} onOpen={(p) => setOpen(p.id)} />}
      {tab === 'organizations' && <OrgList orgs={orgs.data ?? []} />}
      {tab === 'investors' && (
        <div className="grid gap-3 md:grid-cols-4" aria-label="Investor follow-ups by stage">
          {investorBoard(all).map((col) => (
            <section key={col.stage} aria-label={col.stage} className="rounded-lg bg-canvas p-2">
              <h2 className="mb-2 text-sm font-semibold">{col.stage} ({col.people.length})</h2>
              <ul className="space-y-2">{col.people.map((p) => <li key={p.id} className="card p-2 text-sm"><button className="font-medium text-left" onClick={() => setOpen(p.id)}>{p.Title}</button>{p.NextStep && <div className="text-xs text-ink-muted">{p.NextStep}</div>}{p.NextFollowUp && <div className="text-xs">Follow up {p.NextFollowUp}</div>}</li>)}</ul>
            </section>
          ))}
        </div>
      )}
      {tab === 'overdue' && <PeopleList people={overdueContacts(all, today)} orgName={orgName} onOpen={(p) => setOpen(p.id)} empty="No contacts are overdue." />}
      {tab === 'due' && <PeopleList people={followUpsDueThisWeek(all, today)} orgName={orgName} onOpen={(p) => setOpen(p.id)} empty="No follow-ups are due this week." />}
      {open !== null && (open === 'new' || all.some((x) => x.id === open)) && <PersonDrawer key={open} p={open === 'new' ? undefined : all.find((x) => x.id === open)} all={all} orgs={orgs.data ?? []} onClose={() => setOpen(null)} />}
    </section>
  );
}

function PeopleList({ people, orgName, onOpen, empty = 'No people yet.' }: { people: PersonFull[]; orgName: Map<number, string>; onOpen: (p: PersonFull) => void; empty?: string }) {
  if (!people.length) return <Empty>{empty}</Empty>;
  return (
    <ul className="space-y-2" aria-label="People">
      {people.map((p) => (
        <li key={p.id} className="card">
          <button className="w-full text-left" onClick={() => onOpen(p)}>
            <span className="font-medium">{p.Title}</span>
            <span className="mt-1 flex flex-wrap gap-1 text-xs">
              {p.OrganizationLookupId && <span className="chip">{orgName.get(p.OrganizationLookupId) ?? 'Organization'}</span>}
              {p.RelationshipType && <span className="chip">{p.RelationshipType}</span>}
              {p.Stage && <span className="chip">{p.Stage}</span>}
              {p.Tier && <span className="chip">Tier {p.Tier}</span>}
              {p.LastContact && <span className="chip">Last contact {p.LastContact}</span>}
              {p.NextFollowUp && <span className="chip">Follow up {p.NextFollowUp}</span>}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

function OrgList({ orgs }: { orgs: OrgFull[] }) {
  const w = useWrite();
  const [name, setName] = useState('');
  const [type, setType] = useState('');
  return (
    <div className="space-y-3">
      <form className="card flex flex-wrap items-end gap-2" onSubmit={async (e) => { e.preventDefault(); if (name.trim()) { await w.create('Organizations', { Title: name.trim(), ...(type ? { OrgType: type } : {}), Source: 'manual', Owner: 'Unassigned' }); setName(''); } }}>
        <div className="min-w-48 flex-1"><label htmlFor="o-n" className="mb-1 block text-sm font-medium">New organization</label><input id="o-n" className="input" value={name} onChange={(e) => setName(e.target.value)} /></div>
        <Select label="Type" value={type} options={C.ORG_TYPES} blank onChange={setType} />
        <button className="btn btn-primary" type="submit">Add</button>
      </form>
      {orgs.length === 0 ? <Empty>No organizations yet.</Empty> : <ul className="space-y-2" aria-label="Organizations">{orgs.map((o) => <li key={o.id} className="card"><span className="font-medium">{o.Title}</span> {o.OrgType && <span className="chip ml-2">{o.OrgType}</span>}</li>)}</ul>}
    </div>
  );
}

function PersonDrawer({ p, all, orgs, onClose }: { p?: PersonFull; all: PersonFull[]; orgs: OrgFull[]; onClose: () => void }) {
  const { founder } = useOps();
  const w = useWrite();
  const today = etToday(useNow());
  const [d, setD] = useState<Partial<PersonFull>>(p ?? { Owner: founder, Tier: undefined });
  const [err, setErr] = useState<string>();
  const [tab, setTab] = useState<'details' | 'log' | 'email'>('details');
  const set = <K extends keyof PersonFull>(k: K, v: PersonFull[K] | undefined) => setD((x) => ({ ...x, [k]: v }));
  const dups = !p && d.Title ? findDuplicates({ name: d.Title, email: d.Email }, all) : [];
  const ints = useItems<Interaction>('Interactions', undefined, !!p);
  const mine = (ints.data ?? []).filter((i) => i.PersonLookupId === p?.id).sort((a, b) => (b.Date ?? '').localeCompare(a.Date ?? ''));

  async function save() {
    if (!d.Title?.trim()) { setErr('Please enter a name.'); return; }
    try {
      const fields: Record<string, unknown> = {
        Title: d.Title, OrganizationLookupId: d.OrganizationLookupId ?? null, Role: d.Role ?? null, Email: d.Email ?? null, Phone: d.Phone ?? null,
        RelationshipType: d.RelationshipType ?? null, Stage: d.Stage ?? null, Tier: d.Tier ?? null, CadenceDays: d.CadenceDays ?? null,
        NextFollowUp: d.NextFollowUp ?? null, NextStep: d.NextStep ?? null, Owner: d.Owner, Sensitivity: d.Sensitivity ?? 'normal',
      };
      if (p) await w.update('People', p.id, fields);
      else await w.create('People', { Source: 'manual', ...Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== null)) });
      onClose();
    } catch (e) { setErr(e instanceof DealDataError ? e.message : (e as Error).message); }
  }
  const lab = 'mb-1 block text-sm font-medium';
  const stages = stagesFor(d.RelationshipType);
  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/40" role="presentation" onClick={onClose}>
      <aside role="dialog" aria-modal="true" aria-label="Person" className="h-full w-full max-w-xl overflow-y-auto bg-white p-4" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between"><h2 className="text-lg font-semibold">{p ? p.Title : 'New person'}</h2><button className="btn" onClick={onClose}>Close</button></div>
        {p && <div role="tablist" className="mb-3 flex gap-2">{(['details', 'log', 'email'] as const).map((t) => <button key={t} role="tab" aria-selected={tab === t} className={`btn ${tab === t ? 'btn-primary' : ''}`} onClick={() => setTab(t)}>{t === 'details' ? 'Details' : t === 'log' ? 'Log interaction' : 'Draft email'}</button>)}</div>}
        {tab === 'details' && (
          <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); void save(); }}>
            <div><label className={lab} htmlFor="p-n">Name</label><input id="p-n" className="input" value={d.Title ?? ''} onChange={(e) => set('Title', e.target.value)} /></div>
            {dups.length > 0 && <div role="alert" className="rounded-md bg-amber-50 p-2 text-sm text-amber-900">Possible duplicate: {dups.map((x) => `${x.title} (${x.reason})`).join(', ')}. Please check before saving.</div>}
            <div className="grid grid-cols-2 gap-3">
              <div><label className={lab} htmlFor="p-o">Organization</label><select id="p-o" className="input" value={d.OrganizationLookupId ?? ''} onChange={(e) => set('OrganizationLookupId', e.target.value ? Number(e.target.value) : undefined)}><option value="">None</option>{orgs.map((o) => <option key={o.id} value={o.id}>{o.Title}</option>)}</select></div>
              <div><label className={lab} htmlFor="p-r">Role</label><input id="p-r" className="input" value={d.Role ?? ''} onChange={(e) => set('Role', e.target.value)} /></div>
              <div><label className={lab} htmlFor="p-e">Email</label><input id="p-e" type="email" className="input" value={d.Email ?? ''} onChange={(e) => set('Email', e.target.value)} /></div>
              <div><label className={lab} htmlFor="p-ph">Phone</label><input id="p-ph" className="input" value={d.Phone ?? ''} onChange={(e) => set('Phone', e.target.value)} /></div>
              <Select label="Relationship type" value={d.RelationshipType} options={C.RELATIONSHIP_TYPES} blank onChange={(v) => setD((x) => ({ ...x, RelationshipType: v || undefined, Stage: undefined }))} />
              <Select label="Pipeline stage" value={d.Stage} options={stages} blank onChange={(v) => set('Stage', v || undefined)} />
              <Select label="Tier" value={d.Tier} options={C.TIERS} blank onChange={(v) => set('Tier', v || undefined)} />
              <div><label className={lab} htmlFor="p-c">Contact cadence (days)</label><input id="p-c" type="number" min={1} className="input" value={d.CadenceDays ?? ''} onChange={(e) => set('CadenceDays', e.target.value ? Number(e.target.value) : undefined)} /></div>
              <div><label className={lab} htmlFor="p-f">Next follow-up</label><input id="p-f" type="date" className="input" value={d.NextFollowUp ?? ''} onChange={(e) => set('NextFollowUp', e.target.value)} /></div>
              <Select label="Owner" value={d.Owner} options={C.OWNERS} onChange={(v) => set('Owner', v as PersonFull['Owner'])} />
            </div>
            <div><label className={lab} htmlFor="p-ns">Next step (free text)</label><input id="p-ns" className="input" maxLength={255} value={d.NextStep ?? ''} onChange={(e) => set('NextStep', e.target.value)} /></div>
            {p && <p className="text-sm text-ink-muted">Last contact: {p.LastContact ?? 'none recorded'}</p>}
            {err && <p role="alert" className="rounded-md bg-danger-soft p-2 text-sm text-danger">{err}</p>}
            <button className="btn btn-primary" type="submit">Save</button>
            {p && mine.length > 0 && (
              <div><h3 className="mt-4 font-semibold">Interactions</h3><ul className="mt-1 space-y-1 text-sm" aria-label="Interactions">{mine.map((i) => <li key={i.id} className="card p-2"><strong>{i.Date}</strong> {i.InteractionType}: {i.Summary}</li>)}</ul></div>
            )}
          </form>
        )}
        {tab === 'log' && p && <LogForm p={p} today={today} onDone={() => setTab('details')} />}
        {tab === 'email' && p && <Composer p={p} today={today} onLogged={() => setTab('details')} />}
      </aside>
    </div>
  );
}

function LogForm({ p, today, onDone, preset }: { p: PersonFull; today: string; onDone: () => void; preset?: { type?: string; summary?: string } }) {
  const w = useWrite();
  const [type, setType] = useState(preset?.type ?? 'call');
  const [date, setDate] = useState(today);
  const [summary, setSummary] = useState(preset?.summary ?? '');
  const [fu, setFu] = useState('');
  const [fuTitle, setFuTitle] = useState('');
  const [err, setErr] = useState<string>();
  async function save() {
    try {
      const plan = planInteraction({ person: p, date, type, summary, followUpDue: fu || undefined, followUpTitle: fuTitle });
      const it = await w.create<Interaction>('Interactions', { Source: 'manual', ...plan.interaction });
      let taskId: number | undefined;
      if (plan.task) { const t = await w.create<{ id: number }>('Tasks', Object.fromEntries(Object.entries(plan.task).filter(([, v]) => v !== undefined))); taskId = t.id; }
      if (taskId) await w.update('Interactions', it.id, { FollowUpTaskId: taskId });
      if (Object.keys(plan.person).length) await w.update('People', p.id, plan.person);
      onDone();
    } catch (e) { setErr((e as Error).message); }
  }
  return (
    <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); void save(); }}>
      <p className="text-sm text-ink-muted">Please do not enter summaries of counsel, equity, tax, banking or deal-structure conversations. Link the matching SharePoint Documents folder instead.</p>
      <div className="grid grid-cols-2 gap-3">
        <Select label="Type" value={type} options={C.INTERACTION_TYPES} onChange={setType} />
        <div><label htmlFor="l-d" className="mb-1 block text-sm font-medium">Date</label><input id="l-d" type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} /></div>
      </div>
      <div><label htmlFor="l-s" className="mb-1 block text-sm font-medium">Short summary</label><textarea id="l-s" className="input" rows={3} maxLength={2000} value={summary} onChange={(e) => setSummary(e.target.value)} /></div>
      <div className="grid grid-cols-2 gap-3">
        <div><label htmlFor="l-f" className="mb-1 block text-sm font-medium">Follow-up needed by</label><input id="l-f" type="date" className="input" value={fu} onChange={(e) => setFu(e.target.value)} /></div>
        <div><label htmlFor="l-ft" className="mb-1 block text-sm font-medium">Follow-up task title</label><input id="l-ft" className="input" value={fuTitle} onChange={(e) => setFuTitle(e.target.value)} placeholder={`Follow up with ${p.Title}`} /></div>
      </div>
      {err && <p role="alert" className="rounded-md bg-danger-soft p-2 text-sm text-danger">{err}</p>}
      <button className="btn btn-primary" type="submit">Log interaction</button>
    </form>
  );
}

function Composer({ p, today, onLogged }: { p: PersonFull; today: string; onLogged: () => void }) {
  const { store } = useOps();
  const [tpl, setTpl] = useState(EMAIL_TEMPLATES[0]!.id);
  const t = EMAIL_TEMPLATES.find((x) => x.id === tpl)!;
  const r = renderTemplate(t, p);
  const [subject, setSubject] = useState(r.subject);
  const [body, setBody] = useState(r.body);
  const [state, setState] = useState<{ link?: string; err?: string; saved?: boolean }>({});
  const [logging, setLogging] = useState(false);
  const pick = (id: string) => { const x = EMAIL_TEMPLATES.find((y) => y.id === id)!; const rr = renderTemplate(x, p); setTpl(id); setSubject(rr.subject); setBody(rr.body); };
  if (logging) return <LogForm p={p} today={today} onDone={onLogged} preset={{ type: 'email', summary: `Draft email created: ${subject}` }} />;
  return (
    <form className="space-y-3" onSubmit={async (e) => {
      e.preventDefault();
      if (!p.Email) { setState({ err: 'This person has no email address yet.' }); return; }
      try { const d = await createDraft(store.client, { subject, bodyHtml: body, to: [p.Email] }); setState({ saved: true, link: d.webLink }); }
      catch (er) { setState({ err: (er as Error).message }); }
    }}>
      <p className="text-sm text-ink-muted">This saves an Outlook draft. Nothing is sent from this app.</p>
      <Select label="Template" value={tpl} options={EMAIL_TEMPLATES.map((x) => x.id)} onChange={pick} />
      <div><label htmlFor="c-s" className="mb-1 block text-sm font-medium">Subject</label><input id="c-s" className="input" value={subject} onChange={(e) => setSubject(e.target.value)} /></div>
      <div><label htmlFor="c-b" className="mb-1 block text-sm font-medium">Message (HTML)</label><textarea id="c-b" className="input font-mono" rows={8} value={body} onChange={(e) => setBody(e.target.value)} /></div>
      {state.err && <p role="alert" className="rounded-md bg-danger-soft p-2 text-sm text-danger">{state.err}</p>}
      {state.saved && <p role="status" className="rounded-md bg-green-50 p-2 text-sm text-green-900">Draft saved in Outlook.{state.link && <> <a className="underline" href={state.link} target="_blank" rel="noreferrer">Open draft</a></>}</p>}
      <div className="flex gap-2">
        <button className="btn btn-primary" type="submit">Save draft in Outlook</button>
        {state.saved && <button type="button" className="btn" onClick={() => setLogging(true)}>Log this interaction</button>}
      </div>
    </form>
  );
}

export const gotoCrm = (tab: string) => navigate(`/crm/${tab}`);
