// Pure helpers for the CRM views. No React, no network, no storage, so they are unit tested.
import { daysSinceTwoWay, eligibleForToday, nextCheckIn } from '../model/ranking.ts';
import { staleSystemFields } from '../model/derived.ts';
import { normalizeEmail } from '../model/dedupe.ts';
import type { CrmInteraction, CrmOrg, CrmPerson, Owner, RankingConfig } from '../model/types.ts';

export interface PeopleFilters { search: string; organizationId?: number; relationshipType?: string; owner?: Owner; stage?: string; importance?: number }
export const emptyFilters = (): PeopleFilters => ({ search: '' });

export const orgNameOf = (orgs: CrmOrg[], id: number | undefined): string => orgs.find((o) => o.id === id)?.name ?? '';
const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name);

/** Search covers name, organization and email. Filters combine with AND. Sorted by name. */
export function filterPeople(people: CrmPerson[], orgs: CrmOrg[], f: PeopleFilters): CrmPerson[] {
  const q = f.search.trim().toLowerCase();
  return people
    .filter((p) => (f.organizationId === undefined || p.organizationId === f.organizationId)
      && (!f.relationshipType || p.relationshipType === f.relationshipType)
      && (!f.owner || p.owner === f.owner)
      && (!f.stage || p.stage === f.stage)
      && (f.importance === undefined || (p.importance ?? 3) === f.importance)
      && (!q || `${p.name} ${orgNameOf(orgs, p.organizationId)} ${p.email ?? ''}`.toLowerCase().includes(q)))
    .sort(byName);
}

/** Parses the legacy redirect query (for example "relationship=investor") into filters. Unknown keys are ignored. */
export function filtersFromQuery(query: string): PeopleFilters {
  const q = new URLSearchParams(query);
  const f = emptyFilters();
  if (q.get('relationship')) f.relationshipType = q.get('relationship')!;
  return f;
}

export interface OrgSummary { org: CrmOrg; people: number; lastContact?: string }
export function orgSummaries(orgs: CrmOrg[], people: CrmPerson[], type?: string, search = ''): OrgSummary[] {
  const q = search.trim().toLowerCase();
  return orgs
    .filter((o) => (!type || o.orgType === type) && (!q || `${o.name} ${o.domain ?? ''}`.toLowerCase().includes(q)))
    .map((org) => {
      const mine = people.filter((p) => p.organizationId === org.id);
      return { org, people: mine.length, lastContact: mine.map((p) => p.lastTwoWayAt).filter((d): d is string => !!d).sort().at(-1) };
    })
    .sort((a, b) => a.org.name.localeCompare(b.org.name));
}

/** An organization's people: most important first, then most recent contact. */
export function orgPeople(org: CrmOrg, people: CrmPerson[]): CrmPerson[] {
  return people.filter((p) => p.organizationId === org.id).sort((a, b) => (b.importance ?? 3) - (a.importance ?? 3) || (b.lastTwoWayAt ?? '').localeCompare(a.lastTwoWayAt ?? '') || byName(a, b));
}

const newest = (a: CrmInteraction, b: CrmInteraction) => b.date.localeCompare(a.date) || b.id - a.id;
export const interactionsOf = (personId: number, all: CrmInteraction[]) => all.filter((i) => i.peopleIds.includes(personId)).sort(newest);
export function interactionsOfOrg(orgId: number, people: CrmPerson[], all: CrmInteraction[]) {
  const ids = new Set(people.filter((p) => p.organizationId === orgId).map((p) => p.id));
  return all.filter((i) => i.organizationId === orgId || i.peopleIds.some((id) => ids.has(id))).sort(newest);
}

/** Only web links become links. Anything else is shown as plain text. */
export function safeHttpUrl(s: string | undefined): string | undefined {
  if (!s) return undefined;
  try { const u = new URL(s); return u.protocol === 'https:' || u.protocol === 'http:' ? u.href : undefined; } catch { return undefined; }
}

export interface Attention {
  stale: ReturnType<typeof staleSystemFields>;
  noInteraction: CrmPerson[];
  noCheckInDate: CrmPerson[];
  missingEmail: CrmPerson[];
  restricted: CrmPerson[];
}
/** The Needs attention lists. Possible duplicates and merge arrive with the data hygiene stage. */
export function attention(people: CrmPerson[], interactions: CrmInteraction[], today: string, cfg: RankingConfig): Attention {
  const touched = new Set(interactions.flatMap((i) => i.peopleIds));
  const important = (a: CrmPerson, b: CrmPerson) => (b.importance ?? 3) - (a.importance ?? 3) || byName(a, b);
  return {
    stale: staleSystemFields(people, interactions),
    noInteraction: people.filter((p) => !touched.has(p.id)).sort(important),
    noCheckInDate: people.filter((p) => eligibleForToday(p) && nextCheckIn(p, today, cfg) === undefined).sort(important),
    missingEmail: people.filter((p) => !normalizeEmail(p.email, cfg)).sort(important),
    restricted: people.filter((p) => p.sensitivity === 'Restricted').sort(byName),
  };
}

export const nextCheckInOf = (p: CrmPerson, today: string, cfg: RankingConfig) => nextCheckIn(p, today, cfg);
export const daysSinceOf = (p: CrmPerson, today: string) => daysSinceTwoWay(p, today);
