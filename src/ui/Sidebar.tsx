import { useOps } from './ctx';
import { useQuery } from '@tanstack/react-query';
import { useNow, useSettings, useTasks, type TaskItem } from './data';
import { DEFAULT_VIEWS } from '../domain/filters';
import { doneThisWeek, hygiene, proposeToday, proposed, thisWeek, waitingOnOthers } from '../domain/tasks';
import { etToday } from '../domain/time';
import type { IntakeItem } from '../domain/types';
import { Icon } from './icons';
import { CRM_SECTIONS, ENGINEERING_SECTIONS, QUEUES, SECTIONS, TRIAGE_OPEN_FILTER, sidebarWorkspace } from './nav';
import { useHashRoute } from './router';
import { TOPBAR_H } from './TopBar';
import { useEngineering } from '../engineering/session';

/** Saved views that duplicate a queue are listed once, as queues. */
const QUEUE_PATHS = new Set(QUEUES.map((q) => `/tasks/${q[0]}`));
const SAVED = DEFAULT_VIEWS.filter((v) => !QUEUE_PATHS.has(v.path));

export function useNavCounts() {
  const { founder } = useOps();
  const today = etToday(useNow());
  const { settings } = useSettings();
  const tasks = useTasks().data ?? [];
  // Own cache key: the Triage page reads Intake fresh and must not inherit this count's cache.
  const { store } = useOps();
  const intake = useQuery({ queryKey: ['nav', 'triage-count'], staleTime: 15_000, queryFn: () => store.items<IntakeItem>('Intake', { filter: TRIAGE_OPEN_FILTER }) }).data ?? [];
  const mine = tasks.filter((t) => t.Owner === founder || t.Owner === 'Both');
  const h = hygiene(tasks, today, (t) => (t as TaskItem)._created?.slice(0, 10));
  const attention = h.unlinkedStrategic.length + h.staleInbox.length + h.undatedNext.length;
  const todayAll = proposeToday(mine, today, 999).length;
  return {
    counts: {
      today: Math.min(todayAll, settings.todayCap), week: thisWeek(tasks, today).length, waiting: waitingOnOthers(tasks).length,
      proposed: proposed(tasks).length, done: doneThisWeek(tasks, today).length, hygiene: attention, triage: intake.length,
    } as Record<string, number>,
    /** Orange dot: the Today list is over its cap, or something needs attention. */
    signal: { today: todayAll > settings.todayCap, hygiene: attention > 0 } as Record<string, boolean>,
  };
}

const SH = 'px-3 pb-1 !font-sans text-xs !font-semibold uppercase tracking-wider text-ink-muted';

function TasksSections() {
  const { segments, query } = useHashRoute();
  const { counts, signal } = useNavCounts();
  const page = segments[0] ?? 'tasks';
  const view = segments[1] ?? 'today';
  const current = `/${segments.join('/')}${query ? `?${query}` : ''}`;
  const Count = ({ k }: { k: string }) => (
    <span className="nav-count">{counts[k] ?? 0}{signal[k] && <span className="nav-dot" role="img" aria-label="needs attention" />}</span>
  );
  return (
    <>
      <div>
        <h2 className={SH}>Tasks</h2>
        <ul className="space-y-0.5">
          {QUEUES.map(([key, label, icon]) => (
            <li key={key}>
              <a className="nav-link" href={`#/tasks/${key}`} aria-current={page === 'tasks' && view === key && !query ? 'page' : undefined}>
                <Icon name={icon} />{label}<Count k={key} />
              </a>
            </li>
          ))}
        </ul>
      </div>
      <ul className="space-y-0.5">
        {SECTIONS.map(([href, label, key, icon]) => (
          <li key={key}>
            <a className="nav-link" href={`#/${href}`} aria-current={page === 'tasks' && view === key ? 'page' : undefined}>
              <Icon name={icon} />{label}{key === 'triage' && <Count k="triage" />}
            </a>
          </li>
        ))}
      </ul>
      <div>
        <h2 className={SH}>Saved views</h2>
        <ul className="space-y-0.5">
          {SAVED.map((v) => (
            <li key={v.name}>
              <a className="nav-link" href={`#${v.path}`} aria-current={current === v.path ? 'page' : undefined}><Icon name="view" />{v.name}</a>
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}

function CrmSections() {
  const { segments } = useHashRoute();
  const tab = segments[1] === 'person' ? 'people' : segments[1] === 'org' ? 'organizations' : segments[1] ?? 'today';
  return (
    <div>
      <h2 className={SH}>CRM</h2>
      <ul className="space-y-0.5">
        {CRM_SECTIONS.map(([k, label, icon]) => (
          <li key={k}><a className="nav-link" href={`#/crm/${k}`} aria-current={segments[0] === 'crm' && tab === k ? 'page' : undefined}><Icon name={icon} />{label}</a></li>
        ))}
      </ul>
    </div>
  );
}

function EngineeringSections() {
  const { segments } = useHashRoute();
  const section = segments[1] ?? 'review';
  const eng = useEngineering();
  return (
    <div>
      <h2 className={SH}>Engineering</h2>
      <ul className="space-y-0.5">
        {ENGINEERING_SECTIONS.map(([k, label, icon]) => (
          <li key={k}><a className="nav-link" href={`#/engineering/${k}`} aria-current={segments[0] === 'engineering' && section === k ? 'page' : undefined}><Icon name={icon} />{label}</a></li>
        ))}
      </ul>
      {eng.bundle && (
        <p className="mt-3 px-3 text-xs text-ink-muted">
          Bundle: <span className="font-medium text-ink">{eng.bundle.manifest.bundle_id}</span>
          {eng.bundle.reviews.length > 0 && <><br />{eng.bundle.reviews.filter((r) => r.status !== 'resolved' && r.status !== 'wont_fix').length} active review items</>}
        </p>
      )}
    </div>
  );
}

export function Sidebar() {
  const { segments } = useHashRoute();
  const ws = sidebarWorkspace(segments);
  const page = segments[0] ?? 'tasks';
  return (
    <aside style={{ top: TOPBAR_H, height: `calc(100vh - ${TOPBAR_H}px)` }} className="sticky hidden w-60 shrink-0 flex-col gap-1 overflow-y-auto border-r border-hairline bg-surface p-3 md:flex">
      <nav aria-label="Main" className="flex flex-1 flex-col gap-4">
        {ws === 'tasks' && <TasksSections />}
        {ws === 'crm' && <CrmSections />}
        {ws === 'engineering' && <EngineeringSections />}
        <ul className="mt-auto">
          <li>
            <a className="nav-link" href="#/settings" aria-current={page === 'settings' || page === 'admin' ? 'page' : undefined}><Icon name="settings" />Settings</a>
          </li>
        </ul>
      </nav>
    </aside>
  );
}
