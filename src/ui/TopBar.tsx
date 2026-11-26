import { useOps } from './ctx';
import { AvatarMenu } from './AvatarMenu';
import { Icon } from './icons';
import { MenuButton } from './MenuButton';
import { NotificationBell } from './Notifications';
import { MORE_ITEMS, WORKSPACES, activeWorkspace } from './nav';
import { useHashRoute } from './router';
import lockup from '../assets/brand/lockup-dark.svg';
import marque from '../assets/brand/marque.svg';

export const TOPBAR_H = 57;

const tabClass = 'relative inline-flex min-h-10 items-center rounded-control px-3 text-sm font-medium text-ink-muted hover:bg-primary-soft/20 hover:text-ink aria-[current=page]:bg-primary-soft/35 aria-[current=page]:text-primary-strong';

export function TopBar() {
  const { search, setSearch, quickAdd } = useOps();
  const { segments } = useHashRoute();
  const ws = activeWorkspace(segments);
  return (
    <header className="sticky top-0 z-20 border-b border-hairline bg-surface pt-[env(safe-area-inset-top)]">
      <div className="flex flex-nowrap items-center gap-2 px-3 py-2 md:px-6">
        <a href="#/tasks/today" className="hidden shrink-0 rounded-control px-1 md:block" aria-label="BlueHealer Ops, go to Today"><img src={lockup} alt="BlueHealer" className="h-7 w-auto" /></a>
        <a href="#/tasks/today" className="shrink-0 md:hidden" aria-label="BlueHealer Ops, go to Today"><img src={marque} alt="" className="h-8 w-8" /></a>
        <nav aria-label="Workspaces" className="hidden items-center gap-1 md:ml-3 md:flex">
          {WORKSPACES.map(([key, label, href]) => <a key={key} href={href} className={tabClass} aria-current={ws === key ? 'page' : undefined}>{label}</a>)}
          <MenuButton label="More" items={MORE_ITEMS} className={`${tabClass} gap-1`}>More<Icon name="more" className="h-4 w-4" /></MenuButton>
        </nav>
        <div className="relative min-w-0 flex-1 md:ml-3 md:max-w-xs">
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
