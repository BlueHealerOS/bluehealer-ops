// The four CRM lists (context section 4). Column names equal SharePoint internal names: no spaces.
// System fields are written only by the app or scripts. Nothing here holds amounts, shares or terms (D27).
import type { Column, ListDef } from '../schema/lists.ts';

export const CRM_ORGANIZATIONS = 'CRM Organizations';
export const CRM_PEOPLE = 'CRM People';
export const CRM_INTERACTIONS = 'CRM Interactions';
export const CRM_MERGE_LOG = 'CRM Merge Log';
export type CrmListName = typeof CRM_ORGANIZATIONS | typeof CRM_PEOPLE | typeof CRM_INTERACTIONS | typeof CRM_MERGE_LOG;

export const ORG_TYPES = ['hospital system', 'payer', 'surgeon practice', 'industry', 'vendor', 'investor', 'accelerator or grantor', 'counsel', 'consultant', 'academic', 'competitor', 'government', 'other'] as const;
export const REL_TO_BH = ['customer prospect', 'partner', 'vendor', 'investor', 'advisor', 'ecosystem', 'none yet'] as const;
export const RELATIONSHIP_TYPES = ['investor', 'advisor', 'clinical advisor', 'KOL', 'customer discovery', 'hospital', 'payer', 'vendor', 'counsel', 'consultant', 'partner', 'ecosystem', 'family and friends'] as const;
export const OWNERS = ['Santiago', 'Jay'] as const;
export const STAGES = ['Mapped', 'Targeted', 'Intro pending', 'Active', 'Dormant', 'Closed', 'Do not contact', 'Identified', 'Contacted', 'Meeting held', 'Following up', 'Committed', 'Passed'] as const;
export const SENSITIVITIES = ['Normal', 'Restricted'] as const;
export const INTERACTION_TYPE_CHOICES = ['email', 'call', 'meeting', 'event', 'message', 'broadcast'] as const;
export const DIRECTION_CHOICES = ['outbound', 'inbound', 'two-way'] as const;
export const MERGE_KINDS = ['person', 'organization'] as const;

const text = (name: string, o: Partial<Column> = {}): Column => ({ name, type: 'text', ...o });
const note = (name: string, o: Partial<Column> = {}): Column => ({ name, type: 'note', ...o });
const choice = (name: string, choices: readonly string[], o: Partial<Column> = {}): Column => ({ name, type: 'choice', choices: [...choices], ...o });
const date = (name: string, o: Partial<Column> = {}): Column => ({ name, type: 'date', ...o });
const num = (name: string, o: Partial<Column> = {}): Column => ({ name, type: 'number', ...o });
const look = (name: string, lookup: string, o: Partial<Column> = {}): Column => ({ name, type: 'lookup', lookup, ...o });

export const CRM_LISTS: ListDef[] = [
  { name: CRM_ORGANIZATIONS, description: 'CRM organizations. No amounts, shares or terms.', columns: [
    choice('OrgType', ORG_TYPES, { required: true }),
    text('Domain'),
    choice('RelationshipToBH', REL_TO_BH),
    text('HubPath'),
  ] },
  { name: CRM_PEOPLE, description: 'CRM people. Founders only. Restricted people are excluded from Today, digests and drafts.', columns: [
    look('Organization', CRM_ORGANIZATIONS, { required: true }),
    choice('RelationshipType', RELATIONSHIP_TYPES, { required: true }),
    choice('Owner', OWNERS, { required: true }),
    text('Email', { indexed: true }),
    num('Importance', { min: 1, max: 5 }),
    num('Comfort', { min: 1, max: 5 }),
    date('AgreedCheckIn'),
    choice('Stage', STAGES, { required: true, default: 'Active' }),
    choice('Sensitivity', SENSITIVITIES, { default: 'Normal' }),
    // System fields: written only by the app or scripts, never typed.
    date('LastTwoWayAt'),
    date('LastTouchAt'),
    choice('LastDirection', DIRECTION_CHOICES),
    text('SourceId', { indexed: true }),
  ] },
  { name: CRM_INTERACTIONS, description: 'Logged contacts. No summaries of counsel, equity, tax, banking or deal-structure conversations: link the SharePoint track folder instead.', columns: [
    date('Date', { required: true }),
    choice('InteractionType', INTERACTION_TYPE_CHOICES, { required: true, default: 'email' }),
    choice('Direction', DIRECTION_CHOICES, { required: true }),
    look('People', CRM_PEOPLE, { required: true, multiple: true }),
    look('Organization', CRM_ORGANIZATIONS),
    { name: 'FollowUpNeeded', type: 'boolean' },
    text('SourceLink'),
    choice('Sensitivity', SENSITIVITIES, { default: 'Normal' }),
  ] },
  { name: CRM_MERGE_LOG, description: 'Kept record of merges, used by Undo merge. Snapshots are deleted with the person they describe.', columns: [
    choice('Kind', MERGE_KINDS, { required: true }),
    note('Snapshot'),
    { name: 'MergedIntoId', type: 'number' },
    { name: 'MergedAt', type: 'datetime' },
    text('MergedBy'),
    { name: 'Undone', type: 'boolean' },
  ] },
];

export const crmListDef = (name: string): ListDef => {
  const d = CRM_LISTS.find((l) => l.name === name);
  if (!d) throw new Error(`Unknown CRM list ${name}`);
  return d;
};
