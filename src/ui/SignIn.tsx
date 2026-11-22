import { isConfigured } from '../config';

/** The only screen shown without a token. It contains no data and no names. */
export function SignIn({ onSignIn, busy }: { onSignIn: () => void; busy?: boolean }) {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="text-2xl font-semibold">BlueHealer Ops</h1>
      <p className="text-sm text-slate-700">This app is private to BlueHealer founders. Please sign in with your Microsoft work account.</p>
      <button className="btn btn-primary w-full" onClick={onSignIn} disabled={busy || !isConfigured && import.meta.env.MODE !== 'e2e'}>Sign in with Microsoft</button>
      {!isConfigured && import.meta.env.MODE !== 'e2e' && <p role="status" className="text-sm text-amber-900">This deployment is not configured yet. The tenant and client identifiers are still placeholders.</p>}
    </main>
  );
}

export function AccessDenied({ onSignOut }: { onSignOut: () => void }) {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="text-2xl font-semibold">Access denied</h1>
      <p role="alert" className="text-sm text-slate-700">SharePoint did not allow this account to open the founders' site. Please sign out and use a founder account.</p>
      <button className="btn" onClick={onSignOut}>Sign out</button>
    </main>
  );
}
