// Throwaway spike: folder access with the File System Access API, and the read-only fallback.
// No network requests. Nothing from the folder is stored except the handle (IndexedDB).
type DirHandle = FileSystemDirectoryHandle & {
  queryPermission?: (d: { mode: 'read' | 'readwrite' }) => Promise<PermissionState>;
  requestPermission?: (d: { mode: 'read' | 'readwrite' }) => Promise<PermissionState>;
};
type Picker = (o?: { mode?: 'read' | 'readwrite' }) => Promise<DirHandle>;

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const logEl = $('log');
const log = (m: string) => { logEl.textContent += `${new Date().toISOString().slice(11, 19)} ${m}\n`; };

let dir: DirHandle | null = null;
let fallbackFiles: File[] = [];
const picker = (window as unknown as { showDirectoryPicker?: Picker }).showDirectoryPicker;

// ---- capability panel
const caps: [string, boolean][] = [
  ['showDirectoryPicker', typeof picker === 'function'],
  ['FileSystemHandle', 'FileSystemHandle' in window],
  ['createWritable', typeof FileSystemFileHandle !== 'undefined' && 'createWritable' in FileSystemFileHandle.prototype],
  ['indexedDB', 'indexedDB' in window],
  ['webkitdirectory input', 'webkitdirectory' in document.createElement('input')],
  ['secure context', window.isSecureContext],
  ['top-level (not iframe)', window.top === window],
];
$('caps').innerHTML = '<tr><th>Feature</th><th>Present</th></tr>' + caps.map(([k, v]) => `<tr><td>${k}</td><td>${v ? 'yes' : 'NO'}</td></tr>`).join('');
log(`user agent: ${navigator.userAgent}`);

// ---- IndexedDB handle store
const DB = 'spike', STORE = 'handles';
const idb = () => new Promise<IDBDatabase>((res, rej) => {
  const r = indexedDB.open(DB, 1);
  r.onupgradeneeded = () => r.result.createObjectStore(STORE);
  r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
});
const idbPut = async (v: unknown) => { const d = await idb(); await new Promise<void>((res, rej) => { const t = d.transaction(STORE, 'readwrite'); t.objectStore(STORE).put(v, 'dir'); t.oncomplete = () => res(); t.onerror = () => rej(t.error); }); };
const idbGet = async () => { const d = await idb(); return new Promise<unknown>((res, rej) => { const r = d.transaction(STORE).objectStore(STORE).get('dir'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); };

// ---- folder listing and reading
async function show(handle: DirHandle) {
  dir = handle;
  const ul = $('files'); ul.textContent = '';
  let firstJson: FileSystemFileHandle | null = null;
  for await (const [name, h] of (handle as unknown as { entries(): AsyncIterable<[string, FileSystemHandle]> }).entries()) {
    const li = document.createElement('li'); li.textContent = `${h.kind}: ${name}`; ul.append(li);
    if (!firstJson && h.kind === 'file' && name.endsWith('.json')) firstJson = h as FileSystemFileHandle;
  }
  if (firstJson) { $('json').textContent = await (await firstJson.getFile()).text(); log(`read ${firstJson.name}`); }
  else { $('json').textContent = '(no .json file in this folder)'; }
}

async function ensure(handle: DirHandle, mode: 'read' | 'readwrite') {
  if (handle.queryPermission && (await handle.queryPermission({ mode })) === 'granted') return true;
  if (handle.requestPermission) return (await handle.requestPermission({ mode })) === 'granted';
  return true;
}

$('open').onclick = async () => {
  if (!picker) { log('showDirectoryPicker missing: use the read-only fallback input'); return; }
  try {
    const h = await picker.call(window, { mode: 'readwrite' });
    log(`picked folder "${h.name}"`);
    await idbPut(h); log('handle stored in IndexedDB');
    await show(h);
  } catch (e) { log(`open failed: ${(e as Error).name}: ${(e as Error).message}`); }
};

$('restore').onclick = async () => {
  try {
    const h = (await idbGet()) as DirHandle | undefined;
    if (!h) { log('no remembered handle'); return; }
    log(`got handle "${h.name}" from IndexedDB`);
    const ok = await ensure(h, 'readwrite');
    log(`permission after reload: ${ok ? 'granted' : 'denied'}`);
    if (ok) await show(h);
  } catch (e) { log(`restore failed: ${(e as Error).name}: ${(e as Error).message}`); }
};

const sampleItem = () => ({ schema: 'review/0.1', id: 'R-SPIKE', title: 'Spike item (invented)', status: 'open', checked: false, thread: [], rev: 1, updated: new Date().toISOString() });

$('write').onclick = async () => {
  if (!dir) { log('open a folder first'); return; }
  try {
    if (!(await ensure(dir, 'readwrite'))) { log('write permission denied'); return; }
    const name = `spike-${Date.now()}.json`;
    const fh = await dir.getFileHandle(name, { create: true });
    const w = await fh.createWritable();
    await w.write(JSON.stringify(sampleItem(), null, 2)); await w.close();
    log(`WROTE ${name}: OK`);
    await show(dir);
  } catch (e) { log(`WRITE FAILED (${(e as Error).name}: ${(e as Error).message}): use Copy or Download instead`); }
};

// ---- read-only fallback
$<HTMLInputElement>('fallback').onchange = async (ev) => {
  fallbackFiles = Array.from((ev.target as HTMLInputElement).files ?? []);
  const ul = $('files'); ul.textContent = '';
  for (const f of fallbackFiles) { const li = document.createElement('li'); li.textContent = f.webkitRelativePath || f.name; ul.append(li); }
  const j = fallbackFiles.find((f) => f.name.endsWith('.json'));
  $('json').textContent = j ? await j.text() : '(no .json file)';
  log(`fallback: read ${fallbackFiles.length} files, read-only`);
};

$('copy').onclick = async () => {
  try { await navigator.clipboard.writeText(JSON.stringify([sampleItem()], null, 2)); log('copied review items to clipboard'); }
  catch (e) { log(`clipboard failed: ${(e as Error).name}`); }
};
$('download').onclick = () => {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(sampleItem(), null, 2)], { type: 'application/json' }));
  a.download = 'R-SPIKE.json'; a.click(); URL.revokeObjectURL(a.href); log('download started');
};

// Test hook: lets Playwright drive the same code without the native picker.
(window as unknown as { __spike: unknown }).__spike = { show, idbPut, idbGet };
