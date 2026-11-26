import { useMemo, useState, type FormEvent } from 'react';
import { addDays } from '../../domain/time.ts';
import { ConflictError, CrmValidationError } from '../graph/repo.ts';
import { defaultDirection, DIRECTIONS, INTERACTION_TYPES } from '../model/defaults.ts';
import { findPersonDuplicates, type PersonDuplicate } from '../model/dedupe.ts';
import { quickSnoozeDates } from '../model/defaults.ts';
import type { Direction, InteractionType, Owner, Sensitivity, Stage } from '../model/types.ts';
import { ORG_TYPES, OWNERS, RELATIONSHIP_TYPES, STAGES } from '../schema.ts';
import { defaultChoices, MERGE_FIELDS, mergedPatch, type MergeChoices, type MergeField } from '../model/merge.ts';
import { deletionPreview } from '../export.ts';
import { navigate } from '../../ui/router';
import { type SheetState, useCrm } from './crmCtx';
import { end, Pick, plural, Sheet, TextField } from './parts';
import { orgNameOf } from './viewModel';

export function Sheets({ state, onClose }: { state: SheetState | null; onClose: () => void }) {
  if (!state) return null;
  switch (state.kind) {
    case 'log': return <LogContactSheet personId={state.personId} onClose={onClose} />;
    case 'snooze': return <SnoozeSheet person={state.person} onClose={onClose} />;
    case 'person': return <PersonSheet person={state.person} organizationId={state.organizationId} onClose={onClose} />;
    case 'org': return <OrgSheet onClose={onClose} />;
    case 'merge': return <MergeSheet aId={state.aId} bId={state.bId} onClose={onClose} />;
    case 'delete': return <DeleteSheet personId={state.personId} onClose={onClose} />;
  }
}

function ErrorLine({ error, onReload }: { error: string | null; onReload?: () => void }) {
  if (!error) return null;
  return <div role="alert" className="flex flex-wrap items-center gap-2 rounded-control bg-danger-soft p-2 text-sm text-danger">{error}{onReload && <button type="button" className="btn" onClick={onReload}>Reload</button>}</div>;
}
const messageOf = (e: unknown) => (e instanceof ConflictError || e instanceof CrmValidationError ? e.message : `Could not save. ${(e as Error).message}`);

function LogContactSheet({ personId, onClose }: { personId?: number; onClose: () => void }) {
  const { data, today, actions, notify, reload } = useCrm();
  const [ids, setIds] = useState<number[]>(personId ? [personId] : []);
  const [summary, setSummary] = useState('');
  const [type, setType] = useState<InteractionType>('email');
  const [direction, setDirection] = useState<Direction>(defaultDirection('email'));
  const [date, setDate] = useState(today);
  const [followUp, setFollowUp] = useState(false);
  const [link, setLink] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const [busy, setBusy] = useState(false);
  const name = (id: number) => data.people.find((p) => p.id === id)?.name ?? 'Unknown';
  const others = useMemo(() => data.people.filter((p) => !ids.includes(p.id)).sort((a, b) => a.name.localeCompare(b.name)), [data.people, ids]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null); setConflict(false);
    try {
      const r = await actions.logContact({ personIds: ids, summary, type, direction, date, followUpNeeded: followUp, sourceLink: link || undefined });
      notify(end(`Logged contact with ${ids.map(name).join(', ')}`));
      for (const f of r.failed) notify(f.message, undefined, 10_000);
      for (const w of r.warnings) notify(w, undefined, 10_000);
      onClose();
    } catch (err) { setError(messageOf(err)); setConflict(err instanceof ConflictError); } finally { setBusy(false); }
  }
  return (
    <Sheet title="Log contact" onClose={onClose}>
      <form className="space-y-3" onSubmit={(e) => void submit(e)}>
        <p className="text-sm">With: <strong>{ids.length ? ids.map(name).join(', ') : 'nobody yet'}</strong></p>
        <p className="text-xs text-ink-muted">Keep notes factual and professional, as if the person could read them. Please do not summarize counsel, equity, tax, banking or deal-structure conversations: link the SharePoint track folder under More instead.</p>
        <div>
          <label htmlFor="log-summary" className="mb-1 block text-sm font-medium">Summary (required, one line)</label>
          <input id="log-summary" data-autofocus className="input" maxLength={200} value={summary} onChange={(e) => setSummary(e.target.value)} aria-required="true" />
          <p className="mt-1 text-xs text-ink-muted">{summary.length} of 200</p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Pick label="Type" value={type} options={INTERACTION_TYPES} onChange={(v) => { const t = v as InteractionType; setType(t); setDirection(defaultDirection(t)); }} />
          <Pick label="Direction" value={direction} options={DIRECTIONS} onChange={(v) => setDirection(v as Direction)} />
        </div>
        <TextField label="Date" type="date" value={date} max={today} onChange={setDate} />
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={followUp} onChange={(e) => setFollowUp(e.target.checked)} />Follow-up needed (creates a task)</label>
        <details className="rounded-control border border-hairline p-2">
          <summary className="cursor-pointer text-sm font-medium">More</summary>
          <div className="mt-2 space-y-3">
            <Pick label="Also with" value="" blank="Add another person" options={others.map((p) => ({ value: p.id, label: p.name }))} onChange={(v) => { if (v) setIds((x) => [...x, Number(v)]); }} />
            {ids.length > 1 && <ul className="flex flex-wrap gap-1" aria-label="People in this contact">{ids.map((id) => <li key={id} className="chip">{name(id)}{id !== personId && <button type="button" className="ml-1 font-bold" aria-label={`Remove ${name(id)}`} onClick={() => setIds((x) => x.filter((y) => y !== id))}>x</button>}</li>)}</ul>}
            <TextField label="Source link (Granola note, Outlook link or SharePoint folder)" value={link} onChange={setLink} />
          </div>
        </details>
        <ErrorLine error={error} onReload={conflict ? () => { void reload().then(onClose); } : undefined} />
        <div className="flex gap-2"><button className="btn btn-primary" type="submit" disabled={busy || !ids.length}>Save contact</button><button className="btn" type="button" onClick={onClose}>Cancel</button></div>
      </form>
    </Sheet>
  );
}

