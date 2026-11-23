import { useOps } from './ctx';
import { Icon } from './icons';
import { useHashRoute } from './router';

const TABS = [
  ['#/tasks/today', 'Today', 'today', (s: string[]) => (s[0] ?? 'tasks') === 'tasks'],
  ['#/triage', 'Triage', 'triage', (s: string[]) => s[0] === 'triage'],
  null,
  ['#/crm/people', 'People', 'people', (s: string[]) => s[0] === 'crm'],
  ['#/settings', 'More', 'more', (s: string[]) => ['settings', 'admin', 'milestones', 'meetings'].includes(s[0] ?? '')],
] as const;

export function TabBar() {
  const { quickAdd } = useOps();
  const { segments } = useHashRoute();
  return (
    <nav aria-label="Mobile" className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-5 border-t border-hairline bg-surface pb-[env(safe-area-inset-bottom)] md:hidden">
      {TABS.map((t, i) => t === null ? (
        <button key="add" className="flex flex-col items-center justify-center gap-0.5 py-1.5 text-xs font-semibold text-primary-strong" onClick={quickAdd}>
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-white"><Icon name="add" /></span>Add
        </button>
      ) : (
        <a key={i} href={t[0]} aria-current={t[3](segments) ? 'page' : undefined}
          className="relative flex min-h-14 flex-col items-center justify-center gap-0.5 text-xs font-medium text-ink-muted aria-[current=page]:text-primary-strong aria-[current=page]:before:absolute aria-[current=page]:before:inset-x-5 aria-[current=page]:before:top-0 aria-[current=page]:before:h-0.5 aria-[current=page]:before:rounded-full aria-[current=page]:before:bg-primary">
          <Icon name={t[2]} />{t[1]}
        </a>
      ))}
    </nav>
  );
}
