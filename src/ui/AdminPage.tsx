import { useState } from 'react';
import { useOps } from './ctx';
import { LISTS, schemaHash, validateSchema } from '../schema/lists';
import { applyProvision, planProvision, type ProvisionPlan } from '../provision/provision';

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
      <h1 id="adm-h" className="text-xl font-semibold">Admin: lists</h1>
      <p className="text-sm">Creates or updates the SharePoint lists and columns from the schema in this app (version {schemaHash(LISTS)}). It never deletes or renames anything, and running it again changes nothing. Review the dry run first.</p>
      {problems.length > 0 && <p role="alert" className="text-red-800">Schema problems: {problems.join('; ')}</p>}
      <div className="flex gap-2">
        <button className="btn btn-primary" disabled={busy} onClick={() => run(async () => { setLog([]); setPlan(await planProvision(store.client, await store.siteId(), LISTS)); })}>Dry run</button>
        <button className="btn" disabled={busy || !plan || plan.changes === 0} onClick={() => run(async () => {
          const out: string[] = [];
          await applyProvision(store.client, plan!, (m) => { out.push(m); setLog([...out]); });
          store.invalidate();
          setPlan(await planProvision(store.client, plan!.siteId, LISTS));
        })}>Apply {plan ? `(${plan.changes} changes)` : ''}</button>
      </div>
      {error && <p role="alert" className="rounded-md bg-red-50 p-2 text-sm text-red-800">{error}</p>}
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
      <div className="card space-y-2 text-sm">
        <h2 className="font-semibold">Version history checklist (manual)</h2>
        <p>Microsoft Graph cannot change versioning. After provisioning, open each list in Microsoft Lists, choose List settings, then Versioning settings, and confirm that item version history is on. The record history tab depends on it.</p>
      </div>
    </section>
  );
}