function SnoozeSheet({ person, onClose }: { person: NonNullable<Extract<SheetState, { kind: 'snooze' }>['person']>; onClose: () => void }) {
  const { today, actions, notify, reload } = useCrm();
  const [date, setDate] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  async function save(d: string) {
    setError(null); setConflict(false);
    try { await actions.snooze(person, d); notify(`${person.name} snoozed until ${d}.`); onClose(); } catch (err) { setError(messageOf(err)); setConflict(err instanceof ConflictError); }
  }
  return (
    <Sheet title={`Snooze ${person.name}`} onClose={onClose}>
      <div className="space-y-3">
        <p className="text-sm text-ink-muted">Sets an agreed check-in date. The person leaves the list until then.</p>
        <ul className="grid grid-cols-2 gap-2" aria-label="Quick options">
          {quickSnoozeDates(today).map((o) => <li key={o.label}><button type="button" className="btn w-full" data-autofocus={o.label === '1 week' ? true : undefined} onClick={() => void save(o.date)}>{o.label}<span className="text-xs text-ink-muted">{o.date}</span></button></li>)}
        </ul>
        <form className="flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); void save(date); }}>
          <div className="min-w-40 flex-1"><TextField label="After a date you choose" type="date" value={date} min={addDays(today, 1)} onChange={setDate} /></div>
          <button type="submit" className="btn btn-primary" disabled={!date}>Snooze</button>
        </form>
        <ErrorLine error={error} onReload={conflict ? () => { void reload().then(onClose); } : undefined} />
      </div>
    </Sheet>
  );
}

