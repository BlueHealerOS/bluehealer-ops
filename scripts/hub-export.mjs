#!/usr/bin/env node
// Run locally against a clone of the hub. Writes frontmatter only (no note bodies) to a file you choose.
// Never write the output inside this repository. Usage: node scripts/hub-export.mjs <hub-dir> <output.json>
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { execSync } from 'node:child_process';
import process from 'node:process';

const [hub, out] = process.argv.slice(2);
if (!hub || !out) { console.error('Usage: node scripts/hub-export.mjs <hub-dir> <output.json>'); process.exit(2); }
const repoRoot = execSync('git rev-parse --show-toplevel', { encoding: 'utf8' }).trim();
if (resolve(out).startsWith(repoRoot)) { console.error('Refusing to write the export inside the repository.'); process.exit(2); }

const records = [];
for (const [dir, kind] of [['People', 'person'], ['Companies', 'company']]) {
  const base = join(hub, 'registers', dir);
  for (const file of readdirSync(base).filter((f) => f.endsWith('.md'))) {
    const m = readFileSync(join(base, file), 'utf8').match(/^---\n([\s\S]*?)\n---/);
    if (!m) continue;
    const fields = {};
    for (const line of m[1].split('\n')) {
      const kv = line.match(/^([A-Za-z_-]+):\s*(.*)$/);
      if (kv) fields[kv[1]] = kv[2].trim();
    }
    if (fields.type === 'moc' || file.startsWith('MOC')) continue;
    records.push({ kind, file, fields });
  }
}
writeFileSync(out, JSON.stringify(records));
console.log(`Wrote ${records.length} records to ${out}`);
