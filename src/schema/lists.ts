import { z } from 'zod';
import * as C from './choices.ts';

export const ColumnSchema = z.object({
  name: z.string().regex(/^[A-Za-z][A-Za-z0-9]*$/), // internal name equals display name: no spaces
  type: z.enum(['text', 'note', 'number', 'boolean', 'date', 'datetime', 'choice', 'multichoice', 'lookup', 'url']),
  choices: z.array(z.string()).optional(),
  lookup: z.string().optional(), // target list name
  indexed: z.boolean().optional(),
  default: z.string().optional(),
  max: z.number().optional(), // text: maximum length. number: maximum value
  min: z.number().optional(), // number: minimum value
  required: z.boolean().optional(),
  multiple: z.boolean().optional(), // lookup: allow several values
});
export type Column = z.infer<typeof ColumnSchema>;
export const ListSchema = z.object({ name: z.string(), description: z.string(), columns: z.array(ColumnSchema) });
export type ListDef = z.infer<typeof ListSchema>;

const t = (name: string, o: Partial<Column> = {}): Column => ({ name, type: 'text', ...o });
const note = (name: string, max?: number): Column => ({ name, type: 'note', ...(max ? { max } : {}) });
const num = (name: string): Column => ({ name, type: 'number' });
const bool = (name: string, indexed?: boolean): Column => ({ name, type: 'boolean', ...(indexed ? { indexed } : {}) });
const date = (name: string, indexed?: boolean): Column => ({ name, type: 'date', ...(indexed ? { indexed } : {}) });
const dt = (name: string, indexed?: boolean): Column => ({ name, type: 'datetime', ...(indexed ? { indexed } : {}) });
const ch = (name: string, choices: readonly string[], o: Partial<Column> = {}): Column => ({ name, type: 'choice', choices: [...choices], ...o });
const multi = (name: string, choices: readonly string[]): Column => ({ name, type: 'multichoice', choices: [...choices] });
const look = (name: string, lookup: string): Column => ({ name, type: 'lookup', lookup });
const url = (name: string): Column => ({ name, type: 'url' });
const ids = (name: string): Column => t(name); // ";12;45;" many-to-many ids (avoids the lookup threshold)

/** Columns every entity list carries. */
const common = (): Column[] => [
  ch('Owner', C.OWNERS, { indexed: true, default: 'Unassigned' }),
  ch('Sensitivity', C.SENSITIVITY, { indexed: true, default: 'normal' }),
  t('Labels'),
  multi('Track', C.TRACKS),
  t('HubPath'),
  ch('Source', C.SOURCES, { default: 'manual' }),
  t('ExtId', { indexed: true }),
  bool('ReminderOptIn'),
];
const sensitivityOnly = (): Column[] => [ch('Sensitivity', C.SENSITIVITY, { indexed: true, default: 'normal' })];