function PersonSheet({ person, organizationId, onClose }: { person?: Extract<SheetState, { kind: 'person' }>['person']; organizationId?: number; onClose: () => void }) {
  const { data, founder, actions, notify, reload, cfg } = useCrm();
  const edit = !!person;
  const [name, setName] = useState(person?.name ?? '');
  const [org, setOrg] = useState(String(person?.organizationId ?? organizationId ?? ''));
  const [rel, setRel] = useState(person?.relationshipType ?? '');
  const [owner, setOwner] = useState<Owner>(person?.owner ?? founder);
  const [email, setEmail] = useState(person?.email ?? '');
  const [importance, setImportance] = useState(String(person?.importance ?? cfg.defaultImportance));
  const [comfort, setComfort] = useState(person?.comfort ? String(person.comfort) : '');
  const [stage, setStage] = useState<Stage>(person?.stage ?? 'Active');
  const [sensitivity, setSensitivity] = useState<Sensitivity>(person?.sensitivity ?? 'Normal');
  const [agreed, setAgreed] = useState(person?.agreedCheckIn ?? '');
  const [error, setError] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const [dups, setDups] = useState<PersonDuplicate[] | null>(null);
  const [busy, setBusy] = useState(false);
  const independent = data.orgs.find((o) => o.name === 'Independent');
  const orgOptions = data.orgs.filter((o) => o !== independent).sort((a, b) => a.name.localeCompare(b.name)).map((o) => ({ value: o.id, label: o.name }));
  const orgId = org ? Number(org) : independent?.id;
  const live = !edit && name.trim().length > 2 ? findPersonDuplicates({ name, email, organizationId: orgId }, data.people, cfg) : [];

  async function save(allowDuplicate: boolean) {
    setBusy(true); setError(null); setConflict(false);
    try {
      if (edit) {
        await actions.updatePerson(person, { name, organizationId: org ? Number(org) : independent?.id, relationshipType: rel, owner, email: email.trim() || null, importance: Number(importance), comfort: comfort ? Number(comfort) : null, stage, sensitivity, agreedCheckIn: agreed || null });
        notify(end(`${name} saved`));
        onClose();
        return;
      }
      const r = await actions.addPerson({ name, relationshipType: rel, owner, organizationId: org ? Number(org) : undefined, email: email || undefined, importance: Number(importance), comfort: comfort ? Number(comfort) : undefined, stage, sensitivity, agreedCheckIn: agreed || undefined }, { allowDuplicate });
      if (!r.person) { setDups(r.duplicates); return; }
      notify(end(`${r.person.name} added`));
      onClose();
      navigate(`/crm/person/${r.person.id}`);
    } catch (err) { setError(messageOf(err)); setConflict(err instanceof ConflictError); } finally { setBusy(false); }
  }

  if (dups) {
    return (
      <Sheet title="Possible duplicate" onClose={onClose}>
        <div className="space-y-3">
          <p className="text-sm">A record that looks like this person already exists. Nothing has been saved.</p>
          <ul className="space-y-2" aria-label="Existing records">
            {dups.map((d) => <li key={d.id} className="card flex items-center justify-between gap-2"><span><strong>{d.name}</strong>, matched on {d.reason}</span><button type="button" className="btn" data-autofocus onClick={() => { onClose(); navigate(`/crm/person/${d.id}`); }}>Open existing</button></li>)}
          </ul>
          <div className="flex gap-2"><button type="button" className="btn btn-primary" disabled={busy} onClick={() => void save(true)}>Create anyway</button><button type="button" className="btn" onClick={() => setDups(null)}>Back to the form</button></div>
          <ErrorLine error={error} />
        </div>
      </Sheet>
    );
  }
  return (
    <Sheet title={edit ? `Edit ${person.name}` : 'Add person'} onClose={onClose}>
      <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); void save(false); }}>
        <TextField label="Name" value={name} onChange={setName} data-autofocus aria-required="true" autoComplete="off" />
        {live.length > 0 && <p role="status" className="rounded-control bg-amber-50 p-2 text-sm text-amber-900">Possible duplicate: {live.map((d) => `${d.name} (${d.reason})`).join(', ')}.</p>}
        <Pick label="Organization" value={org} blank="Independent (no organization)" options={orgOptions} onChange={setOrg} />
        <Pick label="Relationship type" value={rel} blank="Choose a type" options={RELATIONSHIP_TYPES} onChange={setRel} />
        <Pick label="Owner" value={owner} options={OWNERS} onChange={(v) => setOwner(v as Owner)} />
        <details className="rounded-control border border-hairline p-2" open={edit}>
          <summary className="cursor-pointer text-sm font-medium">More</summary>
          <div className="mt-2 grid grid-cols-2 gap-3">
            <div className="col-span-2"><TextField label="Email" type="email" value={email} onChange={setEmail} autoComplete="off" /></div>
            <Pick label="Importance (1 to 5)" value={importance} options={['1', '2', '3', '4', '5']} onChange={setImportance} />
            <Pick label="Comfort (1 to 5)" value={comfort} blank="Not set" options={['1', '2', '3', '4', '5']} onChange={setComfort} />
            <Pick label="Stage" value={stage} options={STAGES} onChange={(v) => setStage(v as Stage)} />
            <Pick label="Sensitivity" value={sensitivity} options={['Normal', 'Restricted']} onChange={(v) => setSensitivity(v as Sensitivity)} />
            <div className="col-span-2"><TextField label="Agreed check-in date" type="date" value={agreed} onChange={setAgreed} hint="Optional. Keeps the person off the list until this date." /></div>
          </div>
        </details>
        <p className="text-xs text-ink-muted">No amounts, shares or terms are kept in the CRM.</p>
        <ErrorLine error={error} onReload={conflict ? () => { void reload().then(onClose); } : undefined} />
        <div className="flex gap-2"><button className="btn btn-primary" type="submit" disabled={busy}>{edit ? 'Save' : 'Add person'}</button><button className="btn" type="button" onClick={onClose}>Cancel</button></div>
      </form>
    </Sheet>
  );
}

