import type { AuthAdapter } from './types';

export async function createAuth(): Promise<AuthAdapter> {
  if (import.meta.env.MODE === 'e2e') {
    return (await import('./e2e')).createE2eAdapter();
  }
  return (await import('./msal')).createMsalAdapter();
}
