import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { canPickFolder, filesFS, forgetHandle, handleFS, hasPermission, pickFolder, recallHandle, rememberHandle, type BundleFS } from './fs';
import { loadBundle, watchSignature } from './load';
import type { Bundle } from './types';

export type Phase = 'idle' | 'loading' | 'ready' | 'error' | 'needs-permission';
export interface Session {
  phase: Phase; fs: BundleFS | null; bundle: Bundle | null; error: string | null; folderName: string | null;
  canPick: boolean;
  openFolder: () => Promise<void>;
  openFiles: (files: File[]) => Promise<void>;
  reconnect: () => Promise<void>;
  reload: () => Promise<void>;
  forget: () => Promise<void>;
}

const Ctx = createContext<Session | null>(null);
export const useEngineering = (): Session => {
  const v = useContext(Ctx);
  if (!v) throw new Error('EngineeringProvider missing');
  return v;
};

const POLL_MS = 3000;

/**
 * Holds the opened folder and the loaded bundle. Nothing is read, and IndexedDB is not touched,
 * until the Engineering workspace is shown for the first time (`active`).
 */
export function EngineeringProvider({ active, children }: { active: boolean; children: ReactNode }) {
  const [s, setS] = useState<{ phase: Phase; fs: BundleFS | null; bundle: Bundle | null; error: string | null; folderName: string | null }>({ phase: 'idle', fs: null, bundle: null, error: null, folderName: null });
  const signature = useRef('');
  const pending = useRef<FileSystemDirectoryHandle | null>(null);
  const started = useRef(false);

  const load = useCallback(async (fs: BundleFS) => {
    try {
      const bundle = await loadBundle(fs);
      signature.current = await watchSignature(fs);
      setS({ phase: 'ready', fs, bundle, error: null, folderName: fs.name });
    } catch (e) {
      setS({ phase: 'error', fs, bundle: null, error: (e as Error).message, folderName: fs.name });
    }
  }, []);

  useEffect(() => {
    if (!active || started.current) return;
    started.current = true;
    void (async () => {
      const h = await recallHandle();
      if (!h) return;
      if (await hasPermission(h, false).catch(() => false)) { setS((x) => ({ ...x, phase: 'loading', folderName: h.name })); await load(handleFS(h)); }
      else { pending.current = h; setS((x) => ({ ...x, phase: 'needs-permission', folderName: h.name })); }
    })();
  }, [active, load]);

  // Poll the files the tab watches every 3 seconds while the tab is visible, and when the window gains focus.
  const fs = s.fs; const writable = !!s.fs?.writable;
  useEffect(() => {
    if (!active || s.phase !== 'ready' || !fs || !writable) return;
    const tick = async () => {
      if (document.visibilityState !== 'visible') return;
      try { if ((await watchSignature(fs)) !== signature.current) await load(fs); } catch { /* folder went away; the next manual reload explains */ }
    };
    const id = window.setInterval(() => void tick(), POLL_MS);
    window.addEventListener('focus', tick);
    return () => { window.clearInterval(id); window.removeEventListener('focus', tick); };
  }, [active, s.phase, fs, writable, load]);

  const api = useMemo<Session>(() => ({
    ...s, canPick: canPickFolder(),
    async openFolder() {
      try {
        const h = await pickFolder();
        setS((x) => ({ ...x, phase: 'loading', folderName: h.name }));
        await rememberHandle(h).catch(() => { /* remembering is a convenience */ });
        await load(handleFS(h));
      } catch (e) {
        if ((e as Error).name === 'AbortError') return;
        setS((x) => ({ ...x, phase: 'error', error: (e as Error).message }));
      }
    },
    async openFiles(files) {
      if (files.length === 0) return;
      setS((x) => ({ ...x, phase: 'loading', folderName: files[0]?.webkitRelativePath.split('/')[0] ?? null }));
      await load(filesFS(files));
    },
    async reconnect() {
      const h = pending.current;
      if (!h) return;
      if (await hasPermission(h, true)) { pending.current = null; await load(handleFS(h)); }
      else setS((x) => ({ ...x, error: 'Permission to the folder was not granted.' }));
    },
    async reload() { if (s.fs) await load(s.fs); },
    async forget() { await forgetHandle().catch(() => undefined); pending.current = null; signature.current = ''; setS({ phase: 'idle', fs: null, bundle: null, error: null, folderName: null }); },
  }), [s, load]);

  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}
