import type { Task } from '../domain/types';

/** Queues are filtered work lists (sidebar). Layouts are ways to see all open tasks (segmented control). */
export const QUEUES = [
  ['today', 'Today', 'today'], ['week', 'This week', 'week'], ['waiting', 'Waiting on others', 'waiting'],
  ['proposed', 'Suggested', 'suggested'], ['done', 'Done this week', 'done'], ['hygiene', 'Needs attention', 'attention'],
] as const;
export type QueueKey = (typeof QUEUES)[number][0];

export const LAYOUTS = [['list', 'List', 'list'], ['board', 'Board', 'board'], ['calendar', 'Calendar', 'calendar']] as const;

/** Sections of the Tasks workspace beyond the queues. Routes live under #/tasks/. */
export const SECTIONS = [
  ['tasks/milestones', 'Milestones', 'milestones', 'milestones'],
  ['tasks/triage', 'Triage', 'triage', 'triage'],
  ['tasks/meetings', 'Meetings', 'meetings', 'meetings'],
] as const;

export type Workspace = 'tasks' | 'engineering' | 'crm';
export const WORKSPACES: readonly (readonly [Workspace, string, string])[] = [
  ['tasks', 'Tasks', '#/tasks/today'],
  ['engineering', 'Engineering', '#/engineering/review'],
  ['crm', 'CRM', '#/crm/today'],
];
/** The More menu: sections that are not workspaces of their own. */
export const MORE_ITEMS = [
  ['#/tasks/milestones', 'Milestones'],
  ['#/tasks/triage', 'Triage'],
  ['#/tasks/meetings', 'Meetings'],
  ['#/settings', 'Settings'],
] as const;
export const ENGINEERING_SECTIONS = [['review', 'Review', 'view'], ['graph', 'Trace graph', 'board']] as const;
/** CRM sections (sidebar on desktop, a row of links on a phone). */
export const CRM_SECTIONS = [['today', 'Today', 'today'], ['people', 'People', 'people'], ['organizations', 'Organizations', 'building'], ['attention', 'Needs attention', 'attention'], ['export', 'Export', 'list']] as const;

/** Workspace whose tab is highlighted. Settings and Admin belong to none. */
export const activeWorkspace = (segments: string[]): Workspace | null => {
  const a = segments[0] ?? 'tasks';
  if (a === 'engineering' || a === 'crm') return a;
  return a === 'tasks' ? 'tasks' : null;
};
/** Workspace whose sections the sidebar shows. */
export const sidebarWorkspace = (segments: string[]): Workspace => activeWorkspace(segments) ?? 'tasks';

export const queueLabel = (key: string) => QUEUES.find((q) => q[0] === key)?.[1];

/** Display labels for stored values. Stored data keeps its original value; only the UI wording changes. */
export const statusLabel = (s: string | undefined) => (s === 'Proposed' ? 'Suggested' : s ?? '');
export const triageStateLabel = (s: string | undefined) => (s === 'Proposed' ? 'Suggested' : s ?? '');

export const TRIAGE_OPEN_FILTER = "fields/TriageState ne 'Accepted' and fields/TriageState ne 'Rejected' and fields/TriageState ne 'Converted'";

export type TaskLike = Task;
