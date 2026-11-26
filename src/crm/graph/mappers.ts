import type { CrmInteraction, CrmOrg, CrmPerson } from '../model/types.ts';
import type { Row } from './repo.ts';

export type WithEtag<T> = T & { etag?: string };
type Entry<T> = [keyof T & string, string];

const ORG: Entry<CrmOrg>[] = [['name', 'Title'], ['orgType', 'OrgType'], ['domain', 'Domain'], ['relationshipToBH', 'RelationshipToBH'], ['hubPath', 'HubPath']];
const PERSON: Entry<CrmPerson>[] = [
  ['name', 'Title'], ['organizationId', 'OrganizationLookupId'], ['relationshipType', 'RelationshipType'], ['owner', 'Owner'], ['email', 'Email'],
  ['importance', 'Importance'], ['comfort', 'Comfort'], ['agreedCheckIn', 'AgreedCheckIn'], ['stage', 'Stage'], ['sensitivity', 'Sensitivity'],
  ['lastTwoWayAt', 'LastTwoWayAt'], ['lastTouchAt', 'LastTouchAt'], ['lastDirection', 'LastDirection'], ['sourceId', 'SourceId'],
];
const INTERACTION: Entry<CrmInteraction>[] = [
  ['summary', 'Title'], ['date', 'Date'], ['type', 'InteractionType'], ['direction', 'Direction'], ['peopleIds', 'PeopleLookupId'],
  ['organizationId', 'OrganizationLookupId'], ['followUpNeeded', 'FollowUpNeeded'], ['sourceLink', 'SourceLink'], ['sensitivity', 'Sensitivity'],
];

function fromRow<T extends { id: number }>(map: Entry<T>[], row: Row, defaults: Partial<T> = {}): WithEtag<T> {
  const out: Record<string, unknown> = { ...defaults, id: row.id };
  if (row.etag) out.etag = row.etag;
  for (const [key, field] of map) {
    const v = row.fields[field];
    if (v !== undefined && v !== null && v !== '') out[key] = v;
  }
  return out as WithEtag<T>;
}
/** Model values to list fields. `undefined` is skipped; `null` clears the field. */
function toFields<T>(map: Entry<T>[], patch: { [K in keyof T]?: T[K] | null }): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, field] of map) { const v = patch[key]; if (v !== undefined) out[field] = v; }
  return out;
}

export const orgFromRow = (r: Row) => fromRow<CrmOrg>(ORG, r, { name: '' });
export const personFromRow = (r: Row) => fromRow<CrmPerson>(PERSON, r, { name: '', sensitivity: 'Normal' });
export const interactionFromRow = (r: Row) => fromRow<CrmInteraction>(INTERACTION, r, { peopleIds: [], summary: '' });
export const orgToFields = (p: { [K in keyof CrmOrg]?: CrmOrg[K] | null }) => toFields(ORG, p);
export const personToFields = (p: { [K in keyof CrmPerson]?: CrmPerson[K] | null }) => toFields(PERSON, p);
export const interactionToFields = (p: { [K in keyof CrmInteraction]?: CrmInteraction[K] | null }) => toFields(INTERACTION, p);
