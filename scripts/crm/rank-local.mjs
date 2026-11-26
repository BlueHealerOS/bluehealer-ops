#!/usr/bin/env node
// Ranking pilot. Reads one CSV, runs the same functions the app uses, prints the top 10 due and the upcoming list.
// Writes nothing and makes no network calls. Keep the CSV in the gitignored pilot/ folder, never in the repository.
// Usage: node scripts/crm/rank-local.mjs <people.csv> [--today YYYY-MM-DD] [--owner Santiago|Jay]
// The CSV has no sensitivity column, so leave Restricted people out of it.
// Columns: name, organization, relationship type, owner, importance, last two-way date, agreed date, stage
import { readFileSync } from 'node:fs';
import process from 'node:process';
import { URL } from 'node:url';
import { peopleFromCsv } from '../../src/crm/model/csv.ts';
import { parseRankingConfig } from '../../src/crm/model/config.ts';
import { rankToday } from '../../src/crm/model/ranking.ts';
import { etToday } from '../../src/domain/time.ts';

const args = process.argv.slice(2);
const flag = (n) => { const i = args.indexOf(n); return i === -1 ? undefined : args[i + 1]; };
const file = args.find((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1]?.startsWith('--')));
if (!file) { console.error('Usage: node scripts/crm/rank-local.mjs <people.csv> [--today YYYY-MM-DD] [--owner Santiago|Jay]'); process.exit(2); }

const today = flag('--today') ?? etToday(new Date());
const owner = flag('--owner') ?? 'both';
if (!/^\d{4}-\d{2}-\d{2}$/.test(today)) { console.error('--today must be YYYY-MM-DD'); process.exit(2); }
if (!['both', 'Santiago', 'Jay'].includes(owner)) { console.error('--owner must be Santiago or Jay'); process.exit(2); }

let people, orgNames;
try { ({ people, orgNames } = peopleFromCsv(readFileSync(file, 'utf8'))); } catch (e) { console.error(e.message); process.exit(1); }
const cfg = parseRankingConfig(JSON.parse(readFileSync(new URL('../../config/crm-ranking.json', import.meta.url), 'utf8')));

const r = rankToday(people, today, cfg, { owner });
const org = (p) => orgNames.get(p.organizationId) ?? '';
console.log(`Ranking v${cfg.version} for ${today} (${owner === 'both' ? 'both founders' : owner}). ${people.length} people, ${r.due.length} due.\n`);
console.log('Top 10 due');
r.due.slice(0, 10).forEach((x, i) => console.log(`${String(i + 1).padStart(2)}. ${x.person.name} (${org(x.person)}, ${x.person.owner}) score ${x.score}\n    ${x.reason}`));
if (!r.due.length) console.log('    none');
console.log('\nUpcoming, next 14 days');
r.upcoming.forEach((x) => console.log(`    ${x.nextCheckIn}  ${x.person.name} (${org(x.person)})`));
if (!r.upcoming.length) console.log('    none');
console.log('\nThe CSV has no sensitivity column: leave Restricted people out of it.');
