import { useOps } from './ctx';
import { useSaveSetting, useSettings } from './data';
import { TRACKS } from '../schema/choices';

export function SettingsPage() {
  const { founder, setFounder, account, signOut } = useOps();
  const { settings, raw } = useSettings();
  const save = useSaveSetting();
  return (
    <section className="max-w-2xl space-y-6" aria-labelledby="set-h">
      <h1 id="set-h" className="text-[1.75rem] md:text-display">Settings</h1>
      <nav aria-label="More" className="card flex flex-wrap gap-2 sm:hidden">
        {[['milestones', 'Milestones'], ['meetings', 'Meetings']].map(([h, l]) => <a key={h} className="btn" href={`#/${h}`}>{l}</a>)}
      </nav>
      <div className="card space-y-2">
        <h2>You</h2>
        <p className="text-sm">Signed in as {account.name}. Choose which founder you are, so My Today and reminders match your work. This is remembered on this device only.</p>
        <div className="flex gap-2">
          {(['Santiago', 'Jay'] as const).map((f) => <button key={f} className={`btn ${founder === f ? 'btn-primary' : ''}`} aria-pressed={founder === f} onClick={() => setFounder(f)}>{f}</button>)}
        </div>
      </div>
      <div className="card space-y-2">
        <h2>Today</h2>
        <label className="block text-sm" htmlFor="cap">Maximum tasks in Today</label>
        <input id="cap" type="number" min={1} max={20} className="input max-w-32" defaultValue={settings.todayCap} key={settings.todayCap}
          onBlur={(e) => { const v = Math.max(1, Math.min(20, Number(e.target.value) || 7)); if (v !== settings.todayCap) save.mutate({ key: 'todayCap', value: v, existingId: raw.get('todayCap')?.id }); }} />
      </div>
      <div className="card space-y-2">
        <h2>Digests</h2>
        <p className="text-sm">Digests are saved as Outlook drafts for you. When this is on, the daily digest flow sends the digest to the founders only. External email is never sent. Turn this on after about three weeks of accurate digests.</p>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={settings.sendInternalDigests} onChange={(e) => {
            if (e.target.checked && !confirm('Send internal digests to the founders only, without a draft step?')) return;
            save.mutate({ key: 'sendInternalDigests', value: e.target.checked, existingId: raw.get('sendInternalDigests')?.id });
          }} /> Send internal digests to founders
        </label>
      </div>
      <div className="card space-y-2">
        <h2>Lists and imports</h2>
        <p className="text-sm">One-time setup for the SharePoint lists, plus seeding and imports. Run these rarely, and always review the dry run first.</p>
        <a className="btn" href="#/admin">Open lists and imports</a>
      </div>
      <div className="card space-y-2">
        <h2>Account</h2>
        <p className="text-sm">Signed in as {account.name}.</p>
        <button className="btn" onClick={signOut}>Sign out</button>
      </div>
      <div className="card space-y-2">
        <h2>Tracks</h2>
        <p className="text-sm">These follow the hub knowledge folders.</p>
        <div className="flex flex-wrap gap-1">{TRACKS.map((t) => <span key={t} className="chip">{t}</span>)}</div>
      </div>
    </section>
  );
}
