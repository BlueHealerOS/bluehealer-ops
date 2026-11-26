#!/usr/bin/env node
// Public repository rules: code, docs and fictional fixtures only. Fails on anything that looks like data or a secret.
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const files = execSync('git ls-files --cached --others --exclude-standard', { encoding: 'utf8' }).split('\n').filter(Boolean);
const problems = [];

const FORBIDDEN_NAMES = [/(^|\/)\.env(\..*)?$/, /hub-export.*\.json$/i, /trello.*\.json$/i, /\.(pst|ost|xlsx|xls|docx|pdf|zip)$/i, /(^|\/)(exports|imports|pilot)\//];
// CSV files are allowed only as invented fixtures for the CRM.
const CSV = /\.csv$/i;
const SKIP_TEXT = [/package-lock\.json$/, /\.(svg|png|ico|woff2?)$/];
const ALLOWED_EMAIL = /@([a-z0-9-]+\.)*(example\.(com|org|net|test)|example|test|invalid|localhost)$/i;
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const PHONE = /(?:\+?1[ .-])?\(?\b\d{3}\)?[ .-]\d{3}[ .-]\d{4}\b/g;
const SECRETLIKE = /(client_secret|clientSecret|AccountKey|SharedAccessKey|BEGIN (RSA |EC )?PRIVATE KEY|ghp_[A-Za-z0-9]{20,}|xox[bap]-[A-Za-z0-9-]{10,})/;

// Engineering bundles: models, review items and graphs may exist in the repository only as invented fixtures.
const BUNDLE_FILES = [/\.(glb|gltf|step|stp)$/i, /(^|\/)review\/R-[^/]*\.json$/i, /(^|\/)graph\.json$/i];
for (const f of files) {
  if (!f.startsWith('fixtures/') && BUNDLE_FILES.some((r) => r.test(f))) problems.push(`${f}: bundle files (models, review items, graph.json) are allowed only under fixtures/`);
}

for (const f of files) {
  if (CSV.test(f) && !/^fixtures\/crm\/.+\.csv$/.test(f)) problems.push(`${f}: CSV files are allowed only under fixtures/crm/`);
  if (FORBIDDEN_NAMES.some((r) => r.test(f))) problems.push(`${f}: file type or name is not allowed in this repository`);
  if (SKIP_TEXT.some((r) => r.test(f))) continue;
  let text;
  try { text = readFileSync(f, 'utf8'); } catch { continue; }
  if (f === 'scripts/check-repo-hygiene.mjs') continue;
  for (const m of text.matchAll(EMAIL)) if (!ALLOWED_EMAIL.test(m[0]) && !/^intake@<tenant-domain>/.test(m[0])) problems.push(`${f}: real-looking email address ${m[0]}`);
  for (const m of text.matchAll(PHONE)) if (!/\b555[ .-]01\d\d\b/.test(m[0])) problems.push(`${f}: phone-like number ${m[0]}`);
  if (SECRETLIKE.test(text)) problems.push(`${f}: secret-like text. This design has no secrets; stop and ask.`);
}

// Tenant config may hold identifiers only.
const tenant = JSON.parse(readFileSync('config/tenant.json', 'utf8'));
const allowedKeys = new Set(['_comment', 'tenantId', 'clientId', 'siteHostname', 'sitePath', 'redirectUri']);
for (const k of Object.keys(tenant)) if (!allowedKeys.has(k)) problems.push(`config/tenant.json: unexpected key ${k}`);

if (problems.length) {
  console.error('Repository hygiene check failed:\n' + problems.map((p) => ' - ' + p).join('\n'));
  process.exit(1);
}
console.log(`Repository hygiene check passed (${files.length} files).`);
