#!/usr/bin/env node
// Imports hub People and Companies notes into the CRM lists. Frontmatter only: a note's body is never parsed or kept.
// Santiago runs this; Claude Code never runs it against the real hub or the real Lists.
//
// Dry run (default; reads the hub, writes one report into a gitignored folder, touches no list):
//   node scripts/crm/import-hub.mjs --hub <hub clone> --out <folder> [--current <folder with the weekly CSV export>] [--shared-owner Santiago|Jay] [--today YYYY-MM-DD]
// Apply (creates only the new rows; needs the report's hash and a Graph token for your own sign-in):
//   GRAPH_TOKEN=<token> node scripts/crm/import-hub.mjs --hub <hub clone> --out <folder> --apply --confirm <hash>
// --out must be outside this repository or inside its gitignored imports/ folder. The report names real records, so it is never printed.
import { closeSync, mkdirSync, openSync, readdirSync, readFileSync, readSync, writeFileSync } from 'node:fs';
import { Buffer } from 'node:buffer';
import { join, resolve } from 'node:path';
import process from 'node:process';
import { URL } from 'node:url';
import { parseRankingConfig } from '../../src/crm/model/config.ts';
import { parseCsv } from '../../src/crm/model/csv.ts';
import { parseFrontmatter } from '../../src/crm/import/frontmatter.ts';
import { applyImportPlan } from '../../src/crm/import/apply.ts';
import { assertConfirm, countPlan, planImport, renderReport } from '../../src/crm/import/plan.ts';
import { orgFromRow, personFromRow } from '../../src/crm/graph/mappers.ts';
import { CRM_ORGANIZATIONS, CRM_PEOPLE } from '../../src/crm/schema.ts';
import { etToday } from '../../src/domain/time.ts';
import { createLiteRepo } from './lib/graph-lite.mjs';

const args = process.argv.slice(2);
const flag = (n) => { const i = args.indexOf(n); return i === -1 ? undefined : args[i + 1]; };
const fail = (m) => { console.error(m); process.exit(2); };

const hub = flag('--hub'), out = flag('--out'), current = flag('--current');
const apply = args.includes('--apply');
const sharedOwner = flag('--shared-owner') ?? 'Santiago';
const today = flag('--today') ?? etToday(new Date());
if (!hub || !out) fail('Usage: node scripts/crm/import-hub.mjs --hub <hub clone> --out <folder> [--current <folder>] [--shared-owner Santiago|Jay] [--apply --confirm <hash>]');
if (!['Santiago', 'Jay'].includes(sharedOwner)) fail('--shared-owner must be Santiago or Jay');
if (!/^\d{4}-\d{2}-\d{2}$/.test(today)) fail('--today must be YYYY-MM-DD');
if (apply && !flag('--confirm')) fail('--apply needs --confirm <hash> from the dry run report. Run the dry run first and read the report.');

const repoRoot = resolve(new URL('../../', import.meta.url).pathname);
const outDir = resolve(out);
if ((outDir === repoRoot || outDir.startsWith(repoRoot + '/')) && !outDir.startsWith(repoRoot + '/imports')) fail('Refusing: --out inside the repository must be under imports/ (gitignored). Use a folder outside the repository.');
if (current && apply) fail('--current is for the dry run only. --apply reads the live Lists.');

