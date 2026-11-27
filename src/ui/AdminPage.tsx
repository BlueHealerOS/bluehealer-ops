import { useState } from 'react';
import { useOps } from './ctx';
import { LISTS, schemaHash, validateSchema } from '../schema/lists';
import { applyProvision, planProvision, type ProvisionPlan } from '../provision/provision';
import { applyMigrationV2, prepareMigrationV2, restoreMigrationV2, type PreparedMigration } from '../provision/migrateV2';
import { parseRollbackReport } from '../domain/migrateV2';
import { parseHubExport, planHubImport, planCuratedImport, planTrelloImport, seedMilestones } from './importRunner';

export function AdminPage() {
  const { store } = useOps();
  const [plan, setPlan] = useState<ProvisionPlan>();
  const [log, setLog] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const problems = validateSchema(LISTS);

  async function run(fn: () => Promise<void>) {
    setBusy(true); setError(undefined);
    try { await fn(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  return (
    <section className="max-w-3xl space-y-4" aria-labelledby="adm-h">
      <a href="#/settings" className="text-sm text-primary-strong underline">Back to settings</a>
      <h1 id="adm-h" className="text-[1.75rem] md:text-display">Lists and imports</h1>
      <p className="text-sm">Creates or updates the SharePoint lists and columns from the schema in this app (version {schemaHash(LISTS)}). It never deletes or renames anything, and running it again changes nothing. Review the dry run first.</p>
      {problems.length > 0 && <p role="alert" className="text-danger">Schema problems: {problems.join('; ')}</p>}
      <div className="flex gap-2">
        <button className="btn btn-primary" disabled={busy} onClick={() => run(async () => { setLog([]); setPlan(await planProvision(store.client, await store.siteId(), LISTS)); })}>Dry run</button>
        <button className="btn" disabled={busy || !plan || plan.changes === 0} onClick={() => run(async () => {
          const out: string[] = [];
          await applyProvision(store.client, plan!, (m) => { out.push(m); setLog([...out]); });
          store.invalidate();
          setPlan(await planProvision(store.client, plan!.siteId, LISTS));
        })}>Apply {plan ? `(${plan.changes} changes)` : ''}</button>
      </div>
      {error && <p role="alert" className="rounded-md bg-danger-soft p-2 text-sm text-danger">{error}</p>}
      {plan && (
        <div className="card text-sm" aria-label="Dry run result">
          {plan.changes === 0 ? <p>Everything is up to date.</p> : (
            <ul className="list-disc pl-5">
              {plan.lists.filter((l) => l.create || l.missingColumns.length || l.missingChoices.length).map((l) => (
                <li key={l.list.name}>{l.create ? `Create list ${l.list.name} with ${l.list.columns.length} columns` : `${l.list.name}: add ${l.missingColumns.length} column(s), ${l.missingChoices.length} choice update(s)`}</li>
              ))}
            </ul>
          )}
        </div>
      )}
      {log.length > 0 && <pre className="card overflow-x-auto text-xs" aria-label="Provisioning log">{log.join('\n')}</pre>}
      <MigrationPanel />
      <ImportPanel />
      <div className="card space-y-2 text-sm">
        <h2 className="font-semibold">Version history checklist (manual)</h2>
        <p>Microsoft Graph cannot change versioning. After provisioning, open each list in Microsoft Lists, choose List settings, then Versioning settings, and confirm that item version history is on. The record history tab depends on it.</p>
      </div>
    </section>
  );
}

function downloadText(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Moves cards to the v2 board statuses. Dry run, then a downloaded report, then apply (docs/PLAN-v2.md section 6.2). */
function MigrationPanel() {
  const { store } = useOps();
  const [prepared, setPrepared] = useState<PreparedMigration>();
  const [downloaded, setDownloaded] = useState(false);
  const [msg, setMsg] = useState<string>();
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  async function guarded(fn: () => Promise<void>) { setBusy(true); setMsg(undefined); setError(undefined); try { await fn(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); } }
  const rows = prepared?.plan.rows.length ?? 0;
  return (
    <div className="card space-y-3 text-sm" aria-label="Move cards to the new board">
      <h2 className="font-semibold">Move cards to the new board</h2>
      <p>Moves Inbox cards to Backlog and Next cards to This week or Backlog, orders every column, and keeps each card's time of last edit. Please apply the lists above first. Download the report before you apply: it lets you put the previous statuses back. Done and Dropped cards are not touched.</p>
      <div className="flex flex-wrap items-center gap-2">
        <button className="btn btn-primary" disabled={busy} onClick={() => guarded(async () => { setDownloaded(false); setPrepared(await prepareMigrationV2(store)); })}>Dry run</button>
        <button className="btn" disabled={busy || !prepared || rows === 0} onClick={() => { downloadText(`ops-v2-migration-report-${prepared!.rollback.createdAt.slice(0, 10)}.json`, JSON.stringify(prepared!.rollback, null, 2)); setDownloaded(true); }}>Download report</button>
        <button className="btn" disabled={busy || !prepared || rows === 0 || !downloaded} onClick={() => guarded(async () => { setMsg(await applyMigrationV2(store, prepared!.plan, new Date(), (m) => setMsg(m))); setPrepared(undefined); setDownloaded(false); })}>Apply {rows ? `(${rows} cards)` : ''}</button>
      </div>
      {prepared && (
        <div className="rounded-md border border-hairline p-3" role="region" aria-label="Migration dry run">
          <ul className="list-disc pl-5">{Object.entries(prepared.plan.report).map(([k, v]) => <li key={k}>{k}: {v}</li>)}</ul>
          {rows === 0 && <p className="mt-2">Nothing to move. Every card is already on the new board.</p>}
          {rows > 0 && !downloaded && <p className="mt-2">Please download the report to enable Apply.</p>}
        </div>
      )}
      <div>
        <label htmlFor="restore-file" className="mb-1 block font-medium">Restore previous statuses from a report (JSON)</label>
        <input id="restore-file" type="file" accept="application/json,.json" className="input max-w-md" disabled={busy}
          onChange={(e) => guarded(async () => { const f = e.target.files?.[0]; if (!f) throw new Error('Please choose a file.'); setMsg(await restoreMigrationV2(store, parseRollbackReport(await f.text()), (m) => setMsg(m))); e.target.value = ''; })} />
      </div>
      {error && <p role="alert" className="rounded-md bg-danger-soft p-2 text-danger">{error}</p>}
      {msg && <p role="status">{msg}</p>}
    </div>
  );
}

type Pending = { title: string; report: Record<string, number>; run: (p?: (m: string) => void) => Promise<string> };

function ImportPanel() {
  const { store } = useOps();
  const [pending, setPending] = useState<Pending>();
  const [msg, setMsg] = useState<string>();
  const [busy, setBusy] = useState(false);
  async function guarded(fn: () => Promise<void>) { setBusy(true); setMsg(undefined); try { await fn(); } catch (e) { setMsg((e as Error).message); } finally { setBusy(false); } }
  const readFile = (f: File | undefined) => f ? f.text() : Promise.reject(new Error('Please choose a file.'));
  return (
    <div className="card space-y-3 text-sm" aria-label="Seed and imports">
      <h2 className="font-semibold">Seed and one-time imports</h2>
      <p>Files are read in this browser and written only to your SharePoint lists. Each import shows a dry run first. Imports create new records and fill blank fields only; they never overwrite what you have edited.</p>
      <div className="flex flex-wrap items-center gap-2">
        <button className="btn" disabled={busy} onClick={() => guarded(async () => setMsg(`Seeded ${await seedMilestones(store)} draft milestone(s) for confirmation.`))}>Seed end-of-February milestones</button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div><label htmlFor="hub-file" className="mb-1 block font-medium">Hub export (People and Companies, JSON)</label>
          <input id="hub-file" type="file" accept="application/json,.json" className="input" disabled={busy} onChange={(e) => guarded(async () => { const p = await planHubImport(store, parseHubExport(await readFile(e.target.files?.[0]))); setPending({ title: 'Hub import dry run', report: p.report as unknown as Record<string, number>, run: p.run }); })} /></div>
        <div><label htmlFor="trello-file" className="mb-1 block font-medium">Trello board export (JSON)</label>
          <input id="trello-file" type="file" accept="application/json,.json" className="input" disabled={busy} onChange={(e) => guarded(async () => { const p = await planTrelloImport(store, JSON.parse(await readFile(e.target.files?.[0]))); setPending({ title: 'Trello import dry run', report: p.report, run: p.run }); })} /></div>
        <div><label htmlFor="curated-file" className="mb-1 block font-medium">Curated Trello dataset (JSON, records and events)</label>
          <input id="curated-file" type="file" accept="application/json,.json" className="input" disabled={busy} onChange={(e) => guarded(async () => { const p = await planCuratedImport(store, JSON.parse(await readFile(e.target.files?.[0]))); setPending({ title: 'Curated import dry run', report: p.report, run: p.run }); })} /></div>
      </div>
      {pending && (
        <div className="rounded-md border border-hairline p-3" role="region" aria-label={pending.title}>
          <h3 className="font-semibold">{pending.title}</h3>
          <ul className="mt-1 list-disc pl-5">{Object.entries(pending.report).map(([k, v]) => <li key={k}>{k}: {v}</li>)}</ul>
          <div className="mt-2 flex gap-2"><button className="btn btn-primary" disabled={busy} onClick={() => guarded(async () => { setMsg(await pending.run((m) => setMsg(m))); setPending(undefined); })}>Import now</button><button className="btn" onClick={() => setPending(undefined)}>Cancel</button></div>
        </div>
      )}
      {msg && <p role="status">{msg}</p>}
    </div>
  );
}
