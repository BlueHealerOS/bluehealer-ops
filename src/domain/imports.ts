// One-time imports. Parsing and mapping are pure and tested on fictional data; real files are read in the browser only.
import type { OrgFull, PersonFull } from './types';
import { dealDataProblem } from './guards';
import { DENY_PATTERN } from '../schema/lists';

export interface HubRecord { kind: 'person' | 'company'; file: string; fields: Record<string, string> }

const stripLink = (v: string | undefined) => (v ?? '').replace(/^"+|"+$/g, '').replace(/^\[\[|\]\]$/g, '').split('|')[0]!.trim();
const isDate = (v: string | undefined) => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v);
const OWNER: Record<string, string> = { santiago: 'Santiago', jay: 'Jay', shared: 'Both' };

const REL_MAP: [RegExp, string][] = [
  [/investor|angel/i, 'investor'], [/counsel|attorney|legal/i, 'counsel'], [/customer discovery/i, 'customer discovery'],
  [/kol|key opinion/i, 'KOL'], [/clinical advisor|clinician|surgeon/i, 'clinical advisor'], [/payer|reimbursement/i, 'payer'],
  [/hospital/i, 'hospital'], [/vendor|manufactur|supplier/i, 'vendor'], [/consult/i, 'consultant'], [/partner/i, 'partner'],
];
const ORG_MAP: [RegExp, string][] = [
  [/investor|angel|fund\b/i, 'investor'], [/counsel/i, 'counsel'], [/competitor/i, 'competitor'], [/payer/i, 'payer'],
  [/hospital|health system/i, 'hospital system'], [/vendor|supplier|manufactur|wire/i, 'vendor'],
  [/grant|funder|accelerator|incubator/i, 'accelerator or grantor'], [/academic|universit/i, 'academic'],
  [/industry|association|network/i, 'industry'], [/consult/i, 'consultant'],
];
const first = (map: [RegExp, string][], v: string | undefined) => map.find(([r]) => r.test(v ?? ''))?.[1];
const TIER: Record<string, string> = { '1': 'A', '2': 'B', '3': 'C' }; // hub 1 is strongest

export function mapOrg(r: HubRecord): Partial<OrgFull> & { Title: string; ExtId: string } {
  const f = r.fields;
  return {
    Title: r.file.replace(/\.md$/, ''), ExtId: `hub:Companies/${r.file}`, OrgType: first(ORG_MAP, f.relationship),
    Website: f.website && /^https?:\/\//.test(f.website) ? f.website : undefined,
    Aliases: stripAliases(f.aliases), Owner: OWNER[(f.owner ?? '').toLowerCase()] ?? 'Unassigned',
    Sensitivity: f.sensitivity === 'restricted' ? 'restricted' : 'normal',
  };
}

function stripAliases(v: string | undefined) {
  if (!v || v === '[]') return undefined;
  return v.replace(/^\[|\]$/g, '').split(',').map((s) => s.trim().replace(/^"|"$/g, '')).filter(Boolean).join('; ') || undefined;
}

export function mapPerson(r: HubRecord, orgIdByName: Map<string, number>): { fields: Partial<PersonFull> & { Title: string; ExtId: string }; unresolvedOrg?: string; unmappedRelationship?: string } {
  const f = r.fields;
  const orgName = stripLink(f.organization);
  const orgId = orgName ? orgIdByName.get(orgName.toLowerCase()) : undefined;
  const rel = first(REL_MAP, f.relationship);
  const channel = ['warm-intro', 'event', 'inbound', 'cold', 'mutual-network'].includes(f['intro-channel'] ?? '') ? f['intro-channel'] : undefined;
  return {
    fields: {
      Title: r.file.replace(/\.md$/, ''), ExtId: `hub:People/${r.file}`, OrganizationLookupId: orgId, Role: f.role || undefined,
      Email: f.email || undefined, Phone: f.phone || undefined, RelationshipType: rel, IntroChannel: channel,
      IntroDate: isDate(f['intro-date']) ? f['intro-date'] : undefined, Tier: TIER[f.tier ?? ''], LastContactSeed: isDate(f['last-contact']) ? f['last-contact'] : undefined,
      LastContact: isDate(f['last-contact']) ? f['last-contact'] : undefined, Aliases: stripAliases(f.aliases),
      Owner: (OWNER[(f.owner ?? '').toLowerCase()] ?? 'Unassigned') as PersonFull['Owner'], Sensitivity: f.sensitivity === 'restricted' ? 'restricted' : 'normal',
    },
    unresolvedOrg: orgName && !orgId ? orgName : undefined,
    unmappedRelationship: f.relationship && !rel ? 'unmapped' : undefined,
  };
}

/** Import only creates new records and fills blank fields. It never overwrites what a founder has edited. */
export function fillBlanks(existing: Record<string, unknown>, incoming: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(incoming)) if (v !== undefined && (existing[k] === undefined || existing[k] === '')) out[k] = v;
  return out;
}

export interface DryRun { create: number; fill: number; unchanged: number; unresolvedOrgs: number; unmappedRelationships: number; tierConverted: number }

export interface TrelloCard { id: string; name: string; desc?: string; closed?: boolean; idList?: string; url?: string; shortUrl?: string; labels?: { name?: string }[]; due?: string | null }
export interface TrelloExport { cards?: TrelloCard[]; lists?: { id: string; name: string; closed?: boolean }[] }

