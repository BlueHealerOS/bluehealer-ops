// Hub import planning. Pure: frontmatter fields in, a report and the records to create out. Writes nothing.
import { createHash } from 'node:crypto';
import { addMonthsClamped } from '../../domain/time.ts';
import { normalizeDomain, normalizeEmail, normalizeName } from '../model/dedupe.ts';
import type { Owner, RankingConfig, Sensitivity } from '../model/types.ts';

export interface HubNote { kind: 'person' | 'company'; /** Path inside the hub, for example registers/People/<file>.md */ path: string; fields: Record<string, string> }
export interface CurrentState {
  orgs: { id: number; name: string; hubPath?: string }[];
  people: { id: number; name: string; email?: string; sourceId?: string; orgName?: string }[];
}
export interface OrgCreate { hubPath: string; name: string; orgType: string; domain?: string; relationshipToBH: string }
export interface PersonCreate {
  sourceId: string; name: string; relationshipType: string; owner: Owner; email?: string; importance: number; stage: 'Active' | 'Mapped'; sensitivity: Sensitivity;
  /** Only for Active people: the date of the imported last contact (also becomes an interaction). */
  lastContact?: string;
  org: { hubPath: string } | { existingId: number } | { independent: true };
}
export type Status = 'new' | 'match' | 'conflict' | 'skipped';
export interface PlanRow { kind: 'person' | 'organization'; path: string; status: Status; reason?: string; ownerDefaulted?: boolean; orgDefaulted?: boolean }
export interface ImportPlan {
  version: 1; today: string; sharedOwner: Owner; configVersion: string;
  rows: PlanRow[];
  creates: { orgs: OrgCreate[]; people: PersonCreate[] };
  needsIndependent: boolean;
  hash: string;
}

const first = (map: [RegExp, string][], v: string | undefined, fallback?: string) => map.find(([r]) => r.test(v ?? ''))?.[1] ?? fallback;
const REL_MAP: [RegExp, string][] = [
  [/investor|angel|\bvc\b/i, 'investor'], [/counsel|attorney|lawyer|legal/i, 'counsel'], [/customer discovery/i, 'customer discovery'], [/\bkol\b|key opinion/i, 'KOL'],
  [/clinical advisor|clinician|surgeon|physician/i, 'clinical advisor'], [/advisor|adviser|mentor/i, 'advisor'], [/payer|reimbursement/i, 'payer'], [/hospital|health system/i, 'hospital'],
  [/vendor|supplier|manufactur/i, 'vendor'], [/consult/i, 'consultant'], [/partner/i, 'partner'], [/ecosystem|accelerator|incubator|network|community/i, 'ecosystem'], [/family|friend/i, 'family and friends'],
];
const ORG_TYPE_MAP: [RegExp, string][] = [
  [/investor|angel|fund|capital/i, 'investor'], [/counsel|law/i, 'counsel'], [/competitor/i, 'competitor'], [/payer|insur/i, 'payer'], [/hospital|health system/i, 'hospital system'],
  [/surgeon|practice|clinic/i, 'surgeon practice'], [/vendor|supplier|manufactur|wire/i, 'vendor'], [/grant|funder|accelerator|incubator/i, 'accelerator or grantor'],
  [/academic|universit|college/i, 'academic'], [/government|agency|federal|state/i, 'government'], [/consult/i, 'consultant'], [/industry|association|network/i, 'industry'],
];
const REL_TO_BH_MAP: [RegExp, string][] = [
  [/investor/i, 'investor'], [/partner/i, 'partner'], [/vendor|supplier|manufactur/i, 'vendor'], [/advis/i, 'advisor'], [/customer|prospect|hospital|payer/i, 'customer prospect'], [/ecosystem|accelerator|network|community/i, 'ecosystem'],
];
/** Hub tier 1 is strongest: 1 to 5, 2 to 4, 3 to 3. Anything else is the default 3 (D25, confirmed). */
const TIER_TO_IMPORTANCE: Record<string, number> = { '1': 5, '2': 4, '3': 3 };

