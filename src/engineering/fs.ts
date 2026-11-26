// Folder access. The only way file content reaches the Engineering workspace is through a BundleFS:
// a folder the user picked after a gesture (File System Access API) or a read-only file list (fallback).
// Nothing here makes a network request, and nothing from the folder is written to localStorage or logs.

export interface BundleFS {
  readonly name: string;
  readonly writable: boolean;
  /** File and folder names inside `dir` (dot files hidden). `dir` is '' for the bundle root. */
  list(dir: string): Promise<string[]>;
  readText(path: string): Promise<string>;
  readBytes(path: string): Promise<ArrayBuffer>;
  lastModified(path: string): Promise<number | null>;
  writeText(path: string, text: string): Promise<void>;
}

type DirHandle = FileSystemDirectoryHandle & {
  queryPermission?: (d: { mode: 'read' | 'readwrite' }) => Promise<PermissionState>;
  requestPermission?: (d: { mode: 'read' | 'readwrite' }) => Promise<PermissionState>;
  entries(): AsyncIterable<[string, FileSystemHandle]>;
};
type Picker = (o?: { mode?: 'read' | 'readwrite' }) => Promise<DirHandle>;

const parts = (path: string) => path.split('/').filter(Boolean);

async function dirAt(root: DirHandle, path: string, create = false): Promise<DirHandle> {
  let d = root;
  for (const p of parts(path)) d = (await d.getDirectoryHandle(p, { create })) as DirHandle;
  return d;
}
async function fileAt(root: DirHandle, path: string, create = false): Promise<FileSystemFileHandle> {
  const ps = parts(path); const name = ps.pop();
  if (!name) throw new Error('empty path');
  return (await dirAt(root, ps.join('/'), create)).getFileHandle(name, { create });
}

export function handleFS(root: FileSystemDirectoryHandle): BundleFS {
  const r = root as DirHandle;
  return {
    name: r.name, writable: true,
    async list(dir) {
      const out: string[] = [];
      try { for await (const [n] of (await dirAt(r, dir)).entries()) if (!n.startsWith('.')) out.push(n); } catch { return []; }
      return out.sort();
    },
    async readText(path) { return (await (await fileAt(r, path)).getFile()).text(); },
    async readBytes(path) { return (await (await fileAt(r, path)).getFile()).arrayBuffer(); },
    async lastModified(path) { try { return (await (await fileAt(r, path)).getFile()).lastModified; } catch { return null; } },
    async writeText(path, text) {
      const w = await (await fileAt(r, path, true)).createWritable();
      try { await w.write(text); } finally { await w.close(); }
    },
  };
}

/** Read-only fallback for browsers without showDirectoryPicker (from <input webkitdirectory>). */
export function filesFS(files: File[]): BundleFS {
  const rel = (f: File) => (f.webkitRelativePath || f.name).split('/').slice(1).join('/');
  const root = files[0]?.webkitRelativePath.split('/')[0] ?? 'folder';
  const byPath = new Map(files.map((f) => [rel(f), f]));
  const find = (p: string) => { const f = byPath.get(parts(p).join('/')); if (!f) throw new Error(`not found: ${p}`); return f; };
  return {
    name: root, writable: false,
    async list(dir) {
      const prefix = parts(dir).join('/'); const names = new Set<string>();
      for (const p of byPath.keys()) {
        if (prefix && !p.startsWith(prefix + '/')) continue;
        const first = p.slice(prefix ? prefix.length + 1 : 0).split('/')[0]!;
        if (!first.startsWith('.')) names.add(first);
      }
      return [...names].sort();
    },
    async readText(p) { return find(p).text(); },
    async readBytes(p) { return find(p).arrayBuffer(); },
    async lastModified(p) { return find(p).lastModified; },
    async writeText() { throw new Error('This folder was opened read-only.'); },
  };
}

export const canPickFolder = () => typeof (window as unknown as { showDirectoryPicker?: unknown }).showDirectoryPicker === 'function';

export async function pickFolder(): Promise<FileSystemDirectoryHandle> {
  const picker = (window as unknown as { showDirectoryPicker?: Picker }).showDirectoryPicker;
  if (!picker) throw new Error('This browser cannot open a folder for writing.');
  return picker.call(window, { mode: 'readwrite' });
}

// ---- remembered handle (IndexedDB, on this device only)
const DB = 'bh-engineering', STORE = 'handles', KEY = 'bundle';
const idb = () => new Promise<IDBDatabase>((res, rej) => {
  const r = indexedDB.open(DB, 1);
  r.onupgradeneeded = () => r.result.createObjectStore(STORE);
  r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
});
export async function rememberHandle(h: FileSystemDirectoryHandle): Promise<void> {
  const d = await idb();
  await new Promise<void>((res, rej) => { const t = d.transaction(STORE, 'readwrite'); t.objectStore(STORE).put(h, KEY); t.oncomplete = () => res(); t.onerror = () => rej(t.error); });
}
export async function recallHandle(): Promise<FileSystemDirectoryHandle | null> {
  try {
    const d = await idb();
    return await new Promise((res, rej) => { const r = d.transaction(STORE).objectStore(STORE).get(KEY); r.onsuccess = () => res((r.result as FileSystemDirectoryHandle) ?? null); r.onerror = () => rej(r.error); });
  } catch { return null; }
}
export async function forgetHandle(): Promise<void> {
  const d = await idb();
  await new Promise<void>((res, rej) => { const t = d.transaction(STORE, 'readwrite'); t.objectStore(STORE).delete(KEY); t.oncomplete = () => res(); t.onerror = () => rej(t.error); });
}

/** Permission must be asked inside a user gesture. `ask` false only checks. */
export async function hasPermission(h: FileSystemDirectoryHandle, ask: boolean): Promise<boolean> {
  const d = h as DirHandle;
  if (!d.queryPermission) return true;
  if ((await d.queryPermission({ mode: 'readwrite' })) === 'granted') return true;
  return ask && d.requestPermission ? (await d.requestPermission({ mode: 'readwrite' })) === 'granted' : false;
}
