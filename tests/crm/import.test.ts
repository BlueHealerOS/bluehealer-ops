import { spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { parseFrontmatter } from '../../src/crm/import/frontmatter.ts';
import { applyImportPlan } from '../../src/crm/import/apply.ts';
import { assertConfirm, countPlan, planImport, renderReport, type CurrentState, type HubNote } from '../../src/crm/import/plan.ts';
import { parseCsv } from '../../src/crm/model/csv.ts';
import { loadCrm } from '../../src/crm/service.ts';
import { CRM_INTERACTIONS, CRM_MERGE_LOG } from '../../src/crm/schema.ts';
import { cfg } from './helpers.ts';
import { harnesses, makeGraphHarness } from './repoHelpers.ts';
// @ts-expect-error plain JavaScript helper used by the script
import { createLiteRepo } from '../../scripts/crm/lib/graph-lite.mjs';

const HUB = new URL('../../fixtures/crm/hub-sample/', import.meta.url).pathname;
const SCRIPT = new URL('../../scripts/crm/import-hub.mjs', import.meta.url).pathname;
const expected = JSON.parse(readFileSync(`${HUB}expected-report.json`, 'utf8')) as { today: string; hash: string; organizations: object; people: object; status: Record<string, string>; [k: string]: unknown };

function notes(): HubNote[] {
  const out: HubNote[] = [];
  for (const [dir, kind] of [['People', 'person'], ['Companies', 'company']] as const)
    for (const f of readdirSync(`${HUB}registers/${dir}`).filter((x) => x.endsWith('.md'))) out.push({ kind, path: `registers/${dir}/${f}`, fields: parseFrontmatter(readFileSync(`${HUB}registers/${dir}/${f}`, 'utf8'))! });
  return out;
}
function currentState(): CurrentState {
  const rows = (f: string) => { const [h, ...b] = parseCsv(readFileSync(`${HUB}current/${f}`, 'utf8')); return b.map((r) => (c: string) => r[h!.indexOf(c)] ?? ''); };
  return {
    orgs: rows('organizations.csv').map((g) => ({ id: Number(g('id')), name: g('name'), hubPath: g('hub_path') || undefined })),
    people: rows('people.csv').map((g) => ({ id: Number(g('id')), name: g('name'), email: g('email') || undefined, sourceId: g('source_id') || undefined, orgName: g('organization') || undefined })),
  };
}
const plan = (o: Partial<Parameters<typeof planImport>[0]> = {}) => planImport({ notes: notes(), current: currentState(), today: expected.today, sharedOwner: 'Santiago', ...o }, cfg);

describe('frontmatter', () => {
  it('reads key: value lines up to the closing line and nothing after', () => {
    expect(parseFrontmatter('---\nowner: Jay\nemail: "a@example.com"\naliases: [x, y]\n---\nbody: not read\n')).toEqual({ owner: 'Jay', email: 'a@example.com', aliases: '[x, y]' });
  });
  it('rejects text without a frontmatter block', () => {
    expect(parseFrontmatter('no block')).toBeNull();
    expect(parseFrontmatter('---\nowner: Jay\n')).toBeNull();
  });
});

describe('import plan on the synthetic hub sample', () => {
  const p = plan();
  it('matches the hand-worked report: counts, statuses and hash', () => {
    const c = countPlan(p);
    expect(c.organizations).toEqual(expected.organizations);
    expect(c.people).toEqual(expected.people);
    for (const k of ['peopleActive', 'peopleMapped', 'peopleRestricted', 'interactionsToCreate', 'peopleOwnerDefaulted', 'peopleInIndependent'] as const) expect(c[k], k).toBe(expected[k]);
    expect(Object.fromEntries(p.rows.map((r) => [r.path, r.status]))).toEqual(expected.status);
    expect(p.hash).toBe(expected.hash);
  });
  it('maps fields as agreed in the mapping table', () => {
    const by = (n: string) => p.creates.people.find((x) => x.name === n)!;
    expect(by('Avery New')).toMatchObject({ relationshipType: 'investor', owner: 'Santiago', importance: 5, stage: 'Active', lastContact: '2026-10-01', email: 'avery.new@example.com', sensitivity: 'Normal', sourceId: 'registers/People/Avery New.md' });
    expect(by('Blake Old')).toMatchObject({ relationshipType: 'clinical advisor', importance: 4, stage: 'Mapped' });
    expect(by('Blake Old').lastContact).toBeUndefined();
    expect(by('Casey Shared')).toMatchObject({ owner: 'Santiago', importance: 3, org: { independent: true } }); // shared owner defaults, no tier means 3
    expect(by('Emery Restricted')).toMatchObject({ sensitivity: 'Restricted', relationshipType: 'counsel', stage: 'Active' });
    expect(by('Kai Placeholder').email).toBeUndefined(); // placeholder email ignored
    expect(by('Morgan Family')).toMatchObject({ relationshipType: 'family and friends', importance: 3 }); // tier 4 is not mapped
    expect(by('Avery New').org).toEqual({ hubPath: 'registers/Companies/Example Capital Partners.md' });
    expect(p.creates.orgs.find((o) => o.name === 'Example Capital Partners')).toMatchObject({ orgType: 'investor', relationshipToBH: 'investor', domain: 'examplecapital.example.com' });
    expect(p.creates.orgs.find((o) => o.name === 'Unknown Kind Co')).toMatchObject({ orgType: 'other', relationshipToBH: 'none yet' });
    expect(p.creates.orgs.find((o) => o.name === 'Fixture Devices Inc')!.domain).toBeUndefined();
    expect(p.needsIndependent).toBe(true);
  });
  it('--shared-owner changes who shared and empty owners go to, and the hash', () => {
    const jay = plan({ sharedOwner: 'Jay' });
    expect(jay.creates.people.find((x) => x.name === 'Casey Shared')!.owner).toBe('Jay');
    expect(jay.creates.people.find((x) => x.name === 'Devon Blank')!.owner).toBe('Jay');
    expect(jay.creates.people.find((x) => x.name === 'Avery New')!.owner).toBe('Santiago'); // a named founder is kept
    expect(jay.hash).not.toBe(p.hash);
  });
  it('contact within the last 12 months makes a person Active; a day older does not', () => {
    const note = (d: string): HubNote => ({ kind: 'person', path: 'registers/People/X Test.md', fields: { relationship: 'Advisor', owner: 'Jay', 'last-contact': d } });
    const stageFor = (d: string) => planImport({ notes: [note(d)], current: { orgs: [], people: [] }, today: '2026-11-23', sharedOwner: 'Santiago' }, cfg).creates.people[0]!.stage;
    expect([stageFor('2025-11-23'), stageFor('2025-11-22'), stageFor('2026-11-24')]).toEqual(['Active', 'Mapped', 'Mapped']); // a future date is not a contact
  });
  it('is deterministic, and the report names records but never note bodies', () => {
    expect(plan().hash).toBe(p.hash);
    const report = renderReport(p);
    expect(report).toContain(`add \`--apply --confirm ${p.hash}\``);
    expect(report + JSON.stringify(p)).not.toContain('SENTINEL_BODY_TEXT');
  });
  it('against empty Lists nothing matches', () => {
    const c = countPlan(plan({ current: { orgs: [], people: [] } }));
    expect(c.people.match).toBe(0);
    expect(c.organizations.match).toBe(0);
  });
});

describe('the confirmation hash', () => {
  it('refuses a missing or wrong hash', () => {
    const p = plan();
    expect(() => assertConfirm(p, undefined)).toThrow(/needs --confirm/);
    expect(() => assertConfirm(p, 'deadbeefdeadbeef')).toThrow(/does not match/);
    expect(() => assertConfirm(p, p.hash)).not.toThrow();
  });
});

describe.each(harnesses)('applying the import on the %s', (_n, make) => {
  const empty = { orgs: [], people: [] } as CurrentState;
  it('refuses a wrong hash and writes nothing', async () => {
    const h = await make();
    const p = plan({ current: empty });
    await expect(applyImportPlan(p, h.repo, 'wrong', {})).rejects.toThrow(/does not match/);
    await expect(applyImportPlan(p, h.repo, undefined, {})).rejects.toThrow(/needs --confirm/);
    const d = await loadCrm(h.repo);
    expect([d.orgs.length, d.people.length, d.interactions.length]).toEqual([0, 0, 0]);
  });
  it('creates the new rows only: organizations, people, and one interaction for each Active person', async () => {
    const h = await make();
    const p = plan({ current: empty });
    const r = await applyImportPlan(p, h.repo, p.hash, {});
    expect(r).toEqual({ orgs: p.creates.orgs.length + 1, people: p.creates.people.length, interactions: 3 });
    const d = await loadCrm(h.repo);
    expect(d.orgs.map((o) => o.name).sort()).toContain('Independent');
    expect(d.people).toHaveLength(p.creates.people.length);
    const avery = d.people.find((x) => x.name === 'Avery New')!;
    expect(avery).toMatchObject({ stage: 'Active', importance: 5, lastTwoWayAt: '2026-10-01', lastTouchAt: '2026-10-01', lastDirection: 'two-way', sourceId: 'registers/People/Avery New.md', owner: 'Santiago' });
    expect(d.orgs.find((o) => o.id === avery.organizationId)!.name).toBe('Example Capital Partners');
    expect(d.people.find((x) => x.name === 'Blake Old')).toMatchObject({ stage: 'Mapped' });
    expect(d.people.find((x) => x.name === 'Emery Restricted')!.sensitivity).toBe('Restricted');
    const imported = d.interactions.filter((i) => i.summary === 'Imported last contact');
    expect(imported).toHaveLength(3);
    expect(imported.find((i) => i.peopleIds.includes(avery.id))).toMatchObject({ type: 'email', direction: 'two-way', date: '2026-10-01' });
    expect(imported.find((i) => i.peopleIds.includes(d.people.find((x) => x.name === 'Emery Restricted')!.id))!.sensitivity).toBe('Restricted');
    expect(await h.repo.listAll(CRM_MERGE_LOG)).toHaveLength(0);
    expect((await h.repo.listAll(CRM_INTERACTIONS)).length).toBe(3);
  });
  it('running it again plans against what exists and creates nothing new', async () => {
    const h = await make();
    const first = plan({ current: empty });
    await applyImportPlan(first, h.repo, first.hash, {});
    const d = await loadCrm(h.repo);
    const state: CurrentState = {
      orgs: d.orgs.map((o) => ({ id: o.id, name: o.name, hubPath: o.hubPath })),
      people: d.people.map((x) => ({ id: x.id, name: x.name, email: x.email, sourceId: x.sourceId, orgName: d.orgs.find((o) => o.id === x.organizationId)?.name })),
    };
    const second = plan({ current: state });
    const c = countPlan(second);
    expect(c.people.new).toBe(0);
    expect(c.organizations.new).toBe(0);
    expect(c.people.match).toBeGreaterThanOrEqual(9);
  });
  it('refuses a currency figure in imported text', async () => {
    const h = await make();
    const bad = planImport({ notes: [{ kind: 'person', path: 'registers/People/Pay $5,000 Person.md', fields: { relationship: 'Advisor', owner: 'Jay' } }], current: empty, today: '2026-11-23', sharedOwner: 'Santiago' }, cfg);
    await expect(applyImportPlan(bad, h.repo, bad.hash, {})).rejects.toThrow(/currency/);
  });
});

describe('import-hub.mjs', () => {
  const run = (args: string[], env: Record<string, string> = {}) => spawnSync('node', [SCRIPT, ...args], { encoding: 'utf8', env: { ...process.env, GRAPH_TOKEN: '', ...env } });
  const out = () => mkdtempSync(join(tmpdir(), 'crm-import-'));
  it('a dry run prints only counts and a hash, and writes the report to the output folder', () => {
    const o = out();
    const r = run(['--hub', HUB, '--out', o, '--current', `${HUB}current`, '--today', expected.today]);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('Organizations: 5 new, 1 match, 1 conflict, 1 skipped');
    expect(r.stdout).toContain('People: 9 new, 2 match, 2 conflict, 2 skipped');
    expect(r.stdout).toContain(`Hash: ${expected.hash}`);
    expect(r.stdout).not.toMatch(/Avery|Blake|Casey|SENTINEL/); // names stay in the report file
    const files = readdirSync(o);
    expect(files).toEqual([`import-report-${expected.hash}.md`]);
    const report = readFileSync(join(o, files[0]!), 'utf8');
    expect(report).toContain('Avery New');
    expect(report).not.toContain('SENTINEL_BODY_TEXT');
  });
  it('refuses --apply without --confirm, before reading anything or needing a token', () => {
    const r = run(['--hub', HUB, '--out', out(), '--apply']);
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/--confirm/);
  });
  it('refuses --apply without a Graph token, and --current with --apply', () => {
    expect(run(['--hub', HUB, '--out', out(), '--apply', '--confirm', expected.hash]).stderr).toMatch(/GRAPH_TOKEN/);
    expect(run(['--hub', HUB, '--out', out(), '--apply', '--confirm', 'x', '--current', `${HUB}current`], { GRAPH_TOKEN: 'x' }).status).toBe(2);
  });
  it('refuses an output folder inside the repository unless it is imports/', () => {
    const inside = new URL('../../docs/', import.meta.url).pathname;
    const r = run(['--hub', HUB, '--out', inside]);
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/imports\//);
  });
  it('refuses a folder that is not a hub clone, and a bad owner', () => {
    expect(run(['--hub', tmpdir(), '--out', out()]).status).toBe(2);
    expect(run(['--hub', HUB, '--out', out(), '--shared-owner', 'Nobody']).status).toBe(2);
  });
});

