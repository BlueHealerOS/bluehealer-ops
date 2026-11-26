// Exports are built in memory and handed to the browser as downloads. The app never uploads them.
import type { CrmInteraction, CrmOrg, CrmPerson } from './model/types.ts';
import type { CrmData } from './service.ts';
import type { MergeLogEntry, WithEtag } from './graph/mappers.ts';
import { parseSnapshot } from './model/merge.ts';

/** RFC 4180 quoting, and a leading quote on cells a spreadsheet could read as a formula. */
export function csvCell(v: string | number | boolean | undefined | null): string {
  let s = v === undefined || v === null ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
export const toCsv = (headers: string[], rows: (string | number | boolean | undefined | null)[][]): string =>
  [headers, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';

export interface CsvOptions { includeRestricted?: boolean }
const orgName = (d: Pick<CrmData, 'orgs'>, id: number | undefined) => d.orgs.find((o) => o.id === id)?.name ?? '';

export const PEOPLE_HEADERS = ['id', 'name', 'organization', 'relationship_type', 'owner', 'email', 'importance', 'comfort', 'agreed_check_in', 'stage', 'sensitivity', 'last_two_way_at', 'last_touch_at', 'last_direction', 'source_id'];
export function peopleCsv(d: CrmData, o: CsvOptions = {}): string {
  const rows = d.people.filter((p) => o.includeRestricted || p.sensitivity !== 'Restricted')
    .map((p) => [p.id, p.name, orgName(d, p.organizationId), p.relationshipType, p.owner, p.email, p.importance, p.comfort, p.agreedCheckIn, p.stage, p.sensitivity, p.lastTwoWayAt, p.lastTouchAt, p.lastDirection, p.sourceId]);
  return toCsv(PEOPLE_HEADERS, rows);
}
export const ORG_HEADERS = ['id', 'name', 'type', 'domain', 'relationship_to_bh', 'hub_path'];
export const organizationsCsv = (d: CrmData): string => toCsv(ORG_HEADERS, d.orgs.map((x: CrmOrg) => [x.id, x.name, x.orgType, x.domain, x.relationshipToBH, x.hubPath]));
export const INTERACTION_HEADERS = ['id', 'date', 'type', 'direction', 'summary', 'people', 'organization', 'follow_up_needed', 'source_link', 'sensitivity'];
/** An interaction is Restricted if it says so or any person in it is Restricted. */
export function isRestrictedInteraction(i: CrmInteraction, people: CrmPerson[]): boolean {
  return i.sensitivity === 'Restricted' || i.peopleIds.some((id) => people.find((p) => p.id === id)?.sensitivity === 'Restricted');
}
export function interactionsCsv(d: CrmData, o: CsvOptions = {}): string {
  const rows = d.interactions.filter((i) => o.includeRestricted || !isRestrictedInteraction(i, d.people))
    .map((i) => [i.id, i.date, i.type, i.direction, i.summary, i.peopleIds.map((id) => d.people.find((p) => p.id === id)?.name ?? '').join('; '), orgName(d, i.organizationId), i.followUpNeeded === true, i.sourceLink, i.sensitivity ?? 'Normal']);
  return toCsv(INTERACTION_HEADERS, rows);
}
export const csvFileName = (kind: 'people' | 'organizations' | 'interactions', today: string) => `crm-${kind}-${today}.csv`;

/** One person's data for an access request: the person, the organization and every interaction. Other participants are counted, not named. */
export function personExport(person: CrmPerson, d: CrmData, now: Date) {
  const { etag, ...p } = person as CrmPerson & { etag?: string };
  void etag;
  const org = d.orgs.find((o) => o.id === person.organizationId);
  return {
    exportedAt: now.toISOString(),
    person: p,
    organization: org ? { name: org.name, type: org.orgType, domain: org.domain, relationshipToBH: org.relationshipToBH } : null,
    interactions: d.interactions.filter((i) => i.peopleIds.includes(person.id)).sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id)
      .map((i) => ({ date: i.date, type: i.type, direction: i.direction, summary: i.summary, followUpNeeded: i.followUpNeeded === true, sourceLink: i.sourceLink, otherParticipants: i.peopleIds.length - 1 })),
  };
}
export const personExportFileName = (person: CrmPerson) => `crm-person-${person.id}.json`;

export interface DeletionPreview { solo: WithEtag<CrmInteraction>[]; shared: WithEtag<CrmInteraction>[]; mergeLogs: MergeLogEntry[] }
/** What deleting a person removes: interactions only they were in, their place in shared ones, and merge log snapshots of them. */
export function deletionPreview(personId: number, d: CrmData): DeletionPreview {
  const mine = d.interactions.filter((i) => i.peopleIds.includes(personId));
  return {
    solo: mine.filter((i) => i.peopleIds.length === 1),
    shared: mine.filter((i) => i.peopleIds.length > 1),
    mergeLogs: d.mergeLog.filter((e) => e.mergedIntoId === personId || parseSnapshot(e.snapshot)?.lose.id === personId),
  };
}
