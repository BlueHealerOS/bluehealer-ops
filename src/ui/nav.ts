import type { Task } from '../domain/types';

/** Queues are filtered work lists (sidebar). Layouts are ways to see all open tasks (segmented control). */
export const QUEUES = [
  ['today', 'Today', 'today'], ['week', 'This week', 'week'], ['waiting', 'Waiting on others', 'waiting'],
  ['proposed', 'Suggested', 'suggested'], ['done', 'Done this week', 'done'], ['hygiene', 'Needs attention', 'attention'],
] as const;
export type QueueKey = (typeof QUEUES)[number][0];

export const LAYOUTS = [['list', 'List', 'list'], ['board', 'Board', 'board'], ['calendar', 'Calendar', 'calendar']] as const;

export const SECTIONS = [
  ['milestones', 'Milestones', 'milestones', 'milestones'],
  ['crm/people', 'Relationships', 'crm', 'people'],
  ['triage', 'Triage', 'triage', 'triage'],
  ['meetings', 'Meetings', 'meetings', 'meetings'],
] as const;

export const queueLabel = (key: string) => QUEUES.find((q) => q[0] === key)?.[1];

/** Display labels for stored values. Stored data keeps its original value; only the UI wording changes. */
export const statusLabel = (s: string | undefined) => (s === 'Proposed' ? 'Suggested' : s ?? '');
export const triageStateLabel = (s: string | undefined) => (s === 'Proposed' ? 'Suggested' : s ?? '');

export const TRIAGE_OPEN_FILTER = "fields/TriageState ne 'Accepted' and fields/TriageState ne 'Rejected' and fields/TriageState ne 'Converted'";

export type TaskLike = Task;