/** Reads just the frontmatter block: 4 KB at a time until the closing line, never further. The text after it is dropped unread. */
function readFrontmatter(file) {
  const fd = openSync(file, 'r');
  try {
    let text = '';
    const buf = Buffer.alloc(4096);
    for (let total = 0; total < 65_536;) {
      const n = readSync(fd, buf, 0, buf.length, total);
      if (n === 0) break;
      total += n;
      text += buf.subarray(0, n).toString('utf8');
      const close = text.indexOf('\n---', 3);
      if (close !== -1) return parseFrontmatter(text.slice(0, close + 4));
    }
    return null;
  } finally { closeSync(fd); }
}
function readNotes() {
  const notes = [];
  for (const [dir, kind] of [['People', 'person'], ['Companies', 'company']]) {
    const base = join(hub, 'registers', dir);
    let files;
    try { files = readdirSync(base).filter((f) => f.endsWith('.md')).sort(); } catch { fail(`Not a hub clone: ${base} was not found.`); }
    for (const f of files) { const fields = readFrontmatter(join(base, f)); if (fields) notes.push({ kind, path: `registers/${dir}/${f}`, fields }); }
  }
  return notes;
}
const rows = (file) => { const [head, ...body] = parseCsv(readFileSync(join(current, file), 'utf8')); const ix = (n) => head.indexOf(n); return body.map((r) => (c) => r[ix(c)] ?? ''); };
function currentFromCsv() {
  if (!current) return { orgs: [], people: [] };
  return {
    orgs: rows('organizations.csv').map((get) => ({ id: Number(get('id')), name: get('name'), hubPath: get('hub_path') || undefined })),
    people: rows('people.csv').map((get) => ({ id: Number(get('id')), name: get('name'), email: get('email') || undefined, sourceId: get('source_id') || undefined, orgName: get('organization') || undefined })),
  };
}

const cfg = parseRankingConfig(JSON.parse(readFileSync(new URL('../../config/crm-ranking.json', import.meta.url), 'utf8')));
const notes = readNotes();
let repo, state;
if (apply) {
  const token = process.env.GRAPH_TOKEN;
  if (!token) fail('Set GRAPH_TOKEN to a Graph access token for your own sign-in. See docs/crm/provisioning-checklist.md.');
  const tenant = JSON.parse(readFileSync(new URL('../../config/tenant.json', import.meta.url), 'utf8'));
  repo = createLiteRepo({ token, host: tenant.siteHostname, path: tenant.sitePath });
  try {
    const orgs = (await repo.listAll(CRM_ORGANIZATIONS)).map(orgFromRow);
    const people = (await repo.listAll(CRM_PEOPLE)).map(personFromRow);
    state = { orgs: orgs.map((o) => ({ id: o.id, name: o.name, hubPath: o.hubPath })), people: people.map((p) => ({ id: p.id, name: p.name, email: p.email, sourceId: p.sourceId, orgName: orgs.find((o) => o.id === p.organizationId)?.name })) };
  } catch (e) { console.error(e.message); process.exit(1); }
} else state = currentFromCsv();

const plan = planImport({ notes, current: state, today, sharedOwner }, cfg);
const c = countPlan(plan);
console.log(`Read ${notes.filter((n) => n.kind === 'person').length} people notes and ${notes.filter((n) => n.kind === 'company').length} company notes (frontmatter only). ${apply ? 'Planned against the live Lists.' : current ? 'Planned against the exported CSV.' : 'Planned against empty Lists.'}`);
console.log(`Organizations: ${c.organizations.new} new, ${c.organizations.match} match, ${c.organizations.conflict} conflict, ${c.organizations.skipped} skipped`);
console.log(`People: ${c.people.new} new, ${c.people.match} match, ${c.people.conflict} conflict, ${c.people.skipped} skipped`);
console.log(`New people: ${c.peopleActive} Active, ${c.peopleMapped} Mapped, ${c.peopleRestricted} Restricted; ${c.interactionsToCreate} interactions; ${c.peopleOwnerDefaulted} owners defaulted to ${sharedOwner}`);
console.log(`Hash: ${plan.hash}`);

if (!apply) {
  mkdirSync(outDir, { recursive: true });
  const file = join(outDir, `import-report-${plan.hash}.md`);
  writeFileSync(file, renderReport(plan));
  console.log(`Report written to ${file}. Read it, then add: --apply --confirm ${plan.hash}`);
  process.exit(0);
}
try {
  assertConfirm(plan, flag('--confirm'));
  const independentId = state.orgs.find((o) => o.name === 'Independent')?.id;
  const r = await applyImportPlan(plan, repo, flag('--confirm'), { independentId });
  console.log(`Created ${r.orgs} organizations, ${r.people} people and ${r.interactions} interactions. Run the dry run again: it should show 0 new.`);
} catch (e) {
  console.error(e.message);
  process.exit(e.message.includes('hash') || e.message.includes('--confirm') ? 2 : 1);
}
