import { useOps } from './ctx';
import { AvatarMenu } from './AvatarMenu';
import { Icon } from './icons';
import { NotificationBell } from './Notifications';
import { useHashRoute } from './router';
import marque from '../assets/brand/marque.svg';

export function Header() {
  const { search, setSearch, quickAdd } = useOps();
  const { segments } = useHashRoute();
  return (
    <header className="sticky top-0 z-20 border-b border-hairline bg-surface pt-[env(safe-area-inset-top)]">
      <div className="flex flex-nowrap items-center gap-2 px-3 py-2 md:px-6">
        <a href="#/tasks/today" className="shrink-0 md:hidden" aria-label="BlueHealer Ops, go to Today"><img src={marque} alt="" className="h-8 w-8" /></a>
        <div className="relative min-w-0 flex-1 md:max-w-md">
          <label className="sr-only" htmlFor="global-search">Search tasks</label>
          <Icon name="search" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" />
          <input id="global-search" className="input !pl-9" placeholder="Search tasks" value={search}
            onChange={(e) => { setSearch(e.target.value); if (segments[0] !== 'tasks') location.hash = '#/tasks/list'; }} />
          <kbd className="kbd pointer-events-none absolute right-3 top-1/2 hidden -translate-y-1/2 md:block" aria-hidden="true">/</kbd>
        </div>
        <div className="ml-auto flex shrink-0 items-center gap-2">
          <button className="btn btn-primary hidden whitespace-nowrap md:inline-flex" onClick={quickAdd} aria-keyshortcuts="n">
            <Icon name="add" className="h-4 w-4" />Quick add <kbd className="kbd !border-white/40 !bg-transparent !text-white" aria-hidden="true">n</kbd>
          </button>
          <NotificationBell />
          <div className="hidden md:block"><AvatarMenu /></div>
        </div>
      </div>
    </header>
  );
}
