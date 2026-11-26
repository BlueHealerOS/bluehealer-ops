// Pure CRM model types. No framework, network or storage imports in src/crm/model/.
export type Owner = 'Santiago' | 'Jay';
export type Direction = 'outbound' | 'inbound' | 'two-way';
export type InteractionType = 'email' | 'call' | 'meeting' | 'event' | 'message' | 'broadcast';
export type Sensitivity = 'Normal' | 'Restricted';
export type Stage =
  | 'Mapped' | 'Targeted' | 'Intro pending' | 'Active' | 'Dormant' | 'Closed' | 'Do not contact'
  | 'Identified' | 'Contacted' | 'Meeting held' | 'Following up' | 'Committed' | 'Passed';

export interface CrmPerson {
  id: number;
  name: string;
  organizationId: number;
  relationshipType: string;
  owner: Owner;
  email?: string;
  importance?: number;
  comfort?: number;
  agreedCheckIn?: string;
  stage: Stage;
  sensitivity: Sensitivity;
  /** System fields, written only by the app or scripts. */
  lastTwoWayAt?: string;
  lastTouchAt?: string;
  lastDirection?: Direction;
  /** Hub path or import key. */
  sourceId?: string;
}
export interface CrmOrg { id: number; name: string; orgType?: string; domain?: string; relationshipToBH?: string; hubPath?: string }
export interface CrmInteraction {
  id: number;
  summary: string;
  date: string;
  type: InteractionType;
  direction: Direction;
  peopleIds: number[];
  organizationId?: number;
  followUpNeeded?: boolean;
  sourceLink?: string;
  /** The most restrictive sensitivity of the people involved. */
  sensitivity?: Sensitivity;
}

export interface RankingConfig {
  version: string;
  weights: { importance: number; recencyMax: number; recencyPerCadence: number; dueBonus: number };
  cadenceDays: Record<string, number> & { default: number };
  breachDays: { investor: number; advisor: number };
  defaultImportance: number;
  topN: number;
  upcomingDays: number;
  waitingOnDays: number;
  effectivenessWorkingDays: number;
  familyInvestorsRestricted: boolean;
  sharedDomains: string[];
  placeholderEmailPatterns: string[];
  changelog: { version: string; date: string; change: string }[];
}

export interface Ranked {
  person: CrmPerson;
  score: number;
  due: boolean;
  nextCheckIn: string | undefined;
  daysSince: number | undefined;
  reason: string;
}
