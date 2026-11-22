import { useMemo, useState } from 'react';
import { useOps } from './ctx';
import { useNow, useSettings, useTaskActions, useTasks, type TaskItem } from './data';
import { applyFacets, DUE_WINDOWS, facetsFromQuery, facetsToQuery, type FacetKey, type FacetState } from '../domain/filters';
import { doneThisWeek, hygiene, proposeToday, proposed, thisWeek, waitingOnOthers } from '../domain/tasks';
import { addDays, etToday, weekdayOf } from '../domain/time';
import * as C from '../schema/choices';
import { navigate, useHashRoute } from './router';
import { Empty, Loading } from './parts';

export const TASK_VIEWS = [
  ['today', 'Today'], ['week', 'This week'], ['board', 'Board'], ['list', 'List'], ['calendar', 'Calendar'],
  ['waiting', 'Waiting on others'], ['proposed', 'Proposed'], ['done', 'Done this week'], ['hygiene', 'Hygiene'],
] as const;

const FACETS: { key: FacetKey; label: string; options: readonly string[] }[] = [
  { key: 'owner', label: 'Owner', options: C.OWNERS }, { key: 'status', label: 'Status', options: C.TASK_STATUS },
  { key: 'priority', label: 'Priority', options: C.PRIORITY }, { key: 'contribution', label: 'Contribution', options: C.CONTRIBUTION },
  { key: 'track', label: 'Track', options: C.TRACKS }, { key: 'source', label: 'Source', options: C.SOURCES },
  { key: 'context', label: 'Context', options: C.CONTEXT }, { key: 'effort', label: 'Effort', options: C.EFFORT },
  { key: 'sensitivity', label: 'Sensitivity', options: C.SENSITIVITY }, { key: 'due', label: 'Due window', options: DUE_WINDOWS },
];

