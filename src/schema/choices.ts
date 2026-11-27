// Fixed choice sets shared by the schema, the UI and the rules. Editable facets live in Settings.
export const OWNERS = ['Santiago', 'Jay', 'Both', 'Unassigned'] as const;
export const SENSITIVITY = ['normal', 'restricted'] as const;
export const SOURCES = ['manual', 'intake', 'meeting', 'email', 'agent', 'Trello import'] as const;
// Hub knowledge/ track folders (handoffs excluded).
export const TRACKS = [
  'Business Strategy',
  'Clinical and Customer Evidence',
  'Communication',
  'Competitions and Grants',
  'Corporate and Legal',
  'Intellectual Property',
  'Operations',
  'Pitch and Investors',
  'Regulatory and Quality',
  'Reimbursement',
  'Research and Development',
  'Technical Development',
] as const;
// v2 board columns are Backlog, This week, In progress, Waiting and Done. Inbox and Next are kept so existing records stay valid until the migration has run.
export const TASK_STATUS = ['Proposed', 'Inbox', 'Next', 'Backlog', 'This week', 'In progress', 'Waiting', 'Done', 'Dropped'] as const;
export const TASK_KIND = ['Task', 'Decision'] as const;
/** Only a founder closes a card, so `ClosedBy` holds a founder name, not a person column. */
export const CLOSED_BY = ['Santiago', 'Jay'] as const;
export const REQUEST_TYPE = ['Problem', 'Change', 'Idea'] as const;
export const PRIORITY = ['P0', 'P1', 'P2', 'P3'] as const;
export const CONTRIBUTION = ['Milestone', 'Key result', 'Application', 'Fundraising follow-up', 'Relationship', 'Operations'] as const;
export const CONTEXT = ['deep work', 'call', 'email', 'lab or bench', 'vendor', 'errand', 'review or approval'] as const;
export const EFFORT = ['15 min', '1 hour', 'half day', 'multi-day'] as const;
export const MILESTONE_STATUS = ['not started', 'on track', 'at risk', 'late', 'done'] as const;
export const APPROVAL_GATE = ['none', 'Jay', 'Santiago', 'Both'] as const;
export const ORG_TYPES = ['hospital system', 'payer', 'surgeon practice', 'industry', 'vendor', 'investor', 'accelerator or grantor', 'counsel', 'consultant', 'academic', 'competitor'] as const;
export const RELATIONSHIP_TYPES = ['customer discovery', 'clinical advisor', 'KOL', 'payer', 'hospital', 'vendor', 'investor', 'counsel', 'consultant', 'partner'] as const;
export const INTRO_CHANNELS = ['warm-intro', 'event', 'inbound', 'cold', 'mutual-network'] as const;
export const TIERS = ['A', 'B', 'C'] as const;
export const INVESTOR_STAGES = ['Identified', 'Contacted', 'Meeting held', 'Following up', 'Committed', 'Closed', 'Passed', 'Paused'] as const;
export const DISCOVERY_STAGES = ['Identified', 'Contacted', 'Meeting held', 'Following up', 'Engaged', 'Dormant'] as const;
export const GENERAL_STAGES = ['Active', 'Dormant'] as const;
export const ALL_STAGES = Array.from(new Set([...INVESTOR_STAGES, ...DISCOVERY_STAGES, ...GENERAL_STAGES]));
export const INTERACTION_TYPES = ['email', 'call', 'meeting', 'event', 'message'] as const;
export const PROGRAM_TYPES = ['grant', 'SBIR or STTR', 'competition', 'accelerator', 'fellowship', 'pitch event', 'prize'] as const;
export const APPLICATION_STAGES = ['Scouted', 'Qualifying', 'Preparing', 'Submitted', 'Under review', 'Awarded', 'Declined', 'Withdrawn', 'Reporting', 'Closed'] as const;
export const ANSWER_STATUS = ['current', 'needs review', 'retired'] as const;
export const OBJECTIVE_STATUS = ['draft', 'active', 'done', 'dropped'] as const;
export const CONFIDENCE = ['on track', 'at risk', 'off track'] as const;
export const FREQUENCY = ['weekly', 'monthly', 'quarterly'] as const;
export const KPI_SOURCE = ['manual', 'computed'] as const;
export const INTAKE_SOURCE = ['share sheet', 'email forward', 'meeting', 'quick add', 'Trello import', 'routine', 'app request'] as const;
export const TRIAGE_STATE = ['New', 'Proposed', 'Accepted', 'Rejected', 'Converted'] as const;
export const PROPOSED_TYPE = ['task', 'CRM interaction', 'intel', 'application opportunity', 'answer bank update', 'hub knowledge note', 'discard'] as const;
export const MEETING_KIND = ['Monday check-in', 'Wednesday vendor review', 'Friday checkout', 'ad hoc'] as const;
export const LABEL_FACET = ['Track', 'Context', 'Effort', 'Relationship type', 'Tag', 'Workstream'] as const;
export const SETTING_SCOPE = ['global', 'Santiago', 'Jay'] as const;
export const REMINDER_CHANNEL = ['app', 'digest'] as const;
