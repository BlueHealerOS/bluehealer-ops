import { useCallback, useEffect, useMemo, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createAuth } from './auth';
import type { Account, AuthAdapter } from './auth/types';
import { GraphClient } from './graph/client';
import { OpsStore } from './graph/store';
import { config } from './config';
import { OpsContext } from './ui/ctx';
import { AccessDenied, SignIn } from './ui/SignIn';
import { Shell } from './ui/Shell';
import { TasksPage } from './ui/TasksPage';
import { SettingsPage } from './ui/SettingsPage';
import { AdminPage } from './ui/AdminPage';
import { MilestonesPage } from './ui/MilestonesPage';
import { CrmWorkspace } from './crm/ui/CrmWorkspace';
import { TriagePage } from './ui/TriagePage';
import { MeetingsPage } from './ui/MeetingsPage';
import { TaskDrawer } from './ui/TaskDrawer';
import { EngineeringProvider } from './engineering/session';
import { EngineeringPage } from './engineering/EngineeringPage';
import { QuickAdd } from './ui/QuickAdd';
import { useHashRoute } from './ui/router';
import { clearCache, clearIfSignedOut, indexedDbCacheStore } from './data/cache';
import type { Founder } from './domain/types';

type Phase = { kind: 'loading' } | { kind: 'signedOut' } | { kind: 'checking' } | { kind: 'denied' } | { kind: 'error'; message: string } | { kind: 'ready' };

const readFounder = (): Founder | null => { try { const v = localStorage.getItem('ops-founder'); return v === 'Santiago' || v === 'Jay' ? v : null; } catch { return null; } };

export default function App() {
  const [auth, setAuth] = useState<AuthAdapter>();
  const [account, setAccount] = useState<Account | null>(null);
  const [phase, setPhase] = useState<Phase>({ kind: 'loading' });
  const [queryClient] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: true, staleTime: 15_000 } } }));

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const a = await createAuth();
        const acc = await a.init();
        if (!live) return;
        setAuth(a); setAccount(acc);
        setPhase(acc ? { kind: 'checking' } : { kind: 'signedOut' });
        // Nobody is signed in: anything the browser cache still holds from an earlier session is removed (docs/PLAN-v2.md section 5.2).
        await clearIfSignedOut(indexedDbCacheStore(), acc !== null);
      } catch (e) { if (live) setPhase({ kind: 'error', message: (e as Error).message }); }
    })();
    return () => { live = false; };
  }, []);

  const store = useMemo(() => (auth && account ? new OpsStore(new GraphClient({ getToken: (s) => auth.getToken(s) }), config) : null), [auth, account]);

  useEffect(() => {
    if (!store || phase.kind !== 'checking') return;
    store.probe().then((r) => setPhase(r === 'ok' ? { kind: 'ready' } : { kind: 'denied' })).catch((e: Error) => setPhase({ kind: 'error', message: e.message }));
  }, [store, phase.kind]);

  const signOut = useCallback(async () => { queryClient.clear(); await clearCache(indexedDbCacheStore()); await auth?.signOut(); }, [auth, queryClient]);

  // Until a founder has signed in and SharePoint has accepted the account, nothing but the sign-in screen exists.
  if (phase.kind === 'loading') return <main className="p-6" role="status">Loading…</main>;
  if (phase.kind === 'signedOut' || !auth || !account || !store) return <SignIn onSignIn={() => void auth?.signIn()} />;
  if (phase.kind === 'denied') return <AccessDenied onSignOut={() => void signOut()} />;
  if (phase.kind === 'error') return <main className="p-6"><p role="alert">Something went wrong: {phase.message}</p><button className="btn mt-2" onClick={() => void signOut()}>Sign out</button></main>;
  if (phase.kind === 'checking') return <main className="p-6" role="status">Checking access…</main>;
  return (
    <QueryClientProvider client={queryClient}>
      <Authed store={store} account={account} signOut={signOut} />
    </QueryClientProvider>
  );
}

function Authed({ store, account, signOut }: { store: OpsStore; account: Account; signOut: () => Promise<void> }) {
  const [founder, setFounderState] = useState<Founder | null>(readFounder);
  const [search, setSearch] = useState('');
  const [adding, setAdding] = useState(false);
  const [open, setOpen] = useState<number | 'new' | null>(null);
  const { segments } = useHashRoute();
  const setFounder = (f: Founder) => { try { localStorage.setItem('ops-founder', f); } catch { /* storage unavailable */ } setFounderState(f); };

  if (!founder) {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4 p-6 text-center">
        <h1 className="text-[1.75rem]">Who is signed in?</h1>
        <p className="text-sm text-ink-muted">Please choose your name. It is remembered on this device only.</p>
        <div className="flex gap-2">{(['Santiago', 'Jay'] as const).map((f) => <button key={f} className="btn btn-primary" onClick={() => setFounder(f)}>{f}</button>)}</div>
      </main>
    );
  }
  const page = segments[0] ?? 'tasks';
  const view = segments[1];
  return (
    <OpsContext.Provider value={{ store, account, founder, setFounder, signOut: () => void signOut(), search, setSearch, quickAdd: () => setAdding(true), openTask: setOpen }}>
      <EngineeringProvider active={page === 'engineering'}>
        <Shell>
          {page === 'settings' ? <SettingsPage /> : page === 'admin' ? <AdminPage /> : page === 'engineering' ? <EngineeringPage /> : page === 'crm' ? <CrmWorkspace />
            : page === 'tasks' && view === 'milestones' ? <MilestonesPage /> : page === 'tasks' && view === 'triage' ? <TriagePage /> : page === 'tasks' && view === 'meetings' ? <MeetingsPage /> : <TasksPage />}
        </Shell>
      </EngineeringProvider>
      {adding && <QuickAdd onClose={() => setAdding(false)} />}
      {open !== null && <TaskDrawer id={open} onClose={() => setOpen(null)} />}
    </OpsContext.Provider>
  );
}
