/** Reads the YAML frontmatter block of a note: simple `key: value` lines only. Everything after the closing line is ignored. */
export function parseFrontmatter(text: string): Record<string, string> | null {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  if (lines[0]?.trim() !== '---') return null;
  const out: Record<string, string> = {};
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i]!;
    if (line.trim() === '---') return out;
    const kv = line.match(/^([A-Za-z_][A-Za-z0-9_-]*):\s*(.*)$/);
    if (kv) out[kv[1]!] = kv[2]!.trim().replace(/^"(.*)"$/, '$1').replace(/^'(.*)'$/, '$1');
  }
  return null; // no closing line: not a frontmatter block
}
