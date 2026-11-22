import type { AuthAdapter } from './types';

/** Test-only adapter. It is imported only when the build mode is "e2e"; production bundles never contain it. */
export function createE2eAdapter(): AuthAdapter {
  const KEY = 'e2e-account';
  const read = () => { try { return JSON.parse(sessionStorage.getItem(KEY) ?? 'null'); } catch { return null; } };
  return {
    async init() { return read(); },
    async signIn() { sessionStorage.setItem(KEY, JSON.stringify({ name: 'Test Founder', username: 'founder@example.test', tenantId: 'e2e' })); location.reload(); },
    async signOut() { sessionStorage.removeItem(KEY); location.reload(); },
    async getToken() { return 'e2e-token'; },
  };
}
