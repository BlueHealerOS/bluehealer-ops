import { useEffect, useRef, useState } from 'react';
import { useTaskActions } from './data';

/** One field, Enter to save. Creates an Inbox task for the signed-in founder. */
export function QuickAdd({ onClose }: { onClose: () => void }) {
  const [title, setTitle] = useState('');
  const [error, setError] = useState<string>();
  const ref = useRef<HTMLInputElement>(null);
  const { save } = useTaskActions();
  useEffect(() => ref.current?.focus(), []);
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center" role="presentation" onClick={onClose}>
      <form role="dialog" aria-modal="true" aria-label="Quick add" className="card w-full max-w-md space-y-3" onClick={(e) => e.stopPropagation()}
        onSubmit={async (e) => {
          e.preventDefault();
          if (!title.trim()) return;
          try { await save.mutateAsync({ id: null, fields: { Title: title.trim(), Status: 'Inbox' } }); onClose(); }
          catch (err) { setError((err as Error).message); }
        }}>
        <label htmlFor="qa" className="block text-sm font-medium">Quick add to Inbox</label>
        <input id="qa" ref={ref} className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="What needs to happen?" />
        {error && <p role="alert" className="text-sm text-danger">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={save.isPending}>Add</button>
        </div>
      </form>
    </div>
  );
}
