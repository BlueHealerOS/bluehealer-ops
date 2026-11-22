// One-time imports. Parsing and mapping are pure and tested on fictional data; real files are read in the browser only.
import type { OrgFull, PersonFull } from './types';

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
