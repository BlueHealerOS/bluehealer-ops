export interface Account { name: string; username: string; tenantId: string }

/** The app talks to auth only through this interface, so tests can substitute a mock (e2e build mode only). */
export interface AuthAdapter {
  /** Resolve the signed-in account after a redirect, or null. */
  init(): Promise<Account | null>;
  signIn(): Promise<void>;
  signOut(): Promise<void>;
  getToken(scopes: string[]): Promise<string>;
}
