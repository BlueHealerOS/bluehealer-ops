import { useOps } from './ctx';
import { Icon } from './icons';
import { MenuButton } from './MenuButton';
import { MORE_ITEMS, activeWorkspace } from './nav';
import { useHashRoute } from './router';

const cell = 'relative flex min-h-14 flex-col items-center justify-center gap-0.5 text-xs font-medium text-ink-muted aria-[current=page]:text-primary-strong aria-[current=page]:before:absolute aria-[current=page]:before:inset-x-5 aria-[current=page]:before:top-0 aria-[current=page]:before:h-0.5 aria-[current=page]:before:rounded-full aria-[current=page]:before:bg-primary';

export function TabBar() {
  const { quickAdd } = useOps();
  const { segments } = useHashRoute();
  const ws = activeWorkspace(segments);
  const link = (key: string, href: string, label: string, icon: string) => (
    <a key={key} href={href} aria-current={ws === key ? 'page' : undefined} className={cell}><Icon name={icon} />{label}</a>
  );
  return (
    <nav aria-label="Mobile" className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-5 border-t border-hairline bg-surface pb-[env(safe-area-inset-bottom)] md:hidden">
      {link('tasks', '#/tasks/today', 'Tasks', 'today')}
      {link('engineering', '#/engineering/review', 'Engineering', 'view')}
      <button key="add" className="flex flex-col items-center justify-center gap-0.5 py-1.5 text-xs font-semibold text-primary-strong" onClick={quickAdd}>
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-white"><Icon name="add" /></span>Add
      </button>
      {link('crm', '#/crm/people', 'CRM', 'people')}
      <MenuButton label="More" items={MORE_ITEMS} up className={`${cell} w-full`}><Icon name="more" />More</MenuButton>
    </nav>
  );
}
