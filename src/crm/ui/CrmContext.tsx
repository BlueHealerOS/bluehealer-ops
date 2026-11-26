import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { etToday } from '../../domain/time.ts';
import cfgJson from '../../../config/crm-ranking.json';
import { parseRankingConfig } from '../model/config.ts';
import type { RankingConfig } from '../model/types.ts';
import { GraphRepo } from '../graph/graphRepo.ts';
import type { CrmRepo } from '../graph/repo.ts';
import { CrmService } from '../service.ts';
import { useOps } from '../../ui/ctx';
import { useNow } from '../../ui/data';
import { Ctx, type CrmActions, type CrmCtx, type SheetState, type Toast } from './crmCtx';
import type { CrmData } from '../service.ts';
import { Sheets } from './Sheets';

export const CRM_CONFIG: RankingConfig = parseRankingConfig(cfgJson);
type Person = CrmData['people'][number];

type Boot = { kind: 'deciding' } | { kind: 'ready'; repo: CrmRepo; now: () => Date; fixture: boolean };

/** Fixture mode exists only in dev and e2e builds: the condition is a build-time constant, so production bundles drop the import. */
async function pickRepo(graph: CrmRepo): Promise<Extract<Boot, { kind: 'ready' }>> {
  if ((import.meta.env.DEV || import.meta.env.MODE === 'e2e') && new URLSearchParams(location.search).get('fixture') === 'crm') {
    const f = await import('./fixtureMode.ts');
    return { kind: 'ready', repo: f.createFixtureRepo(), now: () => f.FIXTURE_NOW, fixture: true };
  }
  return { kind: 'ready', repo: graph, now: () => new Date(), fixture: false };
}

/** Loads the CRM once per visit and keeps it in memory only. Nothing is written to browser storage. */
export function CrmProvider({ children }: { children: ReactNode }) {
  const { store, founder } = useOps();
  const tick = useNow();
  const [boot, setBoot] = useState<Boot>({ kind: 'deciding' });
  const [data, setData] = useState<CrmData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [sheet, setSheet] = useState<SheetState | null>(null);
  const dataRef = useRef<CrmData | null>(null);
  dataRef.current = data;
  const seq = useRef(0);

  useEffect(() => { let live = true; void pickRepo(new GraphRepo(store)).then((b) => { if (live) setBoot(b); }); return () => { live = false; }; }, [store]);

  const service = useMemo(() => (boot.kind === 'ready' ? new CrmService(boot.repo, CRM_CONFIG, boot.now) : null), [boot]);
  const reload = useCallback(async () => {
    if (!service) return;
    setError(null);
    try { setData(await service.load()); } catch (e) { setError((e as Error).message); }
  }, [service]);
  useEffect(() => { void reload(); }, [reload]);

  const notify = useCallback((text: string, action?: Toast['action'], ms = 6000) => {
    const id = ++seq.current;
    setToasts((t) => [...t, { id, text, action, ms }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), ms);
  }, []);

  const actions = useMemo<CrmActions | null>(() => {
    if (!service) return null;
    const cur = () => dataRef.current!;
    const putPerson = (p: Person) => setData((d) => d && { ...d, people: d.people.some((x) => x.id === p.id) ? d.people.map((x) => (x.id === p.id ? p : x)) : [...d.people, p] });
    const a: CrmActions = {
      async logContact(i) {
        const r = await service.logContact(i, cur());
        setData((d) => d && { ...d, people: d.people.map((p) => r.people.find((u) => u.id === p.id) ?? p), interactions: [...d.interactions, r.interaction] });
        return r;
      },
      async addPerson(i, opts) {
        const r = await service.addPerson(i, cur(), opts);
        if (r.person) {
          putPerson(r.person);
          if (!cur().orgs.some((o) => o.id === r.person!.organizationId)) await reload(); // Independent was just created
        }
        return r;
      },
      async updatePerson(p, patch) { const u = await service.updatePerson(p, patch); putPerson(u); return u; },
      async snooze(p, date) { const u = await service.snooze(p, date); putPerson(u); return u; },
      async setStage(p, stage) { const u = await service.setStage(p, stage); putPerson(u); return u; },
      async mute(p) {
        const { person, previousStage } = await service.mute(p);
        putPerson(person);
        notify(`${p.name} muted.`, { label: 'Undo', run: () => { void a.setStage(person, previousStage).catch((e: Error) => notify(e.message)); } }, 10_000);
      },
      async addOrganization(i) { const o = await service.addOrganization(i); setData((d) => d && { ...d, orgs: [...d.orgs, o] }); return o; },
      async recompute() { const r = await service.recompute(cur()); await reload(); return r; },
      async mergePeople(keepId, loseId, choices) { await service.mergePeople(keepId, loseId, choices, cur(), founder); await reload(); },
      async undoMerge(logId) { await service.undoMerge(logId, cur()); await reload(); },
      async deletePerson(personId) { const r = await service.deletePerson(personId, cur()); await reload(); return r; },
    };
    return a;
  }, [service, reload, notify, founder]);

  const today = boot.kind === 'ready' && boot.fixture ? etToday(boot.now()) : etToday(tick);
  const value = useMemo<CrmCtx | null>(() => (data && actions && boot.kind === 'ready'
    ? { data, cfg: CRM_CONFIG, today, founder, fixture: boot.fixture, actions, reload, notify, openSheet: setSheet }
    : null), [data, actions, boot, today, founder, reload, notify]);

  if (error) return <div role="alert" className="card space-y-2"><p className="text-danger">The CRM could not be loaded. {error}</p><button className="btn" onClick={() => void reload()}>Try again</button></div>;
  if (!value) return <p role="status" className="p-4 text-sm text-ink-muted">Loading the CRM…</p>;
  return (
    <Ctx.Provider value={value}>
      {value.fixture && <p className="mb-3 rounded-control bg-primary-soft/30 p-2 text-sm" role="note">Fixture mode: invented data held in memory, with the date fixed at {today}. Nothing is read from or written to SharePoint.</p>}
      {children}
      <Sheets state={sheet} onClose={() => setSheet(null)} />
      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-[4.5rem] z-50 flex flex-col items-center gap-2 px-4 md:bottom-4">
        {toasts.map((t) => (
          <p key={t.id} className="pointer-events-auto flex items-center gap-3 rounded-control bg-ink px-4 py-2 text-sm text-white shadow-lg">
            {t.text}
            {t.action && <button className="rounded-control px-2 py-1 font-semibold underline" onClick={() => { t.action!.run(); setToasts((x) => x.filter((y) => y.id !== t.id)); }}>{t.action.label}</button>}
          </p>
        ))}
      </div>
    </Ctx.Provider>
  );
}
