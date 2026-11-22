import { createContext, useContext } from 'react';
import type { OpsStore } from '../graph/store';
import type { Account } from '../auth/types';
import type { Founder } from '../domain/types';

export interface Ops {
  store: OpsStore;
  account: Account;
  founder: Founder;
  setFounder: (f: Founder) => void;
  signOut: () => void;
  search: string;
  setSearch: (s: string) => void;
  quickAdd: () => void;
  openTask: (id: number | 'new' | null) => void;
}
export const OpsContext = createContext<Ops | null>(null);
export function useOps(): Ops {
  const v = useContext(OpsContext);
  if (!v) throw new Error('OpsContext missing');
  return v;
}
