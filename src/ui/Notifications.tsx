import { useState } from 'react';
import { useOps } from './ctx';
import { useNow, useReminderLog, useTaskActions, useTasks, type TaskItem } from './data';
import { etToday, inQuietHours } from '../domain/time';
import { applyLog, generateReminders, snoozeOptions, type Reminder } from '../reminders/rules';

/** Computed from list data; no notification content is stored anywhere but the ReminderLog for snoozes. */
export function useReminders(): Reminder[] {
  const { founder } = useOps();
  const now = useNow();
  const tasks = useTasks();
  const log = useReminderLog();
  const today = etToday(now);
  return applyLog(generateReminders({ tasks: tasks.data ?? [] }, today, founder), log.data ?? [], 'app', now);
}

export function NotificationBell() {
  const { openTask } = useOps();
  const now = useNow();
  const today = etToday(now);
  const reminders = useReminders();
  const tasks = useTasks();
  const actions = useTaskActions();
  const [open, setOpen] = useState(false);
  const quiet = inQuietHours(now); // quiet hours hide the badge, not the list
  return (
    <div className="relative">
      <button className="btn" aria-expanded={open} aria-controls="notif-panel" onClick={() => setOpen(!open)}>
        Alerts{!quiet && reminders.length > 0 && <span aria-label={`${reminders.length} reminders`} className="ml-2 rounded-full bg-red-700 px-2 text-xs text-white">{reminders.length}</span>}
      </button>
      {open && (
        <div id="notif-panel" role="region" aria-label="Notifications" className="absolute right-0 z-30 mt-2 max-h-[70vh] w-[min(92vw,26rem)] overflow-y-auto rounded-lg border border-slate-300 bg-white p-3 shadow-xl">
          {reminders.length === 0 ? <p className="p-2 text-sm">No reminders right now.</p> : (
            <ul className="space-y-2">
              {reminders.map((r) => {
                const task = r.list === 'Tasks' ? (tasks.data?.find((t) => t.id === r.recordId) as TaskItem | undefined) : undefined;
                return (
                  <li key={r.id} className="card p-2 text-sm">
                    <button className="text-left font-medium underline" onClick={() => { if (r.list === 'Tasks') openTask(r.recordId); setOpen(false); }}>{r.title}</button>
                    <div className="text-slate-700">{r.detail}</div>
                    <div className="mt-2 flex flex-wrap gap-1">
                      {Object.entries(snoozeOptions(now, today)).map(([label, until]) => (
                        <button key={label} className="btn !min-h-8 !px-2 !py-1 text-xs" onClick={() => actions.snooze.mutate({ list: r.list, recordId: r.recordId, trigger: r.trigger, until })}>Snooze: {label}</button>
                      ))}
                      {task && <button className="btn !min-h-8 !px-2 !py-1 text-xs" onClick={() => actions.complete.mutate({ task })}>Mark done</button>}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