/** Open Trello cards become Intake items. Done lists and archived cards are skipped. */
export function mapTrello(x: TrelloExport): { items: Record<string, unknown>[]; skipped: number } {
  const lists = new Map((x.lists ?? []).map((l) => [l.id, l]));
  const items: Record<string, unknown>[] = [];
  let skipped = 0;
  for (const c of x.cards ?? []) {
    const l = c.idList ? lists.get(c.idList) : undefined;
    if (c.closed || l?.closed || /^(done|complete|completed|archive)/i.test(l?.name ?? '')) { skipped++; continue; }
    const raw = [c.desc, c.url ?? c.shortUrl, c.due ? `Due ${c.due.slice(0, 10)}` : ''].filter(Boolean).join('\n\n').slice(0, 8000);
    items.push({
      Title: c.name.slice(0, 250), Raw: raw, RawSource: 'Trello import', ReceivedAt: new Date().toISOString(), TriageState: 'New',
      Sensitivity: 'normal', Source: 'Trello import', ExtId: `trello:${c.id}`,
      Labels: (c.labels ?? []).map((t) => t.name).filter(Boolean).join('; ') || undefined,
    });
  }
  return { items, skipped };
}

// Curated Trello dataset (records plus calendar events), staged by a founder-reviewed script. Every row loads as Proposed.
export interface CuratedRow { import_id: string; trello_card_id: string; title_original: string; title_proposed?: string; proposed_home: string; sensitivity: string; flags?: string; note?: string; [k: string]: unknown }
export interface CuratedExport { records?: CuratedRow[]; events?: CuratedRow[] }

const EMAIL_RE = /[\w.+-]+@[\w-]+\.[\w.]+/;
const PHONE_RE = /\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}|\+\d{6,}/;
const HOME_TYPE: Record<string, string> = { Task: 'task', Application: 'application opportunity' };
const PROPOSAL_FIELDS = ['proposed_home', 'kind', 'owner', 'collaborators', 'track', 'subtrack', 'workstream', 'counterparty', 'waiting_on', 'review_date', 'planned_date', 'due_internal', 'external_deadline', 'date_basis', 'review_gates', 'gating', 'event_type', 'who', 'start_date', 'end_date', 'location', 'source_ref'];
export const WITHHELD = 'Withheld (restricted). See the Trello card.';

export interface CuratedMapped { intake: Record<string, unknown>[]; staging: Record<string, unknown>[]; problems: string[] }

/** Pure mapping. Restricted rows get no Raw text and no original title. Any value that looks like deal data or contact data is reported and the row is not loaded. */
export function mapCurated(x: CuratedExport): CuratedMapped {
  const rows = [...(x.records ?? []), ...(x.events ?? [])];
  const intake: Record<string, unknown>[] = [], staging: Record<string, unknown>[] = [], problems: string[] = [];
  const seen = new Set<string>();
  for (const r of rows) {
    const id = r.import_id;
    if (!id || !r.trello_card_id) { problems.push(`${id ?? 'unknown row'}: missing import or card id`); continue; }
    if (seen.has(r.trello_card_id)) { problems.push(`${id}: duplicate card id`); continue; }
    seen.add(r.trello_card_id);
    const restricted = r.sensitivity === 'restricted';
    const bad = Object.entries(r).filter(([k, v]) => k !== 'title_original' && typeof v === 'string' && v && (dealDataProblem(v) || EMAIL_RE.test(v) || PHONE_RE.test(v) || (k !== 'flags' && DENY_PATTERN.test(v))));
    if (restricted && r.note) bad.push(['note', 'restricted row has a note']);
    if (bad.length) { problems.push(`${id}: ${bad.map(([k]) => k).join(', ')}`); continue; }
    const title = (r.title_proposed ?? r.title_original).slice(0, 250);
    const proposal = Object.fromEntries(PROPOSAL_FIELDS.filter((k) => r[k]).map((k) => [k, r[k]]));
    const owner = ['Santiago', 'Jay', 'Both'].includes(String(r.owner)) ? String(r.owner) : 'Unassigned';
    intake.push({
      Title: title, Raw: restricted ? '' : String(r.note ?? ''), RawSource: 'Trello import', ReceivedAt: new Date().toISOString(), TriageState: 'Proposed',
      ProposedType: HOME_TYPE[r.proposed_home], ProposalJson: JSON.stringify(proposal), Rationale: `Imported ${id}; confidence ${r.mapping_confidence ?? 'n/a'}`,
      Sensitivity: restricted ? 'restricted' : 'normal', Owner: owner, Source: 'Trello import', ExtId: `trello:${r.trello_card_id}`,
    });
    staging.push({
      Title: id, ImportId: id, TrelloCardId: r.trello_card_id, TrelloList: r.trello_list, TitleOriginal: restricted ? WITHHELD : r.title_original,
      StatusSuggested: r.status_suggested, OwnerSignals: r.owner_signals, Flags: r.flags || undefined, MappingConfidence: r.mapping_confidence, Sensitivity: restricted ? 'restricted' : 'normal',
    });
  }
  return { intake, staging, problems };
}
