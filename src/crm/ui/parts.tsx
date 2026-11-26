import { useEffect, useId, useRef, type KeyboardEvent, type ReactNode } from 'react';

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** A modal sheet: a right-hand panel on a laptop, a bottom sheet on a phone. Escape closes it, Tab stays inside, focus returns on close. */
export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    (ref.current?.querySelector<HTMLElement>('[data-autofocus]') ?? ref.current?.querySelector<HTMLElement>(FOCUSABLE))?.focus();
    return () => before?.focus?.();
  }, []);
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') { e.stopPropagation(); onClose(); return; }
    if (e.key !== 'Tab') return;
    const els = [...(ref.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [])];
    const first = els[0], last = els.at(-1);
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
  };
  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 md:items-stretch md:justify-end" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={ref} role="dialog" aria-modal="true" aria-labelledby={titleId} onKeyDown={onKey}
        className="max-h-[92vh] w-full overflow-y-auto rounded-t-card bg-surface p-4 pb-[max(1rem,env(safe-area-inset-bottom))] md:h-full md:max-h-none md:max-w-xl md:rounded-none">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 id={titleId} className="text-lg font-semibold">{title}</h2>
          <button type="button" className="btn" onClick={onClose}>Close</button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Pick({ label, value, options, onChange, blank, id }: { label: string; value: string | number | undefined; options: readonly (string | { value: string | number; label: string })[]; onChange: (v: string) => void; blank?: string; id?: string }) {
  const auto = useId();
  const sid = id ?? auto;
  return (
    <div>
      <label htmlFor={sid} className="mb-1 block text-sm font-medium text-ink">{label}</label>
      <select id={sid} className="input" value={value ?? ''} onChange={(e) => onChange(e.target.value)}>
        {blank !== undefined && <option value="">{blank}</option>}
        {options.map((o) => { const v = typeof o === 'string' ? o : o.value; return <option key={v} value={v}>{typeof o === 'string' ? o : o.label}</option>; })}
      </select>
    </div>
  );
}

export function TextField({ label, value, onChange, type = 'text', hint, ...rest }: { label: string; value: string; onChange: (v: string) => void; type?: string; hint?: string } & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value' | 'type'>) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm font-medium text-ink">{label}</label>
      <input id={id} type={type} className="input" value={value} onChange={(e) => onChange(e.target.value)} {...rest} />
      {hint && <p className="mt-1 text-xs text-ink-muted">{hint}</p>}
    </div>
  );
}

export const Section = ({ id, title, children, aside }: { id: string; title: string; children: ReactNode; aside?: ReactNode }) => (
  <section aria-labelledby={id} className="space-y-2">
    <div className="flex items-baseline justify-between gap-2"><h2 id={id} className="text-base font-semibold">{title}</h2>{aside}</div>
    {children}
  </section>
);

/** Ends a sentence with one period, even when the last word is a name that already ends in one. */
export const end = (s: string) => (s.endsWith('.') ? s : `${s}.`);
export const fmtDate = (d: string | undefined) => (d ? d : 'none');
export const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;
