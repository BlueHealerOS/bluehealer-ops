import type { ReactNode } from 'react';

export function Select({ label, value, options, onChange, blank }: { label: string; value: string | undefined; options: readonly string[]; onChange: (v: string) => void; blank?: boolean }) {
  const id = `sel-${label.replace(/\W+/g, '-').toLowerCase()}`;
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm font-medium text-slate-800">{label}</label>
      <select id={id} className="input" value={value ?? ''} onChange={(e) => onChange(e.target.value)}>
        {blank && <option value="">None</option>}
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="rounded-md border border-dashed border-slate-300 p-6 text-center text-sm text-slate-700">{children}</p>;
}

export function Loading({ what }: { what: string }) { return <p role="status" className="p-4 text-sm text-slate-700">Loading {what}…</p>; }
