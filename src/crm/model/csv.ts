import type { CrmPerson, Owner, Stage } from './types.ts';

/** Minimal RFC 4180 parser: quoted fields, doubled quotes, CRLF. Returns rows of cells. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += c;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

const STAGES: Stage[] = ['Mapped', 'Targeted', 'Intro pending', 'Active', 'Dormant', 'Closed', 'Do not contact', 'Identified', 'Contacted', 'Meeting held', 'Following up', 'Committed', 'Passed'];
const COLS = ['name', 'organization', 'relationship type', 'owner', 'importance', 'last two-way date', 'agreed date', 'stage'];
const isDate = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v);

/** Pilot CSV (rank-local.mjs): name, organization, relationship type, owner, importance, last two-way date, agreed date, stage. Throws on bad rows. */
export function peopleFromCsv(text: string): { people: CrmPerson[]; orgNames: Map<number, string> } {
  const [head, ...rows] = parseCsv(text);
  if (!head) throw new Error('The CSV is empty.');
  const idx = COLS.map((c) => head.map((h) => h.trim().toLowerCase()).indexOf(c));
  const missing = COLS.filter((_, i) => idx[i] === -1);
  if (missing.length) throw new Error(`Missing columns: ${missing.join(', ')}`);
  const orgIds = new Map<string, number>();
  const orgNames = new Map<number, string>();
  const people = rows.map((r, n): CrmPerson => {
    const get = (c: string) => (r[idx[COLS.indexOf(c)]!] ?? '').trim();
    const line = n + 2;
    const owner = get('owner'), stage = get('stage'), last = get('last two-way date'), agreed = get('agreed date'), imp = get('importance');
    if (owner !== 'Santiago' && owner !== 'Jay') throw new Error(`Line ${line}: owner must be Santiago or Jay`);
    if (!STAGES.includes(stage as Stage)) throw new Error(`Line ${line}: unknown stage "${stage}"`);
    if (last && !isDate(last)) throw new Error(`Line ${line}: last two-way date must be YYYY-MM-DD`);
    if (agreed && !isDate(agreed)) throw new Error(`Line ${line}: agreed date must be YYYY-MM-DD`);
    if (imp && !/^[1-5]$/.test(imp)) throw new Error(`Line ${line}: importance must be 1 to 5`);
    const org = get('organization') || 'Independent';
    if (!orgIds.has(org)) { orgIds.set(org, orgIds.size + 1); orgNames.set(orgIds.size, org); }
    return {
      id: n + 1, name: get('name'), organizationId: orgIds.get(org)!, relationshipType: get('relationship type'), owner: owner as Owner,
      importance: imp ? Number(imp) : undefined, agreedCheckIn: agreed || undefined, stage: stage as Stage, sensitivity: 'Normal',
      lastTwoWayAt: last || undefined, lastTouchAt: last || undefined,
    };
  });
  return { people, orgNames };
}
