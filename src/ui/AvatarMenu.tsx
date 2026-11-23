import { useEffect, useRef, useState } from 'react';
import { useOps } from './ctx';

export function AvatarMenu() {
  const { account, founder, signOut } = useOps();
  const [open, setOpen] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const items = () => Array.from(menu.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);
  useEffect(() => {
    if (!open) return;
    items()[0]?.focus();
    const away = (e: MouseEvent) => { if (!menu.current?.contains(e.target as Node) && !btn.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', away);
    return () => document.removeEventListener('mousedown', away);
  }, [open]);
  const close = () => { setOpen(false); btn.current?.focus(); };
  const onKey = (e: React.KeyboardEvent) => {
    const els = items();
    const i = els.indexOf(document.activeElement as HTMLElement);
    if (e.key === 'Escape') { e.preventDefault(); close(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); els[(i + 1) % els.length]?.focus(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); els[(i - 1 + els.length) % els.length]?.focus(); }
    else if (e.key === 'Tab') setOpen(false);
  };
  return (
    <div className="relative" onKeyDown={onKey}>
      <button ref={btn} className="flex h-10 w-10 items-center justify-center rounded-full bg-primary-strong text-sm font-semibold text-white" aria-haspopup="menu" aria-expanded={open} aria-controls="avatar-menu" aria-label={`Account menu, ${founder}`} onClick={() => setOpen(!open)}>
        {founder.slice(0, 1)}
      </button>
      {open && (
        <div ref={menu} id="avatar-menu" role="menu" aria-label="Account" className="absolute right-0 z-30 mt-2 w-64 rounded-card border border-hairline bg-surface p-1 shadow-float">
          <div className="px-3 py-2 text-sm"><div className="font-semibold">{founder}</div><div className="truncate text-xs text-ink-muted">{account.name}</div></div>
          <a role="menuitem" tabIndex={-1} className="nav-link" href="#/settings" onClick={() => setOpen(false)}>Settings</a>
          <button role="menuitem" tabIndex={-1} className="nav-link w-full text-left" onClick={() => { setOpen(false); signOut(); }}>Sign out</button>
        </div>
      )}
    </div>
  );
}
