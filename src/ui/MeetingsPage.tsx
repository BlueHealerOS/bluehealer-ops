import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useOps } from './ctx';
import { useItems, useNow, useTasks, useWrite } from './data';
import type { MeetingRec } from '../domain/types';
import { SCOPES } from '../graph/client';
import { addDays, etToday } from '../domain/time';
import { Empty, Loading } from './parts';

interface CalEvent { id: string; subject: string; start: { dateTime: string } }

export function meetingKind(subject: string): string {
  const s = subject.toLowerCase();
  if (s.includes('check-in') || s.includes('checkin')) return 'Monday check-in';
  if (s.includes('vendor')) return 'Wednesday vendor review';
  if (s.includes('checkout') || s.includes('check-out')) return 'Friday checkout';
  return 'ad hoc';
}

export function MeetingsPage() {
  const { store, founder } = useOps();
  const w = useWrite();
  const today = etToday(useNow());
  const tasks = useTasks();
  const meetings = useItems<MeetingRec>('Meetings');
  const [err, setErr] = useState<string>();
  const [open, setOpen] = useState<number | null>(null);
  const events = useQuery({
    queryKey: ['calendar', today],
    retry: false,
    queryFn: async () => (await store.client.request<{ value: CalEvent[] }>('GET', `/me/calendarView?startDateTime=${today}T00:00:00&endDateTime=${addDays(today, 14)}T23:59:59&$select=id,subject,start&$orderby=start/dateTime&$top=50`, { scopes: SCOPES.calendar, headers: { Prefer: 'outlook.timezone="America/New_York"' } })).value,
  });
  const known = new Set((meetings.data ?? []).map((m) => m.CalendarEventId));

  const agendaFor = () => {
    const ts = tasks.data ?? [];
    const open = ts.filter((t) => t.Status !== 'Done' && t.Status !== 'Dropped');
    return {
      flagged: open.filter((t) => t.Agenda).map((t) => ({ id: t.id, title: t.Title })),
      overdue: open.filter((t) => t.DueDate && t.DueDate < today).map((t) => ({ id: t.id, title: t.Title })),
      decisions: open.filter((t) => (t.Labels ?? '').toLowerCase().split(';').map((x) => x.trim()).includes('decision')).map((t) => ({ id: t.id, title: t.Title })),
    };
  };
  async function create(title: string, kind: string, start: string, eventId?: string) {
    setErr(undefined);
    try { await w.create('Meetings', { Title: title, MeetingKind: kind, Start: start.length === 10 ? `${start}T12:00:00Z` : start, CalendarEventId: eventId, AgendaJson: JSON.stringify(agendaFor()), Owner: 'Both', Source: 'meeting' }); }
    catch (e) { setErr((e as Error).message); }
  }
  void founder;
  return (
    <section aria-labelledby="mt-h" className="space-y-4">
      <h1 id="mt-h" className="text-xl font-semibold">Meetings</h1>
      <div className="card space-y-2">
        <h2 className="font-semibold">From your Outlook calendar (next 14 days)</h2>
        {events.isLoading && <Loading what="calendar" />}
        {events.error && <p role="alert" className="text-sm text-amber-900">The calendar could not be read. {(events.error as Error).message}</p>}
        {events.data?.length === 0 && <Empty>No events in the next 14 days.</Empty>}
        <ul className="space-y-1">
          {(events.data ?? []).map((e) => (
            <li key={e.id} className="flex items-center justify-between gap-2 text-sm">
              <span>{e.start.dateTime.slice(0, 10)} · {e.subject} <span className="chip">{meetingKind(e.subject)}</span></span>
              <button className="btn" disabled={known.has(e.id)} onClick={() => void create(e.subject, meetingKind(e.subject), e.start.dateTime.slice(0, 16), e.id)}>{known.has(e.id) ? 'Agenda created' : 'Create agenda'}</button>
            </li>
          ))}
        </ul>
        <button className="btn" onClick={() => void create('Ad hoc meeting', 'ad hoc', today)}>New ad hoc meeting</button>
        {err && <p role="alert" className="text-sm text-red-800">{err}</p>}
      </div>
      <ul className="space-y-3" aria-label="Meeting records">
        {[...(meetings.data ?? [])].sort((a, b) => (b.Start ?? '').localeCompare(a.Start ?? '')).map((m) => <MeetingCard key={m.id} m={m} open={open === m.id} toggle={() => setOpen(open === m.id ? null : m.id)} refreshAgenda={() => w.update('Meetings', m.id, { AgendaJson: JSON.stringify(agendaFor()) })} />)}
      </ul>
    </section>
  );
}

function MeetingCard({ m, open, toggle, refreshAgenda }: { m: MeetingRec; open: boolean; toggle: () => void; refreshAgenda: () => Promise<void> }) {
  const { founder } = useOps();
  const w = useWrite();
  const [actions, setActions] = useState('');
  const [note, setNote] = useState(m.NoteLink ?? '');
  const [msg, setMsg] = useState<string>();
  const agenda = (() => { try { return JSON.parse(m.AgendaJson ?? '{}') as Record<string, { id: number; title: string }[]>; } catch { return {}; } })();
  async function makeTasks() {
    const lines = actions.split('\n').map((l) => l.trim()).filter(Boolean);
    try {
      for (const l of lines) await w.create('Tasks', { Title: l, Status: 'Inbox', Source: 'meeting', Owner: founder, MeetingId: m.id });
      await w.update('Meetings', m.id, { ActionsCreated: true, ...(note ? { NoteLink: note } : {}) });
      setActions(''); setMsg(`${lines.length} task(s) created in Inbox.`);
    } catch (e) { setMsg((e as Error).message); }
  }
  return (
    <li className="card">
      <button className="w-full text-left" aria-expanded={open} onClick={toggle}><span className="font-medium">{m.Title}</span> <span className="chip">{m.MeetingKind}</span> {m.Start && <span className="text-xs text-slate-700">{m.Start.slice(0, 10)}</span>}</button>
      {open && (
        <div className="mt-3 space-y-3">
          {(['flagged', 'overdue', 'decisions'] as const).map((k) => (
            <div key={k}><h3 className="text-sm font-semibold">{{ flagged: 'Flagged for agenda', overdue: 'Overdue items', decisions: 'Decisions needed' }[k]}</h3>
              {(agenda[k] ?? []).length ? <ul className="list-disc pl-5 text-sm">{agenda[k]!.map((t) => <li key={t.id}>{t.title}</li>)}</ul> : <p className="text-sm text-slate-700">None.</p>}</div>
          ))}
          <button className="btn" onClick={() => void refreshAgenda()}>Refresh agenda</button>
          <div><label className="mb-1 block text-sm font-medium" htmlFor={`a-${m.id}`}>Action items (one per line)</label><textarea id={`a-${m.id}`} className="input" rows={3} value={actions} onChange={(e) => setActions(e.target.value)} /></div>
          <div><label className="mb-1 block text-sm font-medium" htmlFor={`n-${m.id}`}>Link to the Granola or hub note</label><input id={`n-${m.id}`} className="input" value={note} onChange={(e) => setNote(e.target.value)} /></div>
          {msg && <p role="status" className="text-sm">{msg}</p>}
          <button className="btn btn-primary" onClick={() => void makeTasks()} disabled={!actions.trim()}>Create tasks from actions</button>
        </div>
      )}
    </li>
  );
}
