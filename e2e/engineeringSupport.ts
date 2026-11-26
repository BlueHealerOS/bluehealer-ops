import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { Page } from '@playwright/test';

export const FIXTURE = 'fixtures/dummy-bracket';

/** Every file of a folder on disk as {path, base64}. */
export function readTree(dir = FIXTURE): { path: string; b64: string }[] {
  const out: { path: string; b64: string }[] = [];
  const walk = (d: string, rel = '') => {
    for (const n of readdirSync(d)) {
      const full = join(d, n);
      if (statSync(full).isDirectory()) walk(full, rel + n + '/');
      else out.push({ path: rel + n, b64: readFileSync(full).toString('base64') });
    }
  };
  walk(dir);
  return out;
}

export const sha256 = (b64: string) => createHash('sha256').update(Buffer.from(b64, 'base64')).digest('hex');

/** Replaces the native folder picker with one that returns an origin-private folder holding a copy of the bundle. */
export async function installFolder(page: Page, files = readTree()) {
  await page.evaluate(async (list) => {
    const root = await navigator.storage.getDirectory();
    try { await root.removeEntry('bundle', { recursive: true }); } catch { /* none yet */ }
    const base = await root.getDirectoryHandle('bundle', { create: true });
    for (const f of list) {
      const parts = f.path.split('/'); const name = parts.pop()!;
      let d = base;
      for (const p of parts) d = await d.getDirectoryHandle(p, { create: true });
      const w = await (await d.getFileHandle(name, { create: true })).createWritable();
      await w.write(Uint8Array.from(atob(f.b64), (c) => c.charCodeAt(0))); await w.close();
    }
    (window as unknown as { showDirectoryPicker: () => Promise<FileSystemDirectoryHandle> }).showDirectoryPicker = async () => (await navigator.storage.getDirectory()).getDirectoryHandle('bundle');
  }, files);
}

export const readFile = (page: Page, path: string) => page.evaluate(async (p) => {
  let d = await (await navigator.storage.getDirectory()).getDirectoryHandle('bundle');
  const parts = p.split('/'); const name = parts.pop()!;
  for (const x of parts) d = await d.getDirectoryHandle(x);
  return (await (await d.getFileHandle(name)).getFile()).text();
}, path);

export const writeFile = (page: Page, path: string, content: string | { b64: string }) => page.evaluate(async ([p, c]) => {
  let d = await (await navigator.storage.getDirectory()).getDirectoryHandle('bundle');
  const parts = (p as string).split('/'); const name = parts.pop()!;
  for (const x of parts) d = await d.getDirectoryHandle(x, { create: true });
  const w = await (await d.getFileHandle(name, { create: true })).createWritable();
  await w.write(typeof c === 'string' ? c : Uint8Array.from(atob((c as { b64: string }).b64), (ch) => ch.charCodeAt(0))); await w.close();
}, [path, content] as const);
