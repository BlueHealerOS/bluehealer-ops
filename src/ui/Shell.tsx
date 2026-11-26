import { useEffect, type ReactNode } from 'react';
import { useOps } from './ctx';
import { Sidebar } from './Sidebar';
import { TabBar } from './TabBar';
import { TopBar } from './TopBar';

export function Shell({ children }: { children: ReactNode }) {
  const { quickAdd } = useOps();
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el.closest('input, textarea, select, [contenteditable]') || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === 'n') { e.preventDefault(); quickAdd(); }
      if (e.key === '/') { e.preventDefault(); document.getElementById('global-search')?.focus(); }
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [quickAdd]);
  return (
    <div className="min-h-screen">
      <a href="#main" onClick={(e) => { e.preventDefault(); const m = document.getElementById('main'); m?.focus(); m?.scrollIntoView(); }} className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded-control focus:bg-surface focus:px-3 focus:py-2">Skip to content</a>
      <TopBar />
      <div className="md:flex">
        <Sidebar />
        <main id="main" tabIndex={-1} className="mx-auto w-full min-w-0 max-w-6xl flex-1 p-4 pb-24 md:p-6 md:pb-8">{children}</main>
      </div>
      <TabBar />
    </div>
  );
}