function OrgSheet({ onClose }: { onClose: () => void }) {
  const { data, actions, notify } = useCrm();
  const [name, setName] = useState('');
  const [type, setType] = useState('');
  const [domain, setDomain] = useState('');
  const [error, setError] = useState<string | null>(null);
  const same = domain.trim() ? data.orgs.filter((o) => o.domain && domain.toLowerCase().includes(o.domain)) : [];
  return (
    <Sheet title="Add organization" onClose={onClose}>
      <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); setError(null); actions.addOrganization({ name, orgType: type, domain: domain || undefined }).then((o) => { notify(`${o.name} added.`); onClose(); navigate(`/crm/org/${o.id}`); }, (err) => setError(messageOf(err))); }}>
        <TextField label="Name" value={name} onChange={setName} data-autofocus aria-required="true" autoComplete="off" />
        <Pick label="Type" value={type} blank="Choose a type" options={ORG_TYPES} onChange={setType} />
        <TextField label="Web domain" value={domain} onChange={setDomain} hint="Optional, for example example.com. Used only to suggest duplicates." />
        {same.length > 0 && <p role="status" className="rounded-control bg-amber-50 p-2 text-sm text-amber-900">Same domain as {same.map((o) => orgNameOf(data.orgs, o.id)).join(', ')}. This is only a suggestion.</p>}
        <ErrorLine error={error} />
        <div className="flex gap-2"><button className="btn btn-primary" type="submit">Add organization</button><button className="btn" type="button" onClick={onClose}>Cancel</button></div>
      </form>
    </Sheet>
  );
}

const FIELD_LABEL: Record<MergeField, string> = { name: 'Name', organizationId: 'Organization', relationshipType: 'Relationship type', owner: 'Owner', email: 'Email', importance: 'Importance', comfort: 'Comfort', agreedCheckIn: 'Agreed check-in', stage: 'Stage', sensitivity: 'Sensitivity' };

