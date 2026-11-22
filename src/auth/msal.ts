import { InteractionRequiredAuthError, PublicClientApplication, type AccountInfo } from '@azure/msal-browser';
import { config } from '../config';
import { SCOPES } from '../graph/client';
import type { Account, AuthAdapter } from './types';

/** Authorization code flow with PKCE, single tenant, no client secret. Tokens live in sessionStorage only. */
export function createMsalAdapter(): AuthAdapter {
  const msal = new PublicClientApplication({
    auth: { clientId: config.clientId, authority: `https://login.microsoftonline.com/${config.tenantId}`, redirectUri: config.redirectUri },
    cache: { cacheLocation: 'sessionStorage' },
  });
  let account: AccountInfo | null = null;
  const toAccount = (a: AccountInfo): Account => ({ name: a.name ?? a.username, username: a.username, tenantId: a.tenantId });

  return {
    async init() {
      await msal.initialize();
      const res = await msal.handleRedirectPromise();
      account = res?.account ?? msal.getAllAccounts()[0] ?? null;
      if (account && account.tenantId !== config.tenantId) { // wrong tenant: treat as signed out
        account = null;
        return null;
      }
      if (account) msal.setActiveAccount(account);
      return account ? toAccount(account) : null;
    },
    async signIn() {
      await msal.loginRedirect({ scopes: [...SCOPES.core], prompt: 'select_account' });
    },
    async signOut() {
      await msal.logoutRedirect({ account: account ?? undefined, postLogoutRedirectUri: config.redirectUri });
    },
    async getToken(scopes) {
      if (!account) throw new Error('Not signed in');
      try {
        return (await msal.acquireTokenSilent({ scopes, account })).accessToken;
      } catch (e) {
        if (e instanceof InteractionRequiredAuthError) {
          await msal.acquireTokenRedirect({ scopes, account });
          return new Promise<string>(() => {}); // navigation in progress
        }
        throw e;
      }
    },
  };
}
