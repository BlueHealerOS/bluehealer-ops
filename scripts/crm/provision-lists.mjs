#!/usr/bin/env node
// Creates the four CRM lists on the founders-only site. Santiago runs this; Claude Code never does.
// Dry run by default: only GET requests, prints what would be created. Nothing is ever deleted, renamed or edited,
// and only lists named "CRM ..." are considered, so the Phase 1 lists are never touched.
//
// Usage:
//   GRAPH_TOKEN=<token> node scripts/crm/provision-lists.mjs                        dry run
//   GRAPH_TOKEN=<token> node scripts/crm/provision-lists.mjs --apply --confirm <v>  create (v = schema version the dry run printed)
//   node scripts/crm/provision-lists.mjs --version                                  print the schema version, no network
// The token is a Microsoft Graph access token for the signed-in founder with Sites.Selected write on the site (see docs/crm/provisioning-checklist.md).
import { readFileSync } from 'node:fs';
import process from 'node:process';
import { URL } from 'node:url';
import { CRM_LISTS } from '../../src/crm/schema.ts';
import { schemaHash, validateSchema } from '../../src/schema/lists.ts';
import { applyProvision, planProvision } from '../../src/provision/provision.ts';

const args = process.argv.slice(2);
const flag = (n) => { const i = args.indexOf(n); return i === -1 ? undefined : args[i + 1]; };
const version = schemaHash(CRM_LISTS);
const fail = (m) => { console.error(m); process.exit(2); };

if (args.includes('--version')) { console.log(version); process.exit(0); }
const problems = validateSchema(CRM_LISTS);
if (problems.length) fail(`The CRM schema is invalid:\n${problems.join('\n')}`);
if (CRM_LISTS.some((l) => !l.name.startsWith('CRM '))) fail('Refusing: every list name must start with "CRM ".');

const apply = args.includes('--apply');
if (apply && flag('--confirm') !== version) fail(`--apply needs --confirm ${version}. Run the dry run first and read what it prints.`);
const token = process.env.GRAPH_TOKEN;
if (!token) fail('Set GRAPH_TOKEN to a Graph access token for the signed-in founder. See docs/crm/provisioning-checklist.md.');

const tenant = JSON.parse(readFileSync(new URL('../../config/tenant.json', import.meta.url), 'utf8'));
const [host, path] = (flag('--site') ?? `${tenant.siteHostname}:${tenant.sitePath}`).split(':');
if (!/^[a-z0-9.-]+\.sharepoint\.com$/i.test(host ?? '') || !path?.startsWith('/sites/')) fail('--site must look like tenant.sharepoint.com:/sites/Name');

const BASE = 'https://graph.microsoft.com/v1.0';
async function request(method, pathOrUrl, opts = {}) {
  const url = pathOrUrl.startsWith('http') ? pathOrUrl : BASE + pathOrUrl;
  if (!url.startsWith(BASE + '/')) throw new Error('Refusing a request outside Microsoft Graph.');
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, {
      method,
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', ...(opts.body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
      ...(opts.body !== undefined ? { body: JSON.stringify(opts.body) } : {}),
    });
    if (res.ok) return res.status === 204 ? undefined : res.json();
    if ((res.status === 429 || res.status === 503) && attempt < 5) { await new Promise((r) => setTimeout(r, (Number(res.headers.get('Retry-After')) || 2 ** attempt) * 1000)); continue; }
    let msg = res.statusText;
    try { msg = (await res.json()).error?.message ?? msg; } catch { /* not JSON */ }
    throw new Error(`${method} ${url.replace(BASE, '')} failed: ${res.status} ${msg}`);
  }
}
async function getAll(p) {
  const out = [];
  for (let next = p; next;) { const page = await request('GET', next); out.push(...page.value); next = page['@odata.nextLink']; }
  return out;
}
const client = { request, getAll };

try {
  const site = await request('GET', `/sites/${host}:${path}?$select=id`);
  const plan = await planProvision(client, site.id, CRM_LISTS);
  console.log(`CRM schema version ${version}. Site ${host}:${path}.\n`);
  for (const l of plan.lists) {
    console.log(l.create ? `  create list ${l.list.name} with ${l.list.columns.length} columns` : `  list ${l.list.name} exists: ${l.missingColumns.length} columns and ${l.missingChoices.length} choice sets to add`);
  }
  console.log(`\n${plan.changes} change(s) planned.`);
  if (!apply) { console.log(`Dry run only. To create: --apply --confirm ${version}`); process.exit(0); }
  await applyProvision(client, plan, (m) => console.log(`  ${m}`));
  console.log('Done. Run the dry run again: it should report 0 changes.');
} catch (e) {
  console.error(e.message);
  process.exit(1);
}