const stripLink = (v: string | undefined) => (v ?? '').replace(/^"+|"+$/g, '').replace(/^\[\[|\]\]$/g, '').split('|')[0]!.trim();
const isDate = (v: string | undefined): v is string => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v);
const baseName = (path: string) => path.replace(/^.*\//, '').replace(/\.md$/, '');
const isMoc = (n: HubNote) => /moc/i.test(n.fields.type ?? '') || /^MOC\b/.test(baseName(n.path));

export interface PlanInput { notes: HubNote[]; current: CurrentState; today: string; sharedOwner: Owner }

export function planImport(input: PlanInput, cfg: RankingConfig): ImportPlan {
  const { today, sharedOwner, current } = input;
  const rows: PlanRow[] = [];
  const orgCreates: OrgCreate[] = [];
  const peopleCreates: PersonCreate[] = [];
  const notes = [...input.notes].sort((a, b) => a.path.localeCompare(b.path));

  // Organizations first, so people can refer to them.
  const orgByName = new Map<string, { hubPath: string } | { existingId: number }>();
  for (const o of current.orgs) orgByName.set(normalizeName(o.name), { existingId: o.id });
  const seenOrg = new Map<string, string>();
  for (const n of notes.filter((x) => x.kind === 'company')) {
    const name = baseName(n.path), key = normalizeName(name);
    if (isMoc(n)) { rows.push({ kind: 'organization', path: n.path, status: 'skipped', reason: 'map of content, not an organization' }); continue; }
    const byPath = current.orgs.find((o) => o.hubPath === n.path);
    if (byPath) { rows.push(byPath.name === name ? { kind: 'organization', path: n.path, status: 'match', reason: 'same hub path' } : { kind: 'organization', path: n.path, status: 'conflict', reason: 'name differs from the organization at this hub path' }); continue; }
    const byName = current.orgs.find((o) => normalizeName(o.name) === key);
    if (byName) { rows.push({ kind: 'organization', path: n.path, status: 'match', reason: 'same name' }); continue; }
    if (seenOrg.has(key)) { rows.push({ kind: 'organization', path: n.path, status: 'conflict', reason: 'same name as another hub organization' }); continue; }
    seenOrg.set(key, n.path);
    const rel = n.fields.relationship;
    const orgType = first(ORG_TYPE_MAP, rel, 'other')!;
    const web = n.fields.website && /^(https?:\/\/)?[A-Za-z0-9.-]+\.[A-Za-z]{2,}/.test(n.fields.website) ? normalizeDomain(n.fields.website) : undefined;
    orgCreates.push({ hubPath: n.path, name, orgType, domain: web, relationshipToBH: first(REL_TO_BH_MAP, rel, 'none yet')! });
    orgByName.set(key, { hubPath: n.path });
    rows.push({ kind: 'organization', path: n.path, status: 'new', reason: orgType === 'other' && !first(ORG_TYPE_MAP, rel) ? 'type not recognized, set to other' : undefined });
  }

  // People.
  const cutoff = addMonthsClamped(today, -12);
  const seenEmail = new Map<string, string>(), seenNameOrg = new Map<string, string>();
  let needsIndependent = false;
  for (const n of notes.filter((x) => x.kind === 'person')) {
    const f = n.fields, name = baseName(n.path);
    const row = (status: Status, reason?: string, extra: Partial<PlanRow> = {}) => rows.push({ kind: 'person', path: n.path, status, reason, ...extra });
    if (isMoc(n)) { row('skipped', 'map of content, not a person'); continue; }
    const relationshipType = first(REL_MAP, f.relationship);
    if (!relationshipType) { row('skipped', 'relationship type not recognized'); continue; }
    const email = normalizeEmail(f.email, cfg);
    const orgName = stripLink(f.organization);
    const orgRef = orgName ? orgByName.get(normalizeName(orgName)) : undefined;

    const bySource = current.people.find((p) => p.sourceId === n.path);
    if (bySource) {
      if (email && normalizeEmail(bySource.email, cfg) && normalizeEmail(bySource.email, cfg) !== email) row('conflict', 'email differs from the record at this hub path');
      else row('match', 'same hub path');
      continue;
    }
    const byEmail = email ? current.people.find((p) => normalizeEmail(p.email, cfg) === email) : undefined;
    if (byEmail) { row('match', 'same email'); continue; }
    const nameKey = `${normalizeName(name)}|${normalizeName(orgName)}`;
    const byName = current.people.find((p) => normalizeName(p.name) === normalizeName(name) && normalizeName(p.orgName ?? '') === normalizeName(orgName));
    if (byName && orgName) { row('match', 'same name in the same organization'); continue; }
    if (email && seenEmail.has(email)) { row('conflict', 'same email as another hub person'); continue; }
    if (orgName && seenNameOrg.has(nameKey)) { row('conflict', 'same name in the same organization as another hub person'); continue; }
    if (email) seenEmail.set(email, n.path);
    if (orgName) seenNameOrg.set(nameKey, n.path);

    const ownerKey = (f.owner ?? '').trim().toLowerCase();
    const founder: Owner | undefined = ownerKey === 'santiago' ? 'Santiago' : ownerKey === 'jay' ? 'Jay' : undefined;
    const lastContact = isDate(f['last-contact']) && f['last-contact'] >= cutoff && f['last-contact'] <= today ? f['last-contact'] : undefined;
    const org = orgRef ?? { independent: true as const };
    if ('independent' in org) needsIndependent = true;
    peopleCreates.push({
      sourceId: n.path, name, relationshipType, owner: founder ?? sharedOwner, email, importance: TIER_TO_IMPORTANCE[(f.tier ?? '').trim()] ?? cfg.defaultImportance,
      stage: lastContact ? 'Active' : 'Mapped', sensitivity: (f.sensitivity ?? '').trim().toLowerCase() === 'restricted' ? 'Restricted' : 'Normal', lastContact, org,
    });
    row('new', undefined, { ownerDefaulted: !founder || undefined, orgDefaulted: 'independent' in org || undefined });
  }

  const creates = { orgs: orgCreates, people: peopleCreates };
  const hash = createHash('sha256').update(JSON.stringify({ v: 1, config: cfg.version, today, sharedOwner, creates })).digest('hex').slice(0, 16);
  return { version: 1, today, sharedOwner, configVersion: cfg.version, rows, creates, needsIndependent, hash };
}

export function countPlan(plan: ImportPlan) {
  const by = (kind: PlanRow['kind']) => {
    const out = { new: 0, match: 0, conflict: 0, skipped: 0 };
    for (const r of plan.rows) if (r.kind === kind) out[r.status]++;
    return out;
  };
  const reasons: Record<string, number> = {};
  for (const r of plan.rows) if (r.reason && r.status !== 'new') reasons[`${r.kind} ${r.status}: ${r.reason}`] = (reasons[`${r.kind} ${r.status}: ${r.reason}`] ?? 0) + 1;
  return {
    organizations: by('organization'), people: by('person'), reasons,
    peopleOwnerDefaulted: plan.rows.filter((r) => r.kind === 'person' && r.ownerDefaulted).length,
    peopleInIndependent: plan.rows.filter((r) => r.kind === 'person' && r.orgDefaulted).length,
    peopleActive: plan.creates.people.filter((p) => p.stage === 'Active').length,
    peopleMapped: plan.creates.people.filter((p) => p.stage === 'Mapped').length,
    peopleRestricted: plan.creates.people.filter((p) => p.sensitivity === 'Restricted').length,
    interactionsToCreate: plan.creates.people.filter((p) => p.lastContact).length,
  };
}

/** The report a founder reads before applying. It names records, so it is written only to the gitignored import folder, never printed. */
export function renderReport(plan: ImportPlan): string {
  const c = countPlan(plan);
  const lines = [
    `# Hub import report ${plan.hash}`, '',
    `Date ${plan.today}. Ranking config ${plan.configVersion}. Shared or empty hub owners default to ${plan.sharedOwner}.`, '',
    '## Counts', '',
    `- Organizations: ${c.organizations.new} new, ${c.organizations.match} match, ${c.organizations.conflict} conflict, ${c.organizations.skipped} skipped`,
    `- People: ${c.people.new} new, ${c.people.match} match, ${c.people.conflict} conflict, ${c.people.skipped} skipped`,
    `- New people: ${c.peopleActive} Active (contact in the last 12 months), ${c.peopleMapped} Mapped, ${c.peopleRestricted} Restricted`,
    `- Interactions to create ("Imported last contact"): ${c.interactionsToCreate}`,
    `- New people with the owner defaulted to ${plan.sharedOwner}: ${c.peopleOwnerDefaulted}`,
    `- New people placed in Independent (no organization found): ${c.peopleInIndependent}`, '',
    '## Why records were not written', '',
    ...Object.entries(c.reasons).sort().map(([k, v]) => `- ${k}: ${v}`), '',
    '## Rows', '', '| Kind | Hub path | Status | Note |', '| --- | --- | --- | --- |',
    ...plan.rows.map((r) => `| ${r.kind} | ${r.path} | ${r.status} | ${[r.reason, r.ownerDefaulted ? `owner defaulted to ${plan.sharedOwner}` : '', r.orgDefaulted ? 'placed in Independent' : ''].filter(Boolean).join('; ')} |`), '',
    `Conflicts are not written. Apply creates only the new rows: add \`--apply --confirm ${plan.hash}\`.`, '',
  ];
  return lines.join('\n');
}

export function assertConfirm(plan: Pick<ImportPlan, 'hash'>, confirm: string | undefined): void {
  if (!confirm) throw new Error(`--apply needs --confirm ${plan.hash}. Read the report first.`);
  if (confirm !== plan.hash) throw new Error(`The confirmation hash does not match this import (${plan.hash}). The hub or the Lists changed since the report, or the hash was mistyped. Nothing was written.`);
}
