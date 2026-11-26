// Strict reader for the trace front matter subset: `key: value` lines, quoted or plain strings, and flow lists.
// No YAML library, no anchors, no multi-line values. Anything else is rejected with a clear message.
const unquote = (v: string): string => {
  const s = v.trim();
  if (s.startsWith("'") && s.endsWith("'") && s.length >= 2) return s.slice(1, -1).replace(/''/g, "'");
  if (s.startsWith('"') && s.endsWith('"') && s.length >= 2) {
    try { return JSON.parse(s) as string; } catch { throw new Error(`bad quoted value: ${s}`); }
  }
  return s;
};

const splitList = (inner: string): string[] => {
  const out: string[] = []; let cur = ''; let q = '';
  for (const ch of inner) {
    if (q) { cur += ch; if (ch === q) q = ''; }
    else if (ch === '"' || ch === "'") { q = ch; cur += ch; }
    else if (ch === ',') { out.push(cur); cur = ''; }
    else cur += ch;
  }
  if (cur.trim() !== '') out.push(cur);
  return out.map(unquote);
};

export function parseFrontMatter(text: string): { meta: Record<string, string | string[]>; body: string } {
  const src = text.replace(/\r\n/g, '\n');
  if (!src.startsWith('---\n')) throw new Error('missing front matter (file must start with ---)');
  const end = src.indexOf('\n---\n', 4);
  const endAtEof = end === -1 && src.endsWith('\n---');
  if (end === -1 && !endAtEof) throw new Error('front matter is not closed with ---');
  const head = src.slice(4, end === -1 ? src.length - 4 : end);
  const body = end === -1 ? '' : src.slice(end + 5);
  const meta: Record<string, string | string[]> = {};
  for (const line of head.split('\n')) {
    if (line.trim() === '') continue;
    const m = /^([a-z_]+):\s*(.*)$/.exec(line);
    if (!m) throw new Error(`unsupported front matter line: ${line}`);
    const key = m[1]!; const val = m[2]!.trim();
    meta[key] = val.startsWith('[') ? (val.endsWith(']') ? splitList(val.slice(1, -1)) : (() => { throw new Error(`unclosed list for ${key}`); })()) : unquote(val);
  }
  return { meta, body };
}
