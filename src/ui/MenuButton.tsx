import { useEffect, useRef, useState, type ReactNode } from 'react';

/** A button that opens a small menu of links. Arrow keys, Escape and focus return follow the avatar menu. */
export function MenuButton({ label, items, className, children, up = false }: { label: string; items: readonly (readonly [string, string])[]; className?: string; children: ReactNode; up?: boolean }) {
  const [open, setOpen] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const els = () => Array.from(menu.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);
  useEffect(() => {
    if (!open) return;
    els()[0]?.focus();
    const away = (e: MouseEvent) => { if (!menu.current?.contains(e.target as Node) && !btn.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', away);
    return () => document.removeEventListener('mousedown', away);
  }, [open]);
  const close = () => { setOpen(false); btn.current?.focus(); };
  const onKey = (e: React.KeyboardEvent) => {
    const list = els(); const i = list.indexOf(document.activeElement as HTMLElement);
    if (e.key === 'Escape') { e.preventDefault(); close(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); list[(i + 1) % list.length]?.focus(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); list[(i - 1 + list.length) % list.length]?.focus(); }
    else if (e.key === 'Tab') setOpen(false);
  };
  return (
    <div className="relative" onKeyDown={onKey}>
      <button ref={btn} type="button" className={className} aria-haspopup="menu" aria-expanded={open} aria-label={label} onClick={() => setOpen(!open)}>{children}</button>
      {open && (
        <div ref={menu} role="menu" aria-label={label} className={`absolute z-30 w-52 rounded-card border border-hairline bg-surface p-1 shadow-float ${up ? 'bottom-full right-0 mb-2' : 'left-0 mt-2'}`}>
          {items.map(([href, text]) => <a key={href} role="menuitem" tabIndex={-1} className="nav-link" href={href} onClick={() => setOpen(false)}>{text}</a>)}
        </div>
      )}
    </div>
  );
}