export function TasksPage() {
  const { segments, query } = useHashRoute();
  const view = segments[1] ?? 'today';
  const { founder, search } = useOps();
  const now = useNow();
  const today = etToday(now);
  const tasksQ = useTasks();
  const { settings } = useSettings();
  const facets = facetsFromQuery(query);
  const [everyone, setEveryone] = useState(false);

  const all = tasksQ.data ?? [];
  const matchSearch = (t: TaskItem) => !search || `${t.Title} ${t.Description ?? ''}`.toLowerCase().includes(search.toLowerCase());
  const mine = (t: TaskItem) => everyone || t.Owner === founder || t.Owner === 'Both';

  const rows = useMemo(() => {
    const f = (ts: TaskItem[]) => applyFacets(ts, facets, today).filter(matchSearch);
    switch (view) {
      case 'today': return proposeToday(all.filter(mine), today, settings.todayCap) as TaskItem[];
      case 'week': return f(thisWeek(all, today) as TaskItem[]);
      case 'waiting': return f(waitingOnOthers(all) as TaskItem[]);
      case 'proposed': return f(proposed(all) as TaskItem[]);
      case 'done': return f(doneThisWeek(all, today) as TaskItem[]);
      default: return f(all.filter((t) => t.Status !== 'Done' && t.Status !== 'Dropped'));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [all, view, query, today, search, settings.todayCap, founder, everyone]);

  const setFacet = (k: FacetKey, vals: string[]) => {
    const next: FacetState = { ...facets, [k]: vals };
    const q = facetsToQuery(next);
    navigate(`/tasks/${view}${q ? `?${q}` : ''}`);
  };

  return (
    <section aria-labelledby="tasks-h">
      <h1 id="tasks-h" className="sr-only">Tasks</h1>
      <nav aria-label="Task views" className="-mx-1 mb-3 flex gap-1 overflow-x-auto px-1 pb-1">
        {TASK_VIEWS.map(([k, label]) => (
          <a key={k} href={`#/tasks/${k}`} aria-current={view === k ? 'page' : undefined} className={`btn whitespace-nowrap ${view === k ? 'btn-primary' : ''}`}>{label}</a>
        ))}
      </nav>
      {['week', 'list', 'board', 'waiting', 'proposed', 'done'].includes(view) && <FacetBar facets={facets} setFacet={setFacet} />}
      {view === 'today' && (
        <div className="mb-3 flex items-center justify-between text-sm">
          <p>Capped at {settings.todayCap} tasks. Pinned tasks come first, then priority and due date.</p>
          <label className="flex items-center gap-2"><input type="checkbox" checked={everyone} onChange={(e) => setEveryone(e.target.checked)} /> Show everyone</label>
        </div>
      )}
      {tasksQ.isLoading && <Loading what="tasks" />}
      {tasksQ.error && <p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-800">Tasks could not be loaded. {(tasksQ.error as Error).message}</p>}
      {!tasksQ.isLoading && !tasksQ.error && (
        view === 'board' ? <Board tasks={rows} /> :
        view === 'calendar' ? <Calendar tasks={rows} today={today} /> :
        view === 'hygiene' ? <Hygiene tasks={all} today={today} /> :
        <TaskList tasks={rows} today={today} proposedView={view === 'proposed'} empty={view === 'today' ? 'Nothing is queued for today. Pull tasks into This week to plan.' : 'No tasks here.'} />
      )}
    </section>
  );
}

function FacetBar({ facets, setFacet }: { facets: FacetState; setFacet: (k: FacetKey, v: string[]) => void }) {
  const active = Object.values(facets).flat().length;
  return (
    <details className="card mb-3" open={active > 0}>
      <summary className="cursor-pointer text-sm font-medium">Filters{active ? ` (${active} selected)` : ''}</summary>
      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {FACETS.map((f) => (
          <fieldset key={f.key}>
            <legend className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-700">{f.label}</legend>
            <div className="flex flex-wrap gap-1">
              {f.options.map((o) => {
                const on = facets[f.key]?.includes(o) ?? false;
                return (
                  <label key={o} className={`chip cursor-pointer gap-1 ${on ? 'bg-sky-800 text-white' : ''}`}>
                    <input type="checkbox" className="sr-only" checked={on} onChange={() => setFacet(f.key, on ? (facets[f.key] ?? []).filter((x) => x !== o) : [...(facets[f.key] ?? []), o])} />
                    {o}
                  </label>
                );
              })}
            </div>
          </fieldset>
        ))}
      </div>
    </details>
  );
}

function Chips({ t, today }: { t: TaskItem; today: string }) {
  const overdue = t.DueDate !== undefined && t.DueDate < today && t.Status !== 'Done';
  return (
    <div className="mt-1 flex flex-wrap gap-1 text-xs">
      <span className="chip">{t.Status}</span>
      {t.Priority && <span className="chip">{t.Priority}</span>}
      {t.Owner && <span className="chip">{t.Owner}</span>}
      {t.DueDate && <span className={`chip ${overdue ? 'bg-red-100 text-red-900' : ''}`}>{overdue ? 'Overdue ' : 'Due '}{t.DueDate}</span>}
      {t.Status === 'Waiting' && t.WaitingOn && <span className="chip">Waiting on {t.WaitingOn}</span>}
      {t.Sensitivity === 'restricted' && <span className="chip bg-amber-100 text-amber-900">Restricted</span>}
    </div>
  );
}

function TaskList({ tasks, today, empty, proposedView }: { tasks: TaskItem[]; today: string; empty: string; proposedView?: boolean }) {
  const { openTask } = useOps();
  const actions = useTaskActions();
  if (!tasks.length) return <Empty>{empty}</Empty>;
  return (
    <ul className="space-y-2" aria-label="Tasks">
      {tasks.map((t) => (
        <li key={t.id} className="card flex items-start gap-3">
          {t.Status !== 'Done' && !proposedView && (
            <input type="checkbox" aria-label={`Mark "${t.Title}" done`} className="mt-1 h-5 w-5" onChange={() => actions.complete.mutate({ task: t })} />
          )}
          <button className="min-w-0 flex-1 text-left" onClick={() => openTask(t.id)}>
            <span className="block truncate font-medium">{t.Title}</span>
            <Chips t={t} today={today} />
          </button>
          {proposedView && (
            <div className="flex gap-1">
              <button className="btn btn-primary" onClick={() => actions.save.mutate({ id: t.id, before: t, fields: { Status: 'Inbox' } })}>Accept</button>
              <button className="btn" onClick={() => openTask(t.id)}>Edit</button>
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}

const BOARD_COLS = ['Inbox', 'Next', 'In progress', 'Waiting', 'Done'] as const;
function Board({ tasks }: { tasks: TaskItem[] }) {
  const { openTask } = useOps();
  const actions = useTaskActions();
  return (
    <div className="grid gap-3 md:grid-cols-5" role="list" aria-label="Board">
      {BOARD_COLS.map((col) => (
        <section key={col} role="listitem" aria-label={col} className="rounded-lg bg-slate-100 p-2">
          <h2 className="mb-2 text-sm font-semibold">{col}</h2>
          <ul className="space-y-2">
            {tasks.filter((t) => t.Status === col).map((t) => (
              <li key={t.id} className="card p-2">
                <button className="w-full text-left text-sm font-medium" onClick={() => openTask(t.id)}>{t.Title}</button>
                <label className="mt-1 block text-xs">
                  <span className="sr-only">Move {t.Title} to</span>
                  <select className="input mt-1 !min-h-8 !py-1 text-xs" value={t.Status} onChange={(e) => actions.save.mutate({ id: t.id, before: t, fields: { Status: e.target.value as TaskItem['Status'] } }, { onError: (err) => alert((err as Error).message) })}>
                    {C.TASK_STATUS.map((s) => <option key={s}>{s}</option>)}
                  </select>
                </label>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function Calendar({ tasks, today }: { tasks: TaskItem[]; today: string }) {
  const { openTask } = useOps();
  const [offset, setOffset] = useState(0);
  const base = new Date(Date.UTC(Number(today.slice(0, 4)), Number(today.slice(5, 7)) - 1 + offset, 1));
  const y = base.getUTCFullYear(), m = base.getUTCMonth();
  const first = `${y}-${String(m + 1).padStart(2, '0')}-01`;
  const lead = (weekdayOf(first) + 6) % 7; // Monday-first
  const days = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  const cells = Array.from({ length: lead + days }, (_, i) => (i < lead ? null : addDays(first, i - lead)));
  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <button className="btn" onClick={() => setOffset(offset - 1)}>Previous</button>
        <h2 className="font-semibold">{base.toLocaleString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })}</h2>
        <button className="btn" onClick={() => setOffset(offset + 1)}>Next</button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-xs" role="grid" aria-label="Calendar of due dates">
        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => <div key={d} role="columnheader" className="p-1 font-semibold">{d}</div>)}
        {cells.map((d, i) => (
          <div key={i} role="gridcell" className={`min-h-16 rounded border p-1 ${d === today ? 'border-sky-700 bg-sky-50' : 'border-slate-200 bg-white'}`}>
            {d && <div className="text-slate-600">{Number(d.slice(8))}</div>}
            {d && tasks.filter((t) => t.DueDate === d).map((t) => <button key={t.id} className="mt-0.5 block w-full truncate rounded bg-slate-100 px-1 text-left" onClick={() => openTask(t.id)}>{t.Title}</button>)}
          </div>
        ))}
      </div>
    </div>
  );
}

function Hygiene({ tasks, today }: { tasks: TaskItem[]; today: string }) {
  const { openTask } = useOps();
  const h = hygiene(tasks, today, (t) => (t as TaskItem)._created?.slice(0, 10));
  const groups: [string, TaskItem[]][] = [
    ['Strategic tasks without a link', h.unlinkedStrategic as TaskItem[]],
    ['Inbox items older than 3 days', h.staleInbox as TaskItem[]],
    ['Next tasks without dates older than 14 days', h.undatedNext as TaskItem[]],
  ];
  return (
    <div className="space-y-4">
      {groups.map(([title, ts]) => (
        <section key={title} aria-label={title}>
          <h2 className="mb-1 font-semibold">{title} ({ts.length})</h2>
          {ts.length ? <ul className="space-y-1">{ts.map((t) => <li key={t.id}><button className="underline" onClick={() => openTask(t.id)}>{t.Title}</button></li>)}</ul> : <p className="text-sm text-slate-700">All clear.</p>}
        </section>
      ))}
    </div>
  );
}
