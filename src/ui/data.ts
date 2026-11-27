import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useOps } from './ctx';
import type { Decoded } from '../graph/codec';
import type { Task } from '../domain/types';
import { addDays, etToday, mondayOf } from '../domain/time';
import { validateTransition } from '../domain/tasks';
import { closeTask } from '../domain/closeTask';
import type { LogEntry } from '../reminders/rules';

export type TaskItem = Decoded<Task>;
const FIVE_MIN = 5 * 60 * 1000;

/** Re-render each minute so "today" and quiet hours stay current while the app is open. */
export function useNow(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);
  return now;
}

export function useTasks() {
  const { store } = useOps();
  const today = etToday(useNow());
  return useQuery({
    queryKey: ['tasks', today],
    refetchInterval: FIVE_MIN,
    refetchIntervalInBackground: false,
    queryFn: async () => {
      const [open, done] = await Promise.all([
        store.items<Task>('Tasks', { filter: "fields/Status ne 'Done' and fields/Status ne 'Dropped'" }),
        store.items<Task>('Tasks', { filter: `fields/CompletedAt ge '${mondayOf(today)}T00:00:00Z'` }),
      ]);
      const byId = new Map<number, TaskItem>();
      for (const t of [...open, ...done]) byId.set(t.id, t);
      return [...byId.values()];
    },
  });
}

/** Titles of a lookup target list, for link pickers. */
export function useLookup(list: 'Milestones' | 'KeyResults' | 'Applications' | 'People') {
  const { store } = useOps();
  return useQuery({ queryKey: ['lookup', list], staleTime: 60_000, queryFn: () => store.items<{ Title: string }>(list) });
}

export interface Settings { todayCap: number; sendInternalDigests: boolean }
const DEFAULTS: Settings = { todayCap: 7, sendInternalDigests: false };

export function useSettings() {
  const { store } = useOps();
  const q = useQuery({ queryKey: ['settings'], queryFn: () => store.items<{ Key?: string; ValueJson?: string }>('Settings') });
  const raw = new Map((q.data ?? []).map((i) => [i.Key, i]));
  const read = <K extends keyof Settings>(k: K): Settings[K] => {
    try { const v = raw.get(k)?.ValueJson; return v === undefined ? DEFAULTS[k] : (JSON.parse(v) as Settings[K]); } catch { return DEFAULTS[k]; }
  };
  return { settings: { todayCap: read('todayCap'), sendInternalDigests: read('sendInternalDigests') } as Settings, loading: q.isLoading, raw };
}

export function useSaveSetting() {
  const { store } = useOps();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (a: { key: keyof Settings; value: unknown; existingId?: number }) => {
      const fields = { Title: a.key, Key: a.key, ValueJson: JSON.stringify(a.value), Scope: 'global' };
      if (a.existingId) await store.update('Settings', a.existingId, fields);
      else await store.create('Settings', fields);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['settings'] }),
  });
}

export function useReminderLog() {
  const { store, founder } = useOps();
  const today = etToday(useNow());
  return useQuery({
    queryKey: ['reminderlog', today, founder],
    refetchInterval: FIVE_MIN,
    queryFn: async () => {
      const rows = await store.items<{ RecordKey?: string; Trigger?: string; Day?: string; Channel?: 'app' | 'digest'; SnoozedUntil?: string; Founder?: string }>('ReminderLog', { filter: `fields/Day ge '${today}T00:00:00Z'` });
      return rows.filter((r) => r.Founder === founder && r.Day === today).map((r): LogEntry => ({ RecordKey: r.RecordKey ?? '', Trigger: r.Trigger ?? '', Day: r.Day ?? today, Channel: r.Channel ?? 'app', SnoozedUntil: r.SnoozedUntil }));
    },
  });
}

export function useTaskActions() {
  const { store, founder } = useOps();
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: ['tasks'] });
  const now = () => new Date();
  return {
    save: useMutation({
      mutationFn: async (a: { id: number | null; before?: Task; fields: Partial<Task> }) => {
        if (a.id === null) {
          await store.create('Tasks', { Source: 'manual', Owner: founder, Status: 'Inbox', ...a.fields });
        } else {
          // Only a founder closes a card, and only through `complete` below (closeTask records who).
          if (a.fields.Status === 'Done' && a.before?.Status !== 'Done') throw new Error('Only a founder can mark a card done. Please use Mark done.');
          if (a.fields.Status && a.before && a.fields.Status !== a.before.Status) {
            const v = validateTransition({ ...a.before, ...a.fields, Status: a.before.Status } as Task, a.fields.Status);
            if (!v.ok) throw new Error(v.reason);
          }
          await store.update('Tasks', a.id, a.fields);
        }
      },
      onSuccess: refresh,
    }),
    complete: useMutation({
      mutationFn: async (a: { task: Task & { id: number }; outcome?: string }) => {
        const c = closeTask(a.task, founder, etToday(now()), now().toISOString(), a.outcome);
        // ClosedBy exists only after provisioning has run (docs/PLAN-v2.md section 6); until then closing works as before.
        const update = { ...c.update };
        if (!(await store.hasColumn('Tasks', 'ClosedBy'))) delete update.ClosedBy;
        await store.update('Tasks', a.task.id, update);
        if (c.next) await store.create('Tasks', c.next);
      },
      onSuccess: refresh,
    }),
    snooze: useMutation({
      mutationFn: async (a: { list: string; recordId: number; trigger: string; until: string }) => {
        await store.create('ReminderLog', { Title: `${a.list}:${a.recordId}`, RecordKey: `${a.list}:${a.recordId}`, Trigger: a.trigger, Day: etToday(now()), Channel: 'app', SnoozedUntil: a.until, Founder: founder });
      },
      onSuccess: () => qc.invalidateQueries({ queryKey: ['reminderlog'] }),
    }),
  };
}

export const weekEnd = (today: string) => addDays(mondayOf(today), 6);

/** Generic list reader for the smaller lists (they stay far under the view threshold). */
export function useItems<T>(list: string, filter?: string, enabled = true) {
  const { store } = useOps();
  return useQuery({ queryKey: ['items', list, filter ?? ''], enabled, staleTime: 15_000, queryFn: () => store.items<T>(list, { filter }) });
}

export function useWrite() {
  const { store } = useOps();
  const qc = useQueryClient();
  const refresh = () => Promise.all([qc.invalidateQueries({ queryKey: ['items'] }), qc.invalidateQueries({ queryKey: ['tasks'] }), qc.invalidateQueries({ queryKey: ['lookup'] }), qc.invalidateQueries({ queryKey: ['nav'] })]);
  return {
    create: async <T,>(list: string, fields: Record<string, unknown>) => { const r = await store.create<T>(list, fields); await refresh(); return r; },
    update: async (list: string, id: number, fields: Record<string, unknown>) => { await store.update(list, id, fields); await refresh(); },
  };
}

/** Open tasks plus done tasks, so milestone progress is complete. */
export function useAllTasksForProgress() {
  const open = useTasks();
  const done = useItems<Task>('Tasks', "fields/Status eq 'Done'");
  const byId = new Map<number, TaskItem>();
  for (const t of [...(open.data ?? []), ...(done.data ?? [])]) byId.set(t.id, t);
  return { tasks: [...byId.values()], loading: open.isLoading || done.isLoading };
}
