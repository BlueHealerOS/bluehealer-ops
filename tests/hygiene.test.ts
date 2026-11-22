import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const walk = (d: string): string[] => readdirSync(d).flatMap((f) => { const p = join(d, f); return statSync(p).isDirectory() ? walk(p) : [p]; });

describe('source hygiene', () => {
  const files = walk('src').filter((f) => /\.(ts|tsx)$/.test(f));
  it('has no send-mail path anywhere in the app', () => {
    for (const f of files) {
      const text = readFileSync(f, 'utf8');
      expect(/sendMail|\/send\b|\.send\(/i.test(text), f).toBe(false);
    }
  });
  it('never reads mail (Mail.ReadWrite is used for drafts only)', () => {
    for (const f of files) {
      const text = readFileSync(f, 'utf8');
      expect(/\/me\/messages\?|\/me\/mailFolders|\/messages\/\$/.test(text), f).toBe(false);
    }
  });
  it('only talks to Microsoft hosts', () => {
    for (const f of files) {
      for (const m of readFileSync(f, 'utf8').matchAll(/https?:\/\/[a-z0-9.-]+/gi)) {
        expect(/graph\.microsoft\.com|login\.microsoftonline\.com|www\.w3\.org|bluehealeros\.github\.io|outlook\.office|example\./.test(m[0]), `${f}: ${m[0]}`).toBe(true);
      }
    }
  });
});