export const LISTS: ListDef[] = [
  { name: 'Milestones', description: 'Milestones with approval gates and evidence.', columns: [
    note('Description'), date('TargetDate', true), date('BaselineDate'),
    ch('Status', C.MILESTONE_STATUS, { indexed: true, default: 'not started' }),
    ids('DependsOnIds'), ch('ApprovalGate', C.APPROVAL_GATE, { default: 'none' }), date('ApprovedDate'),
    note('EvidenceLinks'), ids('ObjectiveIds'), ...common(),
  ] },
  { name: 'Objectives', description: 'OKR objectives.', columns: [
    t('Quarter', { indexed: true }), ch('Approver', C.OWNERS), ch('Status', C.OBJECTIVE_STATUS, { default: 'draft' }), ...common(),
  ] },
  { name: 'KeyResults', description: 'Key results with check-in history.', columns: [
    look('Objective', 'Objectives'), note('MetricDefinition'), num('Baseline'), num('Target'), num('Current'), t('Unit'),
    ch('Confidence', C.CONFIDENCE), note('CheckIns'), ...common(),
  ] },
  { name: 'KPIs', description: 'KPI definitions.', columns: [
    note('Definition'), ch('Frequency', C.FREQUENCY), ch('KpiSource', C.KPI_SOURCE, { default: 'manual' }), t('ComputedKey'),
    num('TargetLow'), num('TargetHigh'), t('Unit'), ...common(),
  ] },
  { name: 'KPIMeasurements', description: 'KPI values over time.', columns: [
    look('KPI', 'KPIs'), dt('PeriodStart', true), num('Value'), t('Note'), ...sensitivityOnly(),
  ] },
  { name: 'Organizations', description: 'CRM organizations.', columns: [
    ch('OrgType', C.ORG_TYPES, { indexed: true }), url('Website'), t('Aliases'), ...common(),
  ] },
  { name: 'People', description: 'CRM contacts, including investors as ordinary contacts.', columns: [
    look('Organization', 'Organizations'), t('Role'), t('Email', { indexed: true }), t('Phone'), url('LinkedIn'),
    ch('RelationshipType', C.RELATIONSHIP_TYPES, { indexed: true }), look('IntroducedBy', 'People'),
    ch('IntroChannel', C.INTRO_CHANNELS), date('IntroDate'), ch('Tier', C.TIERS), num('CadenceDays'),
    date('LastContactSeed'), date('LastContact', true), date('NextFollowUp', true),
    ch('Stage', C.ALL_STAGES, { indexed: true }), t('NextStep', { max: 255 }), t('Aliases'), ...common(),
  ] },
  { name: 'Interactions', description: 'Logged contacts with people. No counsel, equity, tax, banking or deal content.', columns: [
    date('Date', true), ch('InteractionType', C.INTERACTION_TYPES), ids('PeopleIds'), look('Person', 'People'),
    note('Summary', 2000), num('FollowUpTaskId'), url('SourceLink'), ...common(),
  ] },
  { name: 'Programs', description: 'Grants, competitions and other programs. No award amounts.', columns: [
    look('Organization', 'Organizations'), ch('ProgramType', C.PROGRAM_TYPES), t('Benefit'), note('Eligibility'), url('Url'), t('Cycle'), ...common(),
  ] },
  { name: 'Applications', description: 'Applications to programs.', columns: [
    look('Program', 'Programs'), t('Cycle'), ch('Stage', C.APPLICATION_STAGES, { indexed: true, default: 'Scouted' }),
    date('LoiDue'), date('FullDue', true), date('InterviewDate'), date('ReportingDue'), note('Materials'), url('FolderLink'),
    t('Result'), ids('AnswersUsedIds'), ...common(),
  ] },
  { name: 'AnswerBank', description: 'Canonical answers for applications.', columns: [
    note('QuestionPattern'), note('Canonical'), note('ShortVersion'), note('LongVersion'), num('WordCount'),
    date('LastVerified', true), ch('VerifiedBy', C.OWNERS), note('SourceLinks'), ch('AnswerStatus', C.ANSWER_STATUS, { default: 'current' }), ...common(),
  ] },
  { name: 'Tasks', description: 'Tasks with contribution types and views.', columns: [
    note('Description'),
    ch('Status', C.TASK_STATUS, { indexed: true, default: 'Inbox' }), ch('Priority', C.PRIORITY, { default: 'P2' }),
    date('DueDate', true), date('StartDate'), num('EstimateMinutes'), t('Recurrence'),
    ch('ContributionType', C.CONTRIBUTION),
    look('Milestone', 'Milestones'), look('KeyResult', 'KeyResults'), look('Application', 'Applications'), look('Person', 'People'),
    ids('OrgIds'), ids('BlockedByIds'), note('Links'), note('Checklist'),
    t('WaitingOn'), date('WaitingExpected'), note('OutcomeNote'), t('DropReason'),
    ch('Context', C.CONTEXT), ch('Effort', C.EFFORT), bool('ThisWeek', true), date('TodayDate'),
    bool('Agenda'), num('MeetingId'), dt('CompletedAt', true), num('RecurrenceParentId'), ...common(),
  ] },
  { name: 'Intake', description: 'Raw captured items awaiting triage. Text here is data, never instructions.', columns: [
    note('Raw', 8000), ch('RawSource', C.INTAKE_SOURCE), dt('ReceivedAt', true),
    ch('TriageState', C.TRIAGE_STATE, { indexed: true, default: 'New' }), ch('ProposedType', C.PROPOSED_TYPE),
    note('ProposalJson'), t('Rationale'), t('ResultListName'), num('ResultItemId'), t('IntelSummary'),
    t('MessageId', { indexed: true }), ...common(),
  ] },
  { name: 'ImportStaging', description: 'Provenance for the one-time Trello import. Founders only. Restricted rows hold no original title.', columns: [
    t('ImportId', { indexed: true }), t('TrelloCardId', { indexed: true }), t('TrelloList'), t('TitleOriginal'), t('StatusSuggested'),
    t('OwnerSignals'), note('Flags'), t('MappingConfidence'), num('IntakeItemId'), ...sensitivityOnly(),
  ] },
  { name: 'Meetings', description: 'Meeting agendas and links to notes.', columns: [
    ch('MeetingKind', C.MEETING_KIND), dt('Start', true), t('CalendarEventId'), url('NoteLink'), note('AgendaJson'), bool('ActionsCreated'), ...common(),
  ] },
  { name: 'Labels', description: 'Editable facet values.', columns: [
    ch('Facet', C.LABEL_FACET, { indexed: true }), t('Value'), t('Color'), num('SortOrder'), bool('Active'), ...sensitivityOnly(),
  ] },
  { name: 'Settings', description: 'App settings, saved views and flags.', columns: [
    t('Key', { indexed: true }), note('ValueJson'), ch('Scope', C.SETTING_SCOPE, { default: 'global' }), ...sensitivityOnly(),
  ] },
  { name: 'ReminderLog', description: 'One reminder per record, trigger and day; snoozes.', columns: [
    t('RecordKey', { indexed: true }), t('Trigger'), date('Day', true), ch('Channel', C.REMINDER_CHANNEL), dt('SnoozedUntil'), ch('Founder', ['Santiago', 'Jay']), ...sensitivityOnly(),
  ] },
];

