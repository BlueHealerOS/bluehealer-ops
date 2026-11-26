import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { BundleFS } from '../../src/engineering/fs';

/** In-memory folder for unit tests. */
export function memoryFS(files: Record<string, string>, writable = true): BundleFS & { files: Record<string, string>; stamps: Record<string, number> } {
  const stamps: Record<string, number> = Object.fromEntries(Object.keys(files).map((k) => [k, 1]));
  const clean = (p: string) => p.split('/').filter(Boolean).join('/');
  return {
    files, stamps, name: 'memory', writable,
    async list(dir) {
      const pre = clean(dir); const out = new Set<string>();
      for (const k of Object.keys(files)) { if (pre && !k.startsWith(pre + '/')) continue; const n = k.slice(pre ? pre.length + 1 : 0).split('/')[0]!; if (!n.startsWith('.')) out.add(n); }
      return [...out].sort();
    },
    async readText(p) { const v = files[clean(p)]; if (v === undefined) throw new Error('not found'); return v; },
    async readBytes() { return new ArrayBuffer(0); },
    async lastModified(p) { return stamps[clean(p)] ?? null; },
    async writeText(p, t) { if (!writable) throw new Error('read-only'); files[clean(p)] = t; stamps[clean(p)] = (stamps[clean(p)] ?? 0) + 1; },
  };
}

/** Loads a real folder from disk into a memoryFS (used with fixtures/dummy-bracket). */
export function fixtureFS(dir = 'fixtures/dummy-bracket') {
  const files: Record<string, string> = {};
  const walk = (d: string, rel = '') => {
    for (const n of readdirSync(d)) {
      const full = join(d, n);
      if (statSync(full).isDirectory()) walk(full, rel + n + '/');
      else if (!n.endsWith('.glb')) files[rel + n] = readFileSync(full, 'utf8');
    }
  };
  walk(dir);
  return memoryFS(files);
}

export const writeTree = (root: string, files: Record<string, string>) => {
  for (const [k, v] of Object.entries(files)) { mkdirSync(dirname(join(root, k)), { recursive: true }); writeFileSync(join(root, k), v); }
};
