import type * as C from '../schema/choices';

type V<T extends readonly string[]> = T[number];

/** A decoded list item. Field names equal SharePoint column names. */
export interface Task {
  id: number;
  Title: string;
  Description?: string;
  Status: V<typeof C.TASK_STATUS>;
  Priority?: V<typeof C.PRIORITY>;
  DueDate?: string;
  StartDate?: string;
  EstimateMinutes?: number;
  Recurrence?: string;
  ContributionType?: V<typeof C.CONTRIBUTION>;
  MilestoneLookupId?: number;
  KeyResultLookupId?: number;
  ApplicationLookupId?: number;
  PersonLookupId?: number;
  WaitingOn?: string;
  WaitingExpected?: string;
  OutcomeNote?: string;
  DropReason?: string;
  Context?: V<typeof C.CONTEXT>;
  Effort?: V<typeof C.EFFORT>;
  ThisWeek?: boolean;
  TodayDate?: string;
  Agenda?: boolean;
  CompletedAt?: string;
  RecurrenceParentId?: number;
  Owner?: V<typeof C.OWNERS>;
  Sensitivity?: V<typeof C.SENSITIVITY>;
  Labels?: string;
  Track?: string[];
  Source?: V<typeof C.SOURCES>;
  ReminderOptIn?: boolean;
}

export interface Milestone {
  id: number;
  Title: string;
  Status?: V<typeof C.MILESTONE_STATUS>;
  TargetDate?: string;
  Owner?: V<typeof C.OWNERS>;
  Sensitivity?: V<typeof C.SENSITIVITY>;
  ReminderOptIn?: boolean;
}

export interface Person {
  id: number;
  Title: string;
  NextFollowUp?: string;
  LastContact?: string;
  CadenceDays?: number;
  Owner?: V<typeof C.OWNERS>;
  Sensitivity?: V<typeof C.SENSITIVITY>;
  ReminderOptIn?: boolean;
}

export interface Application {
  id: number;
  Title: string;
  Stage?: V<typeof C.APPLICATION_STAGES>;
  LoiDue?: string;
  FullDue?: string;
  ReportingDue?: string;
  Owner?: V<typeof C.OWNERS>;
  Sensitivity?: V<typeof C.SENSITIVITY>;
  ReminderOptIn?: boolean;
}

export type Founder = 'Santiago' | 'Jay';