describe('the script\'s Graph helper (graph-lite) against the fake Graph', () => {
  it('lists, creates and applies a full import through the same code the script runs', async () => {
    const h = await makeGraphHarness();
    vi.stubGlobal('fetch', h.raw!.fake.fetchFn);
    try {
      const lite = createLiteRepo({ token: 'test-token', host: 'tenant.example.test', path: '/sites/Ops' });
      const empty: CurrentState = { orgs: [], people: [] };
      const p = plan({ current: empty });
      const r = await applyImportPlan(p, lite, p.hash, {});
      expect(r).toEqual({ orgs: p.creates.orgs.length + 1, people: p.creates.people.length, interactions: 3 });
      const d = await loadCrm(h.repo); // read back through the app's own repository
      expect(d.people.find((x) => x.name === 'Avery New')).toMatchObject({ stage: 'Active', lastTwoWayAt: '2026-10-01', owner: 'Santiago' });
      expect(d.interactions.filter((i) => i.summary === 'Imported last contact')).toHaveLength(3);
      const rows = await lite.listAll('CRM People');
      expect(rows).toHaveLength(p.creates.people.length);
      expect(rows[0]).toMatchObject({ id: expect.any(Number), fields: { Title: expect.any(String) } });
      expect(Object.keys(rows[0]!.fields).some((k: string) => k.startsWith('_'))).toBe(false);
      await expect(lite.create('CRM People', { Title: 'Wants $5,000' })).rejects.toThrow(/currency/);
      await expect(lite.update()).rejects.toThrow(/only lists and creates/);
    } finally { vi.unstubAllGlobals(); }
  });
});
