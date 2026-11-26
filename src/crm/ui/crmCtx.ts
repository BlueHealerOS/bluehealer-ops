import { createContext, useContext } from 'react';
import type { CrmOrg, CrmPerson, Owner, RankingConfig, Stage } from '../model/types.ts';
import type { WithEtag } from '../graph/mappers.ts';
import type { CrmData, CrmService, LogResult, NewInteraction, NewPerson } from '../service.ts';

type Person = WithEtag<CrmPerson>;

/** Which sheet is open. Sheets are hosted once by the provider so any view can open one. */
export type SheetState =
  | { kind: 'log'; personId?: number }
  | { kind: 'snooze'; person: Person }
  | { kind: 'person'; person?: Person; organizationId?: number }
  | { kind: 'org' };

export interface Toast { id: number; text: string; action?: { label: string; run: () => void }; ms: number }

export interface CrmActions {
  logContact(i: NewInteraction): Promise<LogResult>;
  addPerson(i: NewPerson, opts?: { allowDuplicate?: boolean }): ReturnType<CrmService['addPerson']>;
  updatePerson(p: Person, patch: Parameters<CrmService['updatePerson']>[1]): Promise<Person>;
  snooze(p: Person, date: string): Promise<Person>;
  mute(p: Person): Promise<void>;
  setStage(p: Person, stage: Stage): Promise<Person>;
  addOrganization(i: Parameters<CrmService['addOrganization']>[0]): Promise<WithEtag<CrmOrg>>;
  recompute(): Promise<{ updated: number; failed: { personId: number; message: string }[] }>;
}
export interface CrmCtx {
  data: CrmData;
  cfg: RankingConfig;
  today: string;
  founder: Owner;
  fixture: boolean;
  actions: CrmActions;
  reload(): Promise<void>;
  notify(text: string, action?: Toast['action'], ms?: number): void;
  openSheet(s: SheetState | null): void;
}
export const Ctx = createContext<CrmCtx | null>(null);
export function useCrm(): CrmCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error('CrmProvider missing');
  return v;
}