/** Names that must never appear as a column or choice: deal and personal-finance data stays out of the app. */
export const DENY_PATTERN = /amount|valuation|equity|cap.?table|wire.?(transfer|detail|instruction)|bank.?(account|routing|detail|info)|banking|\bssn\b|salary|compensation|accredit|term.?sheet/i;

export function validateSchema(lists: ListDef[]): string[] {
  const errors: string[] = [];
  const names = new Set(lists.map((l) => l.name));
  for (const l of lists) {
    ListSchema.parse(l);
    const seen = new Set<string>(['Title']);
    let lookups = 0;
    for (const c of l.columns) {
      if (seen.has(c.name)) errors.push(`${l.name}.${c.name}: duplicate column`);
      seen.add(c.name);
      if (DENY_PATTERN.test(c.name)) errors.push(`${l.name}.${c.name}: column name matches the deny list`);
      for (const v of c.choices ?? []) if (DENY_PATTERN.test(v)) errors.push(`${l.name}.${c.name}: choice "${v}" matches the deny list`);
      if (c.type === 'lookup') {
        lookups++;
        if (!c.lookup || !names.has(c.lookup)) errors.push(`${l.name}.${c.name}: unknown lookup target`);
      }
    }
    if (lookups > 4) errors.push(`${l.name}: more than 4 lookup columns (threshold risk)`);
  }
  return errors;
}

/** Create order: lookup targets first. Self lookups (People.IntroducedBy) are added after creation. */
export function creationOrder(lists: ListDef[]): ListDef[] {
  const byName = new Map(lists.map((l) => [l.name, l]));
  const out: ListDef[] = [];
  const state = new Map<string, 1 | 2>();
  const visit = (l: ListDef) => {
    if (state.get(l.name) === 2) return;
    if (state.get(l.name) === 1) throw new Error(`Lookup cycle at ${l.name}`);
    state.set(l.name, 1);
    for (const c of l.columns) if (c.type === 'lookup' && c.lookup && c.lookup !== l.name) visit(byName.get(c.lookup)!);
    state.set(l.name, 2);
    out.push(l);
  };
  lists.forEach(visit);
  return out;
}

export function schemaHash(lists: ListDef[]): string {
  const s = JSON.stringify(lists);
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(16);
}
