import { useEffect, type ReactNode } from 'react';
import { useOps } from './ctx';
import { NotificationBell } from './Notifications';
import { useHashRoute } from './router';

const NAV = [['tasks/today', 'Tasks', 'tasks'], ['milestones', 'Milestones', 'milestones'], ['crm/people', 'Relationships', 'crm'], ['triage', 'Triage', 'triage'], ['meetings', 'Meetings', 'meetings'], ['settings', 'Settings', 'settings'], ['admin', 'Admin', 'admin']] as const;

export function Shell({ children }: { children: ReactNode }) {
  const { account, signOut, search, setSearch, quickAdd, founder } = useOps();
  const { segments } = useHashRoute();
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el.closest('input, textarea, select, [contenteditable]') || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === 'n') { e.preventDefault(); quickAdd(); }
      if (e.key === '/') { e.preventDefault(); document.getElementById('global-search')?.focus(); }
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [quickAdd]);
  return (
    <div className="min-h-screen pb-20 sm:pb-0">
      <a href="#main" className="sr-only focus:not-sr-only">Skip to content</a>
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-2 p-3">
          <strong className="mr-2 text-sky-900">BlueHealer Ops</strong>
          <nav aria-label="Main" className="hidden flex-wrap gap-1 sm:flex">
            {NAV.map(([href, label, key]) => <a key={key} href={`#/${href}`} className={`btn ${((segments[0] ?? 'tasks') === key) ? 'btn-primary' : ''}`} aria-current={(segments[0] ?? 'tasks') === key ? 'page' : undefined}>{label}</a>)}
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <label className="sr-only" htmlFor="global-search">Search tasks</label>
            <input id="global-search" className="input hidden w-48 sm:block" placeholder="Search ( / )" value={search} onChange={(e) => { setSearch(e.target.value); if (segments[0] !== 'tasks') location.hash = '#/tasks/list'; }} />
            <button className="btn btn-primary hidden sm:inline-flex" onClick={quickAdd}>Quick add (n)</button>
            <NotificationBell />
            <button className="btn" onClick={signOut} title={account.name}>Sign out ({founder})</button>
          </div>
        </div>
      </header>
      <main id="main" className="mx-auto max-w-6xl p-3">{children}</main>
      <nav aria-label="Mobile" className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-5 border-t border-slate-300 bg-white pb-[env(safe-area-inset-bottom)] sm:hidden">
        <a className="p-3 text-center text-sm" href="#/tasks/today">Today</a>
        <a className="p-3 text-center text-sm" href="#/triage">Triage</a>
        <button className="p-3 text-center text-sm font-semibold text-sky-900" onClick={quickAdd}>Add</button>
        <a className="p-3 text-center text-sm" href="#/crm/people">People</a>
        <a className="p-3 text-center text-sm" href="#/settings">More</a>
      </nav>
    </div>
  );
}