function MergeSheet({ aId, bId, onClose }: { aId: number; bId: number; onClose: () => void }) {
  const { data, actions, notify, reload } = useCrm();
  const a = data.people.find((p) => p.id === aId), b = data.people.find((p) => p.id === bId);
  const count = (id: number) => data.interactions.filter((i) => i.peopleIds.includes(id)).length;
  const [keepId, setKeepId] = useState(a && b ? (count(b.id) > count(a.id) ? b.id : a.id) : aId);
  const keep = keepId === aId ? a : b, lose = keepId === aId ? b : a;
  const [choices, setChoices] = useState<MergeChoices>(() => (keep && lose ? defaultChoices(keep, lose) : {}));
  const [error, setError] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const [busy, setBusy] = useState(false);
  if (!a || !b || !keep || !lose) return <Sheet title="Merge people" onClose={onClose}><p className="text-sm">One of these people no longer exists. <button className="btn" onClick={() => { void reload().then(onClose); }}>Reload</button></p></Sheet>;
  const show = (p: typeof keep, f: MergeField) => {
    const v = f === 'organizationId' ? orgNameOf(data.orgs, p.organizationId) : p[f];
    return v === undefined || v === null || v === '' ? 'empty' : String(v);
  };
  const pick = (id: number) => { setKeepId(id); const k = id === aId ? a : b, l = id === aId ? b : a; setChoices(defaultChoices(k, l)); };
  const result = mergedPatch(keep, lose, choices);
  async function submit() {
    setBusy(true); setError(null); setConflict(false);
    try { await actions.mergePeople(keep!.id, lose!.id, choices); notify(`Merged ${lose!.name} into ${end(keep!.name)} Undo it from Needs attention.`, undefined, 10_000); onClose(); } catch (err) { setError(messageOf(err)); setConflict(err instanceof ConflictError); } finally { setBusy(false); }
  }
  return (
    <Sheet title="Merge people" onClose={onClose}>
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
        <fieldset className="space-y-2">
          <legend className="mb-1 text-sm font-medium">Keep this record</legend>
          {[a, b].map((p) => (
            <label key={p.id} className="card flex items-start gap-2 text-sm">
              <input type="radio" name="keep" checked={keepId === p.id} onChange={() => pick(p.id)} data-autofocus={p.id === a.id ? true : undefined} />
              <span><strong>{p.name}</strong>, {orgNameOf(data.orgs, p.organizationId)}<br /><span className="text-ink-muted">{plural(count(p.id), 'interaction')}, last contact {p.lastTwoWayAt ?? 'none'}</span></span>
            </label>
          ))}
        </fieldset>
        <p className="text-xs text-ink-muted">Choose, field by field, which value the kept record ends with. Interactions of both records move to it. Sensitivity always ends at the most restrictive.</p>
        {MERGE_FIELDS.map((f) => (
          <fieldset key={f} className="space-y-1" disabled={f === 'sensitivity'}>
            <legend className="text-sm font-medium">{FIELD_LABEL[f]}</legend>
            {(['keep', 'lose'] as const).map((side) => {
              const p = side === 'keep' ? keep : lose;
              return (
                <label key={side} className="flex items-center gap-2 text-sm">
                  <input type="radio" name={`f-${f}`} checked={(choices[f] ?? 'keep') === side} onChange={() => setChoices((c) => ({ ...c, [f]: side }))} />
                  <span><span className="text-ink-muted">{side === 'keep' ? 'Kept record' : 'Other record'}:</span> {show(p, f)}</span>
                </label>
              );
            })}
          </fieldset>
        ))}
        <p className="text-sm" role="status">{Object.keys(result).length ? `The kept record will change: ${Object.keys(result).map((k) => FIELD_LABEL[k as MergeField]).join(', ')}.` : 'The kept record keeps all its values.'}</p>
        <p className="text-xs text-ink-muted">The other record goes to the SharePoint recycle bin. A merge log entry lets you undo this.</p>
        <ErrorLine error={error} onReload={conflict ? () => { void reload().then(onClose); } : undefined} />
        <div className="flex gap-2"><button className="btn btn-primary" type="submit" disabled={busy}>Merge records</button><button className="btn" type="button" onClick={onClose}>Cancel</button></div>
      </form>
    </Sheet>
  );
}

function DeleteSheet({ personId, onClose }: { personId: number; onClose: () => void }) {
  const { data, actions, notify, reload } = useCrm();
  const p = data.people.find((x) => x.id === personId);
  const [error, setError] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const [busy, setBusy] = useState(false);
  if (!p) return <Sheet title="Delete person" onClose={onClose}><p className="text-sm">This person no longer exists.</p></Sheet>;
  const pv = deletionPreview(p.id, data);
  async function submit() {
    setBusy(true); setError(null); setConflict(false);
    try { await actions.deletePerson(p!.id); notify(end(`${p!.name} deleted`)); onClose(); navigate('/crm/people'); } catch (err) { setError(messageOf(err)); setConflict(err instanceof ConflictError); } finally { setBusy(false); }
  }
  return (
    <Sheet title={`Delete ${p.name}`} onClose={onClose}>
      <div className="space-y-3">
        <p className="text-sm">This will delete:</p>
        <ul className="list-disc space-y-1 pl-5 text-sm" aria-label="What will be deleted">
          <li>the person record for {p.name}</li>
          <li>{pv.solo.length} {pv.solo.length === 1 ? 'interaction' : 'interactions'} only involving {p.name}</li>
          <li>{p.name} from {pv.shared.length} shared {pv.shared.length === 1 ? 'interaction' : 'interactions'} (the others stay)</li>
          <li>{pv.mergeLogs.length} merge log {pv.mergeLogs.length === 1 ? 'entry' : 'entries'} for {p.name}</li>
        </ul>
        <p className="text-xs text-ink-muted">Items go to the SharePoint recycle bin. Follow-up tasks in the Tasks list are not deleted. This cannot be undone from the app.</p>
        <ErrorLine error={error} onReload={conflict ? () => { void reload().then(onClose); } : undefined} />
        <div className="flex gap-2"><button className="btn btn-danger" disabled={busy} onClick={() => void submit()} data-autofocus>Delete person</button><button className="btn" onClick={onClose}>Cancel</button></div>
      </div>
    </Sheet>
  );
}
