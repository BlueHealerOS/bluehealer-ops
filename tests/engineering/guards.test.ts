import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';
import { CSP } from '../../vite.config';

const eslint = new ESLint();
const lint = async (file: string, code: string) => (await eslint.lintText(code, { filePath: resolve(file) }))[0]!.messages.map((m) => m.ruleId);

describe('no-network lint rule for src/engineering', () => {
  for (const [name, code] of [
    ['fetch', "export const a = () => fetch('/x');\n"],
    ['XMLHttpRequest', 'export const a = new XMLHttpRequest();\n'],
    ['WebSocket', "export const a = new WebSocket('wss://x');\n"],
    ['EventSource', "export const a = new EventSource('/x');\n"],
    ['navigator.sendBeacon', "export const a = () => navigator.sendBeacon('/x');\n"],
    ['window.fetch', "export const a = () => window.fetch('/x');\n"],
    ['innerHTML', "export const a = (e: HTMLElement, t: string) => { e.innerHTML = t; };\n"],
    ['new Function', "export const a = new Function('return 1');\n"],
  ] as const) {
    it(`rejects ${name}`, async () => {
      const ids = await lint('src/engineering/probe.ts', code);
      expect(ids.some((id) => id === 'no-restricted-globals' || id === 'no-restricted-properties' || id === 'no-restricted-syntax')).toBe(true);
    });
  }
  it('rejects dangerouslySetInnerHTML', async () => {
    expect(await lint('src/engineering/probe.tsx', 'export const A = ({ t }: { t: string }) => <div dangerouslySetInnerHTML={{ __html: t }} />;\n')).toContain('no-restricted-syntax');
  });
  it('allows the same call outside src/engineering', async () => {
    expect(await lint('src/graph/probe.ts', "export const a = () => fetch('/x');\n")).not.toContain('no-restricted-globals');
  });
  it('keeps the no-sendMail rule inside src/engineering', async () => {
    expect(await lint('src/engineering/probe.ts', "export const a = 'sendMail';\n")).toContain('no-restricted-syntax');
  });
  it('passes clean engineering code', async () => {
    expect(await lint('src/engineering/probe.ts', 'export const a = (n: number) => n + 1;\n')).toEqual([]);
  });
});

describe('Content Security Policy', () => {
  it('limits sources to this origin and the Microsoft endpoints', () => {
    expect(CSP).toContain("default-src 'self'");
    expect(CSP).toContain("script-src 'self'");
    expect(CSP).not.toMatch(/unsafe-|\*|http:/);
    const connect = /connect-src ([^;]+)/.exec(CSP)![1]!.split(' ');
    expect(connect.sort()).toEqual(["'self'", 'https://graph.microsoft.com', 'https://login.microsoftonline.com']);
    expect(CSP).not.toMatch(/googleapis|gstatic|cdn|unpkg|jsdelivr/);
  });
});

describe('bundle files outside fixtures/ fail the hygiene check', () => {
  const run = (extra: Record<string, string>) => {
    const dir = mkdtempSync(join(tmpdir(), 'hyg-'));
    execFileSync('git', ['init', '-q'], { cwd: dir });
    mkdirSync(join(dir, 'config')); writeFileSync(join(dir, 'config/tenant.json'), '{}');
    for (const [p, c] of Object.entries(extra)) { mkdirSync(join(dir, p, '..'), { recursive: true }); writeFileSync(join(dir, p), c); }
    return spawnSync('node', [resolve('scripts/check-repo-hygiene.mjs')], { cwd: dir, encoding: 'utf8' });
  };
  for (const bad of ['src/model.glb', 'parts/a.step', 'parts/b.stp', 'bundle/review/R-0001.json', 'out/graph.json']) {
    it(`rejects ${bad}`, () => { const r = run({ [bad]: 'x' }); expect(r.status).toBe(1); expect(r.stderr).toContain('only under fixtures/'); });
  }
  it('accepts the same files under fixtures/', () => {
    const r = run({ 'fixtures/x/models/a.glb': 'x', 'fixtures/x/review/R-0001.json': '{}', 'fixtures/x/graph.json': '{}' });
    expect(r.status).toBe(0);
  });
});
