"use strict";
const $ = (id) => document.getElementById(id);
const logEl = $('log');
const log = (m) => { logEl.textContent += `${new Date().toISOString().slice(11, 19)} ${m}\n`; };
let dir = null;
let fallbackFiles = [];
const picker = window.showDirectoryPicker;
// ---- capability panel
const caps = [
    ['showDirectoryPicker', typeof picker === 'function'],
    ['FileSystemHandle', 'FileSystemHandle' in window],
    ['createWritable', typeof FileSystemFileHandle !== 'undefined' && 'createWritable' in FileSystemFileHandle.prototype],
    ['indexedDB', 'indexedDB' in window],
    ['webkitdirectory input', 'webkitdirectory' in document.createElement('input')],
    ['secure context', window.isSecureContext],
    ['top-level (not iframe)', window.top === window],
];
$('caps').innerHTML = '<tr><th>Feature</th><th>Present</th></tr>' + caps.map(([k, v]) => `<tr><td>${k}</td><td>${v ? 'yes' : 'NO'}</td></tr>`).join('');
window.addEventListener('error', (e) => log(`page error: ${e.message}`));
window.addEventListener('unhandledrejection', (e) => log(`unhandled: ${String(e.reason)}`));
$('status').textContent = 'spike.js ran';
log(`user agent: ${navigator.userAgent}`);
// ---- IndexedDB handle store
const DB = 'spike', STORE = 'handles';
const idb = () => new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
});
const idbPut = async (v) => { const d = await idb(); await new Promise((res, rej) => { const t = d.transaction(STORE, 'readwrite'); t.objectStore(STORE).put(v, 'dir'); t.oncomplete = () => res(); t.onerror = () => rej(t.error); }); };
const idbGet = async () => { const d = await idb(); return new Promise((res, rej) => { const r = d.transaction(STORE).objectStore(STORE).get('dir'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); };
// ---- folder listing and reading
async function show(handle) {
    dir = handle;
    const ul = $('files');
    ul.textContent = '';
    let firstJson = null;
    for await (const [name, h] of handle.entries()) {
        const li = document.createElement('li');
        li.textContent = `${h.kind}: ${name}`;
        ul.append(li);
        if (!firstJson && h.kind === 'file' && name.endsWith('.json'))
            firstJson = h;
    }
    if (firstJson) {
        $('json').textContent = await (await firstJson.getFile()).text();
        log(`read ${firstJson.name}`);
    }
    else {
        $('json').textContent = '(no .json file in this folder)';
    }
}
async function ensure(handle, mode) {
    if (handle.queryPermission && (await handle.queryPermission({ mode })) === 'granted')
        return true;
    if (handle.requestPermission)
        return (await handle.requestPermission({ mode })) === 'granted';
    return true;
}
$('open').onclick = async () => {
    log('click: Open folder');
    if (!picker) {
        log('showDirectoryPicker missing: use the read-only fallback input');
        return;
    }
    try {
        const h = await picker.call(window, { mode: 'readwrite' });
        log(`picked folder "${h.name}"`);
        await idbPut(h);
        log('handle stored in IndexedDB');
        await show(h);
    }
    catch (e) {
        log(`open failed: ${e.name}: ${e.message}`);
    }
};
$('restore').onclick = async () => {
    try {
        const h = (await idbGet());
        if (!h) {
            log('no remembered handle');
            return;
        }
        log(`got handle "${h.name}" from IndexedDB`);
        const ok = await ensure(h, 'readwrite');
        log(`permission after reload: ${ok ? 'granted' : 'denied'}`);
        if (ok)
            await show(h);
    }
    catch (e) {
        log(`restore failed: ${e.name}: ${e.message}`);
    }
};
const sampleItem = () => ({ schema: 'review/0.1', id: 'R-SPIKE', title: 'Spike item (invented)', status: 'open', checked: false, thread: [], rev: 1, updated: new Date().toISOString() });
$('write').onclick = async () => {
    log('click: Write');
    if (!dir) {
        log('open a folder first');
        return;
    }
    try {
        if (!(await ensure(dir, 'readwrite'))) {
            log('write permission denied');
            return;
        }
        const name = `spike-${Date.now()}.json`;
        const fh = await dir.getFileHandle(name, { create: true });
        const w = await fh.createWritable();
        await w.write(JSON.stringify(sampleItem(), null, 2));
        await w.close();
        log(`WROTE ${name}: OK`);
        await show(dir);
    }
    catch (e) {
        log(`WRITE FAILED (${e.name}: ${e.message}): use Copy or Download instead`);
    }
};
// ---- read-only fallback
$('fallback').onchange = async (ev) => {
    var _a;
    fallbackFiles = Array.from((_a = ev.target.files) !== null && _a !== void 0 ? _a : []);
    const ul = $('files');
    ul.textContent = '';
    for (const f of fallbackFiles) {
        const li = document.createElement('li');
        li.textContent = f.webkitRelativePath || f.name;
        ul.append(li);
    }
    const j = fallbackFiles.find((f) => f.name.endsWith('.json'));
    $('json').textContent = j ? await j.text() : '(no .json file)';
    log(`fallback: read ${fallbackFiles.length} files, read-only`);
};
$('copy').onclick = async () => {
    log('click: Copy');
    const m = $('manual');
    m.value = JSON.stringify([sampleItem()], null, 2);
    m.focus();
    m.select();
    try {
        await navigator.clipboard.writeText(JSON.stringify([sampleItem()], null, 2));
        log('copied review items to clipboard');
    }
    catch (e) {
        log(`clipboard failed: ${e.name}`);
    }
};
$('download').onclick = () => {
    log('click: Download');
    const m = $('manual');
    m.value = JSON.stringify(sampleItem(), null, 2);
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(sampleItem(), null, 2)], { type: 'application/json' }));
    a.download = 'R-SPIKE.json';
    a.click();
    URL.revokeObjectURL(a.href);
    log('download started');
};
// Test hook: lets Playwright drive the same code without the native picker.
window.__spike = { show, idbPut, idbGet };
